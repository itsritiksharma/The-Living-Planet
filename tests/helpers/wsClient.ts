import WebSocket from 'ws';
import type { ServerMessage } from '../../src/contracts/protocol';
import type { PlayerViewDTO } from '../../src/contracts/views';

/** A scripted WebSocket client for end-to-end tests against the real gateway. */
export class TestClient {
  readonly messages: ServerMessage[] = [];

  private constructor(readonly socket: WebSocket) {
    socket.on('message', (data) => this.messages.push(JSON.parse(data.toString()) as ServerMessage));
  }

  static connect(url: string, headers: Record<string, string> = {}): Promise<TestClient> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url, { headers });
      const client = new TestClient(socket);
      socket.once('open', () => resolve(client));
      socket.once('error', reject);
    });
  }

  send(message: unknown): void {
    this.socket.send(typeof message === 'string' ? message : JSON.stringify(message));
  }

  /** Resolves with the first message at index ≥ `from` that matches. */
  waitFor<T extends ServerMessage = ServerMessage>(predicate: (m: ServerMessage) => boolean, from = 0, timeoutMs = 4000): Promise<T> {
    return new Promise((resolve, reject) => {
      const find = () => this.messages.slice(from).find(predicate) as T | undefined;
      const immediate = find();
      if (immediate) {
        resolve(immediate);
        return;
      }
      const onMessage = () => {
        const found = find();
        if (found) {
          cleanup();
          resolve(found);
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out; received: ${JSON.stringify(this.messages.slice(from).map((m) => m.type))}`));
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        this.socket.off('message', onMessage);
      };
      this.socket.on('message', onMessage);
    });
  }

  /** Sends a command and resolves with the reply carrying its commandId (or the next welcome/error for resume). */
  async request(message: { type: string; commandId?: string } & Record<string, unknown>): Promise<ServerMessage> {
    const from = this.messages.length;
    this.send(message);
    return this.waitFor(
      (m) =>
        (m.type === 'ack' || m.type === 'error' || m.type === 'welcome') &&
        (message.commandId ? 'commandId' in m && m.commandId === message.commandId : true),
      from,
    );
  }

  /** Waits for a state broadcast satisfying the predicate (searching from the latest messages). */
  waitForState(predicate: (view: PlayerViewDTO) => boolean, from = 0): Promise<PlayerViewDTO> {
    return this.waitFor<Extract<ServerMessage, { type: 'state' }>>((m) => m.type === 'state' && predicate(m.view), from).then(
      (m) => m.view,
    );
  }

  close(): Promise<number> {
    return new Promise((resolve) => {
      if (this.socket.readyState === WebSocket.CLOSED) {
        resolve(1000);
        return;
      }
      this.socket.once('close', (code) => resolve(code));
      this.socket.close();
    });
  }

  closed(): Promise<number> {
    return new Promise((resolve) => this.socket.once('close', (code) => resolve(code)));
  }
}
