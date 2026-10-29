import type { ClientMessage, ServerMessage } from '../../contracts/protocol';
import type { PlayerActionDTO, PlayerViewDTO } from '../../contracts/views';
import { createCommandId } from './commandId';
import type { SessionStore, StoredSession } from './SessionStore';

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'offline';

export interface ClientState {
  status: ConnectionStatus;
  view: PlayerViewDTO | null;
  session: StoredSession | null;
  error: { code: string; message: string } | null;
  notice: string | null;
  /** Commands sent but not yet acknowledged by the server. */
  inFlight: number;
}

/** The subset of the browser WebSocket the client uses (a fake implements it in tests). */
export type SocketLike = Pick<WebSocket, 'readyState' | 'send' | 'close' | 'onopen' | 'onclose' | 'onmessage' | 'onerror'>;

export interface GameClientOptions {
  url: string;
  createSocket: (url: string) => SocketLike;
  sessions: SessionStore;
  createCommandId?: () => string;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

const OPEN = 1;
type CommandMessage = Exclude<ClientMessage, { type: 'resume' }>;

/**
 * Client-side gateway to the authoritative server. Every command carries a fresh commandId and
 * stays in an outbox until acknowledged; after a reconnect the client resumes its session and
 * resends exactly the unacknowledged commands. That is safe because the server deduplicates by
 * commandId, so a command is applied at most once however often it is resent.
 */
export class GameClient {
  private state: ClientState;
  private socket: SocketLike | null = null;
  private readonly outbox = new Map<string, CommandMessage>();
  private readonly sentOnThisConnection = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private sessionBound = false;
  private attempts = 0;
  private timer: unknown = null;
  private stopped = true;

  constructor(private readonly options: GameClientOptions) {
    this.state = { status: 'connecting', view: null, session: options.sessions.load(), error: null, notice: null, inFlight: 0 };
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getState = (): ClientState => this.state;

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== null) (this.options.clearTimer ?? clearTimeout)(this.timer as ReturnType<typeof setTimeout>);
    this.timer = null;
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }

  join(displayName: string): void {
    if (this.state.session) return;
    this.enqueue({ type: 'join', commandId: this.newId(), displayName });
  }

  submitAction(action: PlayerActionDTO): void {
    const turn = this.state.view?.world.turn;
    if (turn !== undefined) this.enqueue({ type: 'submitAction', commandId: this.newId(), expectedTurn: turn, action });
  }

  cancelAction(): void {
    const turn = this.state.view?.world.turn;
    if (turn !== undefined) this.enqueue({ type: 'cancelAction', commandId: this.newId(), expectedTurn: turn });
  }

  resolveNow(): void {
    const turn = this.state.view?.world.turn;
    if (turn !== undefined) this.enqueue({ type: 'resolveTurn', commandId: this.newId(), turn });
  }

  startNewScenario(): void {
    const worldId = this.state.view?.world.id;
    if (worldId) this.enqueue({ type: 'startNewScenario', commandId: this.newId(), endedWorldId: worldId });
  }

  dismissError(): void {
    this.update({ error: null });
  }

  dismissNotice(): void {
    this.update({ notice: null });
  }

  private newId(): string {
    return (this.options.createCommandId ?? createCommandId)();
  }

  private enqueue(message: CommandMessage): void {
    this.outbox.set(message.commandId, message);
    this.update({ inFlight: this.outbox.size, error: null });
    this.flush();
  }

  /** Sends unacknowledged commands not yet sent on this connection. */
  private flush(): void {
    const socket = this.socket;
    if (!socket || socket.readyState !== OPEN) return;
    for (const message of this.outbox.values()) {
      if (this.sentOnThisConnection.has(message.commandId)) continue;
      if (message.type !== 'join' && !this.sessionBound) continue; // player commands wait for the session
      socket.send(JSON.stringify(message));
      this.sentOnThisConnection.add(message.commandId);
    }
  }

  private connect(): void {
    if (this.stopped) return;
    this.timer = null;
    this.sessionBound = false;
    this.sentOnThisConnection.clear();
    let socket: SocketLike;
    try {
      socket = this.options.createSocket(this.options.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    socket.onopen = () => {
      if (this.socket !== socket) return;
      const reconnected = this.attempts > 0;
      this.attempts = 0;
      this.update({ status: 'open', ...(reconnected ? { notice: 'Reconnected to the game server.' } : {}) });
      const session = this.state.session;
      if (session) socket.send(JSON.stringify({ type: 'resume', sessionToken: session.token } satisfies ClientMessage));
      else this.flush();
    };
    socket.onmessage = (event) => {
      if (this.socket === socket) this.receive(event.data);
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.scheduleReconnect();
    };
    socket.onerror = () => {
      // A close event always follows; reconnection is handled there.
    };
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    this.attempts += 1;
    this.update({ status: this.attempts > 3 ? 'offline' : 'reconnecting' });
    const delay = Math.min(8000, 500 * 2 ** (this.attempts - 1));
    this.timer = (this.options.setTimer ?? setTimeout)(() => this.connect(), delay);
  }

  private receive(data: unknown): void {
    let message: ServerMessage;
    try {
      message = JSON.parse(String(data)) as ServerMessage;
    } catch {
      return;
    }
    switch (message.type) {
      case 'welcome': {
        const session: StoredSession = {
          token: message.sessionToken,
          playerId: message.playerId,
          worldId: message.worldId,
          displayName: message.displayName,
        };
        this.options.sessions.save(session);
        if (message.commandId) this.acknowledge(message.commandId);
        this.sessionBound = true;
        this.update({ session });
        this.flush();
        break;
      }
      case 'state': {
        let session = this.state.session;
        if (session && message.view.you && message.view.world.id !== session.worldId) {
          session = { ...session, worldId: message.view.world.id };
          this.options.sessions.save(session);
        }
        this.update({ view: message.view, session });
        break;
      }
      case 'ack':
        this.acknowledge(message.commandId);
        break;
      case 'error': {
        if (message.commandId) this.acknowledge(message.commandId);
        if (message.code === 'SESSION_NOT_FOUND') {
          this.options.sessions.clear();
          for (const [id, pending] of this.outbox) if (pending.type !== 'join') this.outbox.delete(id);
          this.update({
            session: null,
            inFlight: this.outbox.size,
            notice: 'Your previous session has ended (the server may have restarted). Join again to continue.',
          });
          this.flush();
          return;
        }
        this.update({ error: { code: message.code, message: message.message } });
        break;
      }
    }
  }

  private acknowledge(commandId: string): void {
    this.outbox.delete(commandId);
    this.update({ inFlight: this.outbox.size });
  }

  private update(patch: Partial<ClientState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
}
