import type { Server } from 'node:http';
import type { Logger as ViteLogger, Plugin } from 'vite';
import type { Logger } from '../../application/ports/runtime';
import { WEBSOCKET_PATH } from '../../contracts/protocol';
import { attachGameServer, type GameServerOptions } from '../composition/attachGameServer';

/**
 * Hosts the authoritative game server on Vite's own HTTP server (dev and preview), so one command
 * serves the page and the WebSocket on one port. The server code itself does not depend on Vite.
 */
export function livingPlanetGameServer(options: Omit<GameServerOptions, 'logger'> = {}): Plugin {
  const start = (httpServer: unknown, viteLogger: ViteLogger): void => {
    if (!httpServer) {
      viteLogger.warn('[living-planet] No HTTP server (middleware mode): the game server was not started.');
      return;
    }
    const logger = adapt(viteLogger);
    const server = attachGameServer(httpServer as Server, { ...options, logger });
    void server.ready.then((worldId) =>
      viteLogger.info(`  ➜  Game server: WebSocket at ${WEBSOCKET_PATH}, world ${worldId} (in-memory, resets on restart)`),
    );
  };
  return {
    name: 'living-planet-game-server',
    configureServer(server) {
      start(server.httpServer, server.config.logger);
    },
    configurePreviewServer(server) {
      start(server.httpServer, server.config.logger);
    },
  };
}

function adapt(logger: ViteLogger): Logger {
  return {
    info: (message) => logger.info(`[living-planet] ${message}`),
    warn: (message) => logger.warn(`[living-planet] ${message}`),
    error: (message, error) => logger.error(`[living-planet] ${message}${error ? `: ${String(error)}` : ''}`),
  };
}
