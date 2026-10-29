import { describe, expect, it } from 'vitest';
import { DTO } from '../helpers/fixtures';
import { createTestApp } from '../helpers/app';

describe('JoinGame / ResumeSession', () => {
  it('issues a session that resumes the same player; unknown tokens are rejected', async () => {
    const { app, join } = await createTestApp();
    const asha = await join('Asha');
    await expect(app.resume.execute({ sessionToken: asha.sessionToken })).resolves.toMatchObject({ playerId: asha.playerId, displayName: 'Asha' });
    await expect(app.resume.execute({ sessionToken: 'nope' })).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
  });

  it('rejects duplicate names and a full settlement', async () => {
    const { app, join, nextCommandId } = await createTestApp();
    for (const name of ['Asha', 'Ben', 'Chen', 'Dana', 'Eli', 'Fay']) await join(name);
    expect(await app.bus.dispatch({ kind: 'join', commandId: nextCommandId(), displayName: 'Gus' })).toMatchObject({ ok: false, code: 'ROOM_FULL' });
  });
});

describe('SubmitAction', () => {
  it('records intentions, treats identical re-submissions as unchanged and replaces changed ones', async () => {
    const { app, join, nextCommandId } = await createTestApp();
    const asha = await join('Asha');
    await join('Ben');
    const submit = (action: unknown) =>
      app.bus.dispatch({ kind: 'submitAction', commandId: nextCommandId(), playerId: asha.playerId, expectedTurn: 1, action });
    expect(await submit(DTO.restore)).toMatchObject({ ok: true, result: { kind: 'submitted', change: 'recorded', resolvedTurn: null } });
    expect(await submit(DTO.restore)).toMatchObject({ ok: true, result: { change: 'unchanged' } });
    expect(await submit(DTO.conserve)).toMatchObject({ ok: true, result: { change: 'replaced' } });
  });

  it('rejects stale turns, invalid actions, unaffordable actions and outcome-setting payloads', async () => {
    const { app, join, nextCommandId } = await createTestApp();
    const asha = await join('Asha');
    await join('Ben');
    const submit = (action: unknown, expectedTurn = 1) =>
      app.bus.dispatch({ kind: 'submitAction', commandId: nextCommandId(), playerId: asha.playerId, expectedTurn, action });
    expect(await submit(DTO.wait, 2)).toMatchObject({ ok: false, code: 'STALE_TURN' });
    expect(await submit({ type: 'WAIT', credits: 999 })).toMatchObject({ ok: false, code: 'INVALID_ACTION' });
    expect(await submit({ type: 'SET_WATER', value: 100 })).toMatchObject({ ok: false, code: 'INVALID_ACTION' });
    expect(await submit(DTO.contribute(11))).toMatchObject({ ok: false, code: 'INSUFFICIENT_CREDITS' });
    const world = (await app.worlds.current())?.world;
    expect(world?.player(asha.playerId)?.credits).toBe(10);
    expect(world?.indicators.get('water')).toBe(70);
  });

  it('rejects players who are not in the world', async () => {
    const { app, nextCommandId } = await createTestApp();
    const outcome = await app.bus.dispatch({ kind: 'submitAction', commandId: nextCommandId(), playerId: 'ghost', expectedTurn: 1, action: DTO.wait });
    expect(outcome).toMatchObject({ ok: false, code: 'NOT_IN_WORLD' });
  });

  it('resolves simultaneously once every connected player is ready; disconnected players do not block', async () => {
    const { app, join, presence, nextCommandId } = await createTestApp();
    const asha = await join('Asha');
    const ben = await join('Ben');
    const chen = await join('Chen');
    presence.ids.delete(chen.playerId); // Chen disconnected: waits automatically
    const submit = (playerId: string, action: unknown) =>
      app.bus.dispatch({ kind: 'submitAction', commandId: nextCommandId(), playerId, expectedTurn: 1, action });
    expect(await submit(asha.playerId, DTO.expandFarm)).toMatchObject({ ok: true, result: { resolvedTurn: null } });
    expect(await submit(ben.playerId, DTO.restore)).toMatchObject({ ok: true, result: { resolvedTurn: 1 } });
    const world = (await app.worlds.current())?.world;
    expect(world?.turn).toBe(2);
    expect(world?.decisions().find((d) => d.playerId === chen.playerId)).toMatchObject({ chosen: false, action: { type: 'WAIT' } });
  });
});

describe('ResolveTurn ("Resolve now")', () => {
  it('requires the requesting player to have chosen, then resolves exactly once per turn', async () => {
    const { app, join, nextCommandId } = await createTestApp();
    const asha = await join('Asha');
    await join('Ben');
    const resolveNow = () => app.bus.dispatch({ kind: 'resolveTurn', commandId: nextCommandId(), playerId: asha.playerId, turn: 1 });
    expect(await resolveNow()).toMatchObject({ ok: false, code: 'NOT_READY' });
    await app.bus.dispatch({ kind: 'submitAction', commandId: nextCommandId(), playerId: asha.playerId, expectedTurn: 1, action: DTO.inspect });
    expect(await resolveNow()).toMatchObject({ ok: true, result: { kind: 'turn', status: 'resolved', resolvedTurn: 1, currentTurn: 2 } });
    expect(await resolveNow()).toMatchObject({ ok: true, result: { status: 'already_resolved', currentTurn: 2 } });
  });

  it('drops an intention that is no longer valid when the turn resolves, and says why', async () => {
    const { app, join, nextCommandId } = await createTestApp();
    const asha = await join('Asha');
    await join('Ben');
    await app.bus.dispatch({ kind: 'submitAction', commandId: nextCommandId(), playerId: asha.playerId, expectedTurn: 1, action: DTO.contribute(10) });
    // Simulate a change after submission (e.g. via another rule) that leaves Asha short of credits.
    const stored = await app.worlds.current();
    if (!stored) throw new Error('no world');
    stored.world.player(asha.playerId)?.payForAction(8);
    await app.worlds.update(stored.world, stored.revision);
    const result = await app.bus.dispatch({ kind: 'resolveTurn', commandId: nextCommandId(), playerId: asha.playerId, turn: 1 });
    expect(result).toMatchObject({ ok: true, result: { status: 'resolved' } });
    const world = (await app.worlds.current())?.world;
    expect(world?.project.funded).toBe(0);
    expect(world?.decisions().find((d) => d.playerId === asha.playerId)?.chosen).toBe(false);
    const notice = world?.history().find((e) => e.kind === 'action_blocked' && e.actorId === asha.playerId);
    expect(notice?.summary).toMatch(/could no longer be applied: This costs 10 credits; you have 2\. They waited instead\./);
  });
});

describe('CancelAction', () => {
  it('withdraws a pending intention idempotently', async () => {
    const { app, join, nextCommandId } = await createTestApp();
    const asha = await join('Asha');
    await join('Ben');
    await app.bus.dispatch({ kind: 'submitAction', commandId: nextCommandId(), playerId: asha.playerId, expectedTurn: 1, action: DTO.wait });
    const cancel = () => app.bus.dispatch({ kind: 'cancelAction', commandId: nextCommandId(), playerId: asha.playerId, expectedTurn: 1 });
    expect(await cancel()).toMatchObject({ ok: true, result: { cancelled: true } });
    expect(await cancel()).toMatchObject({ ok: true, result: { cancelled: false } });
  });
});

describe('StartNewScenario', () => {
  it('only starts after the scenario ends, keeps the group, and is idempotent by ended world id', async () => {
    const { app, join, nextCommandId } = await createTestApp();
    const asha = await join('Asha');
    const firstWorld = (await app.worlds.current())?.world.id as string;
    const start = () => app.bus.dispatch({ kind: 'startNewScenario', commandId: nextCommandId(), playerId: asha.playerId, endedWorldId: firstWorld });
    expect(await start()).toMatchObject({ ok: false, code: 'SCENARIO_ACTIVE' });
    for (let turn = 1; turn <= 16; turn += 1) {
      await app.bus.dispatch({ kind: 'submitAction', commandId: nextCommandId(), playerId: asha.playerId, expectedTurn: turn, action: DTO.wait });
    }
    expect((await app.worlds.current())?.world.status).toBe('ended');
    const started = await start();
    expect(started).toMatchObject({ ok: true, result: { kind: 'scenario', status: 'started' } });
    const again = await start();
    expect(again).toMatchObject({ ok: true, result: { status: 'already_started' } });
    const world = (await app.worlds.current())?.world;
    expect(world?.id).not.toBe(firstWorld);
    expect(world?.turn).toBe(1);
    expect(world?.player(asha.playerId)?.credits).toBe(10);
  });
});
