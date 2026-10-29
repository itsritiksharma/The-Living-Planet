import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { attachGameServer, type GameServer } from '../../src/infrastructure/composition/attachGameServer';
import { DTO } from '../helpers/fixtures';
import { SilentLogger } from '../helpers/app';
import { TestClient } from '../helpers/wsClient';

let server: Server;
let game: GameServer;
let url: string;
let origin: string;
const clients: TestClient[] = [];

async function connect(headers: Record<string, string> = {}): Promise<TestClient> {
  const client = await TestClient.connect(url, headers);
  clients.push(client);
  return client;
}

async function joinAs(name: string, commandId: string) {
  const client = await connect();
  const welcome = await client.request({ type: 'join', commandId, displayName: name });
  if (welcome.type !== 'welcome') throw new Error(`join failed: ${JSON.stringify(welcome)}`);
  return { client, welcome };
}

beforeEach(async () => {
  server = createServer();
  game = attachGameServer(server, { logger: new SilentLogger(), heartbeatMs: 60_000 });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  await game.ready;
  const { port } = server.address() as AddressInfo;
  url = `ws://127.0.0.1:${port}/ws`;
  origin = `http://127.0.0.1:${port}`;
});

afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
  await game.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('WebSocket gateway (real server, real sockets)', () => {
  it('sends a public view on connect, then a personal view after joining', async () => {
    const client = await connect();
    const spectator = await client.waitForState(() => true);
    expect(spectator.you).toBeNull();
    expect(spectator.world.turn).toBe(1);
    const welcome = await client.request({ type: 'join', commandId: 'cmd-join-asha-01', displayName: 'Asha' });
    expect(welcome).toMatchObject({ type: 'welcome', displayName: 'Asha', replayed: false });
    const view = await client.waitForState((v) => v.you !== null);
    expect(view.you?.displayName).toBe('Asha');
  });

  it('plays a shared, server-authoritative turn between two players', async () => {
    const asha = await joinAs('Asha', 'cmd-join-asha-02');
    const ben = await joinAs('Ben', 'cmd-join-ben-002');
    const ack = await asha.client.request({ type: 'submitAction', commandId: 'cmd-asha-turn-1', expectedTurn: 1, action: DTO.wait });
    expect(ack).toMatchObject({ type: 'ack', result: { kind: 'submitted', change: 'recorded', resolvedTurn: null } });
    await ben.client.waitForState((v) => v.roster.some((r) => r.displayName === 'Asha' && r.ready));
    const resolved = await ben.client.request({ type: 'submitAction', commandId: 'cmd-ben-turn-01', expectedTurn: 1, action: DTO.expandFarm });
    expect(resolved).toMatchObject({ type: 'ack', result: { resolvedTurn: 1 } });
    const [ashaView, benView] = await Promise.all([
      asha.client.waitForState((v) => v.world.turn === 2),
      ben.client.waitForState((v) => v.world.turn === 2),
    ]);
    expect(ashaView.world.indicators).toEqual(benView.world.indicators);
    expect(ashaView.world.structures.find((s) => !s.isInitial)).toMatchObject({ kind: 'farm', ownerName: 'Ben' });
    const stale = await asha.client.request({ type: 'submitAction', commandId: 'cmd-asha-stale1', expectedTurn: 1, action: DTO.wait });
    expect(stale).toMatchObject({ type: 'error', code: 'STALE_TURN' });
  });

  it('resumes a player after reconnecting, and a resent join never duplicates a player', async () => {
    const asha = await joinAs('Asha', 'cmd-join-asha-03');
    await asha.client.close();
    const back = await connect();
    const resumed = await back.request({ type: 'resume', sessionToken: asha.welcome.type === 'welcome' ? asha.welcome.sessionToken : '' });
    expect(resumed).toMatchObject({ type: 'welcome', playerId: asha.welcome.type === 'welcome' ? asha.welcome.playerId : '' });

    // Cara's welcome is "lost" (she disconnects); she reconnects and resends the same join command.
    const cara = await joinAs('Cara', 'cmd-join-cara-01');
    await cara.client.close();
    const caraAgain = await connect();
    const replay = await caraAgain.request({ type: 'join', commandId: 'cmd-join-cara-01', displayName: 'Cara' });
    expect(replay).toMatchObject({ type: 'welcome', replayed: true });
    if (replay.type !== 'welcome' || cara.welcome.type !== 'welcome') throw new Error('expected welcomes');
    expect(replay.playerId).toBe(cara.welcome.playerId);
    expect(replay.sessionToken).toBe(cara.welcome.sessionToken);
    const view = await back.waitForState((v) => v.roster.length === 2 && v.roster.every((r) => r.connected));
    expect(view.roster.map((r) => r.displayName)).toEqual(['Asha', 'Cara']);
    expect(await back.request({ type: 'resume', sessionToken: 'not-a-token' })).toMatchObject({ type: 'error', code: 'SESSION_NOT_FOUND' });
  });

  it('rejects malformed messages and attempts to send outcomes or resources', async () => {
    const asha = await joinAs('Asha', 'cmd-join-asha-04');
    const from = asha.client.messages.length;
    asha.client.send('not json');
    expect(await asha.client.waitFor((m) => m.type === 'error', from)).toMatchObject({ code: 'BAD_MESSAGE' });
    const tampered = await asha.client.request({ type: 'submitAction', commandId: 'cmd-tamper-0001', expectedTurn: 1, action: DTO.wait, credits: 999 });
    expect(tampered).toMatchObject({ type: 'error', code: 'BAD_MESSAGE', message: expect.stringMatching(/Unexpected field/) });
    const fakeOutcome = await asha.client.request({ type: 'submitAction', commandId: 'cmd-tamper-0002', expectedTurn: 1, action: { type: 'WAIT', water: 100 } });
    expect(fakeOutcome).toMatchObject({ type: 'error', code: 'INVALID_ACTION' });
    const view = await asha.client.waitForState((v) => v.you !== null);
    expect(view.you?.credits).toBe(10);
    expect(view.world.indicators.find((i) => i.key === 'water')?.value).toBe(70);
  });

  it('requires joining before acting', async () => {
    const client = await connect();
    expect(await client.request({ type: 'submitAction', commandId: 'cmd-nojoin-0001', expectedTurn: 1, action: DTO.wait })).toMatchObject({
      type: 'error',
      code: 'NOT_JOINED',
    });
  });

  it('closes connections that exceed the message size limit', async () => {
    const client = await connect();
    const closed = client.closed();
    client.send(JSON.stringify({ type: 'join', commandId: 'cmd-big-000001', displayName: 'x'.repeat(5000) }));
    expect(await closed).toBe(1009);
  });

  it('refuses cross-origin browser connections but accepts same-origin ones', async () => {
    await expect(TestClient.connect(url, { Origin: 'http://evil.example' })).rejects.toThrow(/403/);
    const sameOrigin = await connect({ Origin: origin });
    expect(await sameOrigin.waitForState(() => true)).toBeDefined();
  });
});
