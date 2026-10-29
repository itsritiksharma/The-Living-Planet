import { describe, expect, it } from 'vitest';
import { ActionFactory } from '../../src/domain/actions/ActionFactory';
import { INDICATOR_KEYS } from '../../src/domain/model/types';
import { World } from '../../src/domain/model/World';
import { DTO, config } from '../helpers/fixtures';
import { createTestApp } from '../helpers/app';

const actions = new ActionFactory();

describe('PlayerView read model', () => {
  it('shows readiness but never another player’s pending choice', async () => {
    const { app, join, nextCommandId } = await createTestApp();
    const asha = await join('Asha');
    const ben = await join('Ben');
    await app.bus.dispatch({ kind: 'submitAction', commandId: nextCommandId(), playerId: asha.playerId, expectedTurn: 1, action: DTO.expandIndustry });
    const benView = await app.views.execute({ playerId: ben.playerId });
    const ashaView = await app.views.execute({ playerId: asha.playerId });
    expect(benView?.roster.find((r) => r.playerId === asha.playerId)).toMatchObject({ ready: true, connected: true });
    expect(benView?.you?.pendingAction).toBeNull();
    expect(Object.keys(benView?.roster[0] ?? {})).not.toContain('pendingAction');
    expect(ashaView?.you).toMatchObject({ pendingAction: DTO.expandIndustry, pendingLabel: 'Expand industry', canResolveNow: true, waitingFor: ['Ben'] });
  });

  it('keeps research reports private to the player who researched', async () => {
    const { app, join, nextCommandId } = await createTestApp();
    const asha = await join('Asha');
    const ben = await join('Ben');
    await app.bus.dispatch({ kind: 'submitAction', commandId: nextCommandId(), playerId: asha.playerId, expectedTurn: 1, action: DTO.inspect });
    await app.bus.dispatch({ kind: 'submitAction', commandId: nextCommandId(), playerId: ben.playerId, expectedTurn: 1, action: DTO.wait });
    const ashaView = await app.views.execute({ playerId: asha.playerId });
    const benView = await app.views.execute({ playerId: ben.playerId });
    const spectator = await app.views.execute({ playerId: null });
    expect(ashaView?.you?.report?.forecast).toHaveLength(config.forecast.turns);
    expect(ashaView?.you?.report?.disclaimer).toMatch(/not a real-world forecast/);
    expect(benView?.you?.report).toBeNull();
    for (const view of [benView, spectator]) expect(JSON.stringify(view)).not.toContain('Water next turn if everyone waits');
  });

  it('dashboard, map data and project panel all come from the same authoritative state', async () => {
    const { app, join, nextCommandId } = await createTestApp();
    const asha = await join('Asha');
    await app.bus.dispatch({ kind: 'submitAction', commandId: nextCommandId(), playerId: asha.playerId, expectedTurn: 1, action: DTO.expandFarm });
    const world = (await app.worlds.current())?.world;
    const view = await app.views.execute({ playerId: asha.playerId });
    if (!world || !view) throw new Error('missing state');
    for (const key of INDICATOR_KEYS) {
      expect(view.world.indicators.find((i) => i.key === key)?.value).toBe(world.indicators.get(key));
    }
    expect(view.world.structures.map((s) => s.id)).toEqual(world.structures().map((s) => s.id));
    expect(view.world.structures.find((s) => !s.isInitial)).toMatchObject({ kind: 'farm', ownerName: 'Asha', builtTurn: 1 });
    expect(view.world.capacity.farmPlots).toEqual({ used: 1, total: config.capacity.farmPlots });
    expect(view.world.project).toMatchObject({ funded: world.project.funded, target: world.project.target, status: 'open' });
    expect(view.world.history.map((e) => e.id)).toEqual(world.history().map((e) => e.id));
    expect(view.world.indicators.find((i) => i.key === 'food')?.breakdown.length).toBeGreaterThan(0);
  });

  it('lists every required action with the same cost and availability the server enforces', async () => {
    const { app, join } = await createTestApp();
    const asha = await join('Asha');
    const view = await app.views.execute({ playerId: asha.playerId });
    const world = (await app.worlds.current())?.world;
    if (!view?.you || !world) throw new Error('missing state');
    expect(view.you.actionOptions.map((o) => o.template.type)).toEqual([
      'EXPAND_PRODUCTION',
      'EXPAND_PRODUCTION',
      'CONSERVE_WATER',
      'RESTORE_WATERSHED',
      'INSPECT_SYSTEM',
      'CONTRIBUTE_TO_PROJECT',
      'WAIT',
    ]);
    for (const option of view.you.actionOptions) {
      const action = actions.fromDTO(option.template);
      expect(option.available, option.key).toBe(world.validate(asha.playerId, action).ok);
      if (option.cost !== null) expect(option.cost, option.key).toBe(action.cost(config));
      expect(option.immediate.length, option.key).toBeGreaterThan(0);
    }
    expect(view.you.actionOptions.filter((o) => o.reflective).map((o) => o.key)).toEqual(['expand_farm', 'expand_industry']);
    expect(view.you.actionOptions.find((o) => o.key === 'contribute')?.maxAmount).toBe(10);
  });

  it('explains known risks only when the rules justify them', async () => {
    const { app, join } = await createTestApp();
    const asha = await join('Asha');
    const calm = await app.views.execute({ playerId: asha.playerId });
    expect(calm?.world.knownRisks).toEqual([]);
    const stored = await app.worlds.current();
    if (!stored) throw new Error('no world');
    const snapshot = stored.world.toSnapshot();
    snapshot.indicators.water = 35;
    snapshot.historyPoints[0] = { turn: 0, indicators: { ...snapshot.indicators } };
    await app.worlds.update(World.fromSnapshot(snapshot, config), stored.revision);
    const risky = await app.views.execute({ playerId: asha.playerId });
    expect(risky?.world.knownRisks.join(' ')).toMatch(/Water is below 40/);
    expect(risky?.world.indicators.find((i) => i.key === 'water')?.band).toEqual({ level: 'stressed', label: 'Stressed' });
  });

  it('includes the end-of-scenario summary only once the scenario has ended', async () => {
    const { app, join, nextCommandId } = await createTestApp();
    const asha = await join('Asha');
    expect((await app.views.execute({ playerId: asha.playerId }))?.summary).toBeNull();
    for (let turn = 1; turn <= config.scenario.totalTurns; turn += 1) {
      await app.bus.dispatch({ kind: 'submitAction', commandId: nextCommandId(), playerId: asha.playerId, expectedTurn: turn, action: turn === 1 ? DTO.expandFarm : DTO.wait });
    }
    const view = await app.views.execute({ playerId: asha.playerId });
    expect(view?.summary).toMatchObject({ finalTurn: 16, endedEarly: false });
    expect(view?.summary?.tradeOffs.length).toBeGreaterThan(3);
    expect(view?.summary?.players[0]).toMatchObject({ displayName: 'Asha', built: { farm: 1 } });
    expect(view?.summary?.decisions).toHaveLength(16);
    expect(view?.you?.actionOptions).toEqual([]);
    expect(view?.world.project.statusLabel).toMatch(/^Never built/);
    expect(view?.world.knownRisks).toEqual([]);
  });
});
