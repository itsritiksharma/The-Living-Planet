import { randomUUID } from 'node:crypto';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import type { ChangeNotifier, Logger } from '../../application/ports/runtime';
import type { GetPlayerView } from '../../application/usecases/GetPlayerView';
import { MAX_MESSAGE_BYTES, WEBSOCKET_PATH } from '../../contracts/protocol';
import type { ClientConnection, ConnectionRegistry } from './ConnectionRegistry';
import type { GameController } from './GameController';

export interface GatewayOptions {
  path?: string;
  heartbeatMs?: number;
  logger: Logger;
}

/**
 * Frameworks-and-drivers edge: WebSocket upgrades on one path, connection lifecycle, heartbeats,
 * and pushing each connection its own view after the world changes. Changes within one tick are
 * coalesced into a single broadcast.
 */
export class WebSocketGateway implements ChangeNotifier {
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
  private readonly sockets = new Map<string, WebSocket>();
  private readonly alive = new WeakMap<WebSocket, boolean>();
  private readonly path: string;
  private controller: GameController | null = null;
  private views: GetPlayerView | null = null;
  private httpServer: Server | null = null;
  private heartbeat: NodeJS.Timeout | null = null;
  private broadcastScheduled = false;
  private broadcasting: Promise<void> = Promise.resolve();

  constructor(
    private readonly registry: ConnectionRegistry,
    private readonly options: GatewayOptions,
  ) {
    this.path = options.path ?? WEBSOCKET_PATH;
  }

  /** Late binding breaks the construction cycle: use cases need this notifier, the controller needs the use cases. */
  bind(deps: { controller: GameController; views: GetPlayerView }): void {
    this.controller = deps.controller;
    this.views = deps.views;
  }

  attach(httpServer: Server): void {
    this.httpServer = httpServer;
    httpServer.on('upgrade', this.onUpgrade);
    httpServer.once('close', () => void this.close());
    this.heartbeat = setInterval(() => this.checkHeartbeats(), this.options.heartbeatMs ?? 30_000);
    this.heartbeat.unref();
  }

  worldChanged(): void {
    if (this.broadcastScheduled) return;
    this.broadcastScheduled = true;
    setImmediate(() => {
      this.broadcastScheduled = false;
      this.broadcasting = this.broadcasting.then(() => this.broadcast()).catch((caught) => {
        this.options.logger.error('Broadcast failed', caught);
      });
    });
  }

  /** Resolves once any scheduled broadcast has been sent (useful for orderly shutdown and tests). */
  async flush(): Promise<void> {
    await new Promise((resolve) => setImmediate(resolve));
    await this.broadcasting;
  }

  async close(): Promise<void> {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    this.httpServer?.off('upgrade', this.onUpgrade);
    for (const socket of this.wss.clients) socket.terminate();
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
  }

  private readonly onUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (pathname !== this.path) return; // not ours (e.g. Vite's hot-reload socket)
    if (!isSameOrigin(request)) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    this.wss.handleUpgrade(request, socket, head, (ws) => this.onConnection(ws));
  };

  private onConnection(ws: WebSocket): void {
    const controller = this.controller;
    if (!controller) {
      ws.close(1011, 'Server not ready');
      return;
    }
    const id = randomUUID();
    const connection: ClientConnection = {
      id,
      send: (message) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
      },
    };
    this.registry.add(connection);
    this.sockets.set(id, ws);
    this.alive.set(ws, true);
    ws.on('pong', () => this.alive.set(ws, true));
    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        connection.send({ type: 'error', code: 'BAD_MESSAGE', message: 'Binary messages are not supported.' });
        return;
      }
      void controller.receive(id, data.toString()).catch((caught) => {
        this.options.logger.error('Failed to handle a message', caught);
        connection.send({ type: 'error', code: 'INTERNAL', message: 'Something went wrong on the server.' });
      });
    });
    ws.on('close', () => {
      this.sockets.delete(id);
      controller.forget(id);
      if (this.registry.remove(id)) this.worldChanged();
    });
    ws.on('error', (caught) => this.options.logger.warn(`WebSocket error: ${String(caught)}`));
    // A not-yet-joined connection gets the public view, so the join screen can show the scenario status.
    void this.views?.execute({ playerId: null }).then((view) => {
      if (view) connection.send({ type: 'state', view });
    });
  }

  private async broadcast(): Promise<void> {
    const views = this.views;
    if (!views) return;
    for (const entry of this.registry.all()) {
      const view = await views.execute({ playerId: entry.playerId });
      if (view) entry.connection.send({ type: 'state', view });
    }
  }

  private checkHeartbeats(): void {
    for (const ws of this.sockets.values()) {
      if (this.alive.get(ws) === false) {
        ws.terminate();
        continue;
      }
      this.alive.set(ws, false);
      ws.ping();
    }
  }
}

/** Blocks cross-site WebSocket hijacking: a browser page may only connect from the same origin. */
export function isSameOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  if (!origin) return true; // non-browser clients (tests, scripts) send no Origin
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}
