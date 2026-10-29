import { describe, expect, it } from 'vitest';
import { ConcurrencyError } from '../../src/application/errors';
import { GameCommandBus, type CommandHandlers } from '../../src/application/GameCommandBus';
import type { JoinGame } from '../../src/application/usecases/JoinGame';
import { InMemoryIdempotencyStore } from '../../src/infrastructure/persistence/InMemoryIdempotencyStore';
import { DTO } from '../helpers/fixtures';
import { createTestApp, SilentLogger } from '../helpers/app';

describe('Idempotent command bus', () => {
  it('a retried join with the same commandId returns the original player instead of creating a duplicate', async () => {
    const { app } = await createTestApp();
    const command = { kind: 'join' as const, commandId: 'join-0001-retry', displayName: 'Asha' };
    const first = await app.bus.dispatch(command);
    const retry = await app.bus.dispatch(command);
    expect(first).toMatchObject({ ok: true, replayed: false });
    expect(retry).toMatchObject({ ok: true, replayed: true });
    if (!first.ok || !retry.ok) throw new Error('expected success');
    expect(retry.result).toEqual(first.result);
    const world = (await app.worlds.current())?.world;
    expect(world?.players()).toHaveLength(1);
  });

  it('rejects a commandId reused for a different request', async () => {
    const { app } = await createTestApp();
    await app.bus.dispatch({ kind: 'join', commandId: 'join-0002-reuse', displayName: 'Asha' });
    const reused = await app.bus.dispatch({ kind: 'join', commandId: 'join-0002-reuse', displayName: 'Ben' });
    expect(reused).toMatchObject({ ok: false, code: 'IDEMPOTENCY_KEY_REUSED' });
  });

  it('replays deterministic rejections too, without re-executing', async () => {
    const { app } = await createTestApp();
    const bad = { kind: 'join' as const, commandId: 'join-0003-bad', displayName: '   ' };
    const first = await app.bus.dispatch(bad);
    const again = await app.bus.dispatch(bad);
    expect(first).toMatchObject({ ok: false, code: 'INVALID_NAME', replayed: false });
    expect(again).toMatchObject({ ok: false, code: 'INVALID_NAME', replayed: true });
  });

  it('a replayed submission does not double-charge or double-apply', async () => {
    const { app, join, nextCommandId } = await createTestApp();
    const asha = await join('Asha');
    await join('Ben'); // keeps the turn open after Asha submits
    const submit = { kind: 'submitAction' as const, commandId: nextCommandId(), playerId: asha.playerId, expectedTurn: 1, action: DTO.expandIndustry };
    await app.bus.dispatch(submit);
    await app.bus.dispatch(submit);
    await app.bus.dispatch({ kind: 'resolveTurn', commandId: nextCommandId(), playerId: asha.playerId, turn: 1 });
    await app.bus.dispatch({ kind: 'resolveTurn', commandId: nextCommandId(), playerId: asha.playerId, turn: 1 });
    const world = (await app.worlds.current())?.world;
    expect(world?.turn).toBe(2);
    expect(world?.ownedCount(asha.playerId, 'industry')).toBe(1);
    expect(world?.player(asha.playerId)?.totals.spentOnActions).toBe(6);
  });

  it('serializes concurrent commands so they never interleave', async () => {
    const { app } = await createTestApp();
    const outcomes = await Promise.all(
      ['Asha', 'Ben', 'Chen', 'Dana'].map((name, i) => app.bus.dispatch({ kind: 'join', commandId: `join-concurrent-${i}`, displayName: name })),
    );
    expect(outcomes.every((o) => o.ok)).toBe(true);
    const world = (await app.worlds.current())?.world;
    expect(world?.players().map((p) => p.joinOrder)).toEqual([1, 2, 3, 4]);
  });

  it('retries once after an optimistic-concurrency conflict and does not cache unexpected errors', async () => {
    let calls = 0;
    const flakyJoin = {
      execute: async () => {
        calls += 1;
        if (calls === 1) throw new ConcurrencyError('moved on');
        if (calls === 2) return { playerId: 'p', sessionToken: 't', worldId: 'w', displayName: 'Asha' };
        throw new Error('boom');
      },
    } as unknown as JoinGame;
    const logger = new SilentLogger();
    const bus = new GameCommandBus({ handlers: { join: flakyJoin } as unknown as CommandHandlers, idempotency: new InMemoryIdempotencyStore(), logger });
    expect(await bus.dispatch({ kind: 'join', commandId: 'join-flaky-01', displayName: 'Asha' })).toMatchObject({ ok: true });
    expect(calls).toBe(2);
    const failing = await bus.dispatch({ kind: 'join', commandId: 'join-flaky-02', displayName: 'Ben' });
    expect(failing).toMatchObject({ ok: false, code: 'INTERNAL' });
    await bus.dispatch({ kind: 'join', commandId: 'join-flaky-02', displayName: 'Ben' });
    expect(calls).toBe(4); // the INTERNAL failure was not cached, so the retry executed again
    expect(logger.errors.length).toBe(2);
  });
});
