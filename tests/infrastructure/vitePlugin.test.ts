import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { describe, expect, it } from 'vitest';
import { livingPlanetGameServer } from '../../src/infrastructure/vite/livingPlanetPlugin';
import { TestClient } from '../helpers/wsClient';

describe('Vite plugin', () => {
  it('serves the game WebSocket on the same HTTP server as the page', async () => {
    const vite = await createServer({
      configFile: false,
      root: fileURLToPath(new URL('../..', import.meta.url)),
      logLevel: 'silent',
      plugins: [livingPlanetGameServer()],
      server: { port: 0, host: '127.0.0.1', hmr: false, watch: null },
    });
    await vite.listen();
    try {
      const { port } = vite.httpServer?.address() as AddressInfo;
      const client = await TestClient.connect(`ws://127.0.0.1:${port}/ws`);
      const view = await client.waitForState(() => true);
      expect(view.scenario.name).toBe('The River Valley');
      const welcome = await client.request({ type: 'join', commandId: 'cmd-vite-join-01', displayName: 'Asha' });
      expect(welcome).toMatchObject({ type: 'welcome', displayName: 'Asha' });
      const page = await fetch(`http://127.0.0.1:${port}/`);
      expect(await page.text()).toContain('<div id="root">');
      await client.close();
    } finally {
      await vite.close();
    }
  });
});
