import type { Server } from 'node:http';
import type { IdGenerator, Logger } from '../../application/ports/runtime';
import type { SimulationConfig } from '../../domain/config/riverValley';
import { ConsoleLogger } from '../runtime/runtimeAdapters';
import { ConnectionRegistry } from '../transport/ConnectionRegistry';
import { GameController } from '../transport/GameController';
import { WebSocketGateway } from '../transport/WebSocketGateway';
import { createGameApplication, type GameApplication } from './createGameApplication';

export interface GameServerOptions {
  config?: SimulationConfig;
  ids?: IdGenerator;
  logger?: Logger;
  path?: string;
  heartbeatMs?: number;
}

export interface GameServer {
  application: GameApplication;
  gateway: WebSocketGateway;
  /** Resolves once the initial world exists. */
  ready: Promise<string>;
  close(): Promise<void>;
}

/** Attaches the authoritative game server to an existing HTTP server (Vite's, or a plain one in tests). */
export function attachGameServer(httpServer: Server, options: GameServerOptions = {}): GameServer {
  const logger = options.logger ?? new ConsoleLogger();
  const registry = new ConnectionRegistry();
  const gateway = new WebSocketGateway(registry, {
    logger,
    ...(options.path ? { path: options.path } : {}),
    ...(options.heartbeatMs ? { heartbeatMs: options.heartbeatMs } : {}),
  });
  const application = createGameApplication({
    presence: registry,
    notifier: gateway,
    logger,
    ...(options.config ? { config: options.config } : {}),
    ...(options.ids ? { ids: options.ids } : {}),
  });
  const controller = new GameController({
    bus: application.bus,
    resume: application.resume,
    registry,
    notifier: gateway,
    logger,
  });
  gateway.bind({ controller, views: application.views });
  gateway.attach(httpServer);
  const ready = application.initialize.execute().then((stored) => stored.world.id);
  return { application, gateway, ready, close: () => gateway.close() };
}
