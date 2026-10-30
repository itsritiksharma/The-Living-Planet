import { describe, expect, it } from 'vitest';
import type { PlayerActionDTO, WorldSnapshot } from '../../src/domain/model/types';
import { World } from '../../src/domain/entities/World';
import { actionFactory, config, DTO, newWorld, resolve, withIndicators } from '../helpers/fixtures';

const lineAmount = (world: World, key: 'water' | 'ecosystemHealth' | 'pollution', prefix: string): number | undefined =>
  world.lastBreakdown?.indicators[key].lines.find((l) => l.label.startsWith(prefix))?.amount;

/** Plays turns choosing p1's action from the current world (others wait); returns every world. */
function playTurns(start: World, choose: (world: World) => PlayerActionDTO, turns: number): World[] {
  const worlds = [start];
  let current = start;
  for (let i = 0; i < turns && current.isActive; i += 1) {
    current = resolve(current, { p1: choose(current) });
    worlds.push(current);
  }
  return worlds;
}

const allowed = (world: World, dto: PlayerActionDTO): boolean => world.validate('p1', actionFactory.fromDTO(dto)).ok;

describe('Delayed consequences', () => {
  it('restoration has no immediate effect and adds ecosystem health on turns t+1 … t+4 only', () => {
    const worlds = playTurns(newWorld(), (w) => (w.turn === 1 ? DTO.restore : DTO.wait), 6);
    const growth = worlds.slice(1).map((w) => lineAmount(w, 'ecosystemHealth', 'Restoration growth') ?? 0);
    expect(growth).toEqual([0, 2, 2, 2, 2, 0]);
    const delayedTurns = worlds[6]?.history().filter((e) => e.kind === 'delayed_effect').map((e) => e.turn);
    expect(delayedTurns).toEqual([2, 3, 4, 5]);
  });

  it('the wetland is built two turns after funding; benefits apply only after completion', () => {
    const funded = resolve(newWorld(['Asha', 'Ben', 'Chen']), { p1: DTO.contribute(8), p2: DTO.contribute(8), p3: DTO.contribute(8) });
    expect(funded.project.status).toBe('in_progress');
    expect(funded.project.completesTurn).toBe(3);
    const turn2 = resolve(funded, {});
    expect(turn2.project.status).toBe('in_progress');
    const turn3 = resolve(turn2, {});
    expect(turn3.project.status).toBe('completed');
    expect(lineAmount(turn3, 'ecosystemHealth', 'Wetland completed')).toBe(config.project.completionEcosystem);
    expect(lineAmount(turn3, 'water', 'Wetland storage')).toBeUndefined();
    const turn4 = resolve(turn3, {});
    expect(lineAmount(turn4, 'water', 'Wetland storage')).toBe(config.project.rechargeBonus);
    expect(lineAmount(turn4, 'pollution', 'Wetland filtration')).toBe(-config.project.pollutionFiltration);
  });

  it('early expansion pays off at once but crosses the pollution threshold turns later; the log names every source', () => {
    const worlds = playTurns(newWorld(), (w) => (allowed(w, DTO.expandIndustry) ? DTO.expandIndustry : DTO.wait), 10);
    const turnOne = worlds[1] as World;
    expect(lineAmount(turnOne, 'pollution', 'Industry emissions')).toBeCloseTo(3 * config.industry.pollution, 9);
    expect(turnOne.indicators.get('pollution')).toBeLessThan(config.thresholds.pollution.damage);
    const last = worlds[worlds.length - 1] as World;
    const crossing = last.history().find((e) => e.kind === 'threshold' && e.summary.startsWith('Pollution passed the damage threshold'));
    expect(crossing).toBeDefined();
    expect(crossing?.turn).toBeGreaterThan(3);
    expect(crossing?.causes.join(' ')).toMatch(/Asha built \d+ \(turns 1, 2/);
    expect(crossing?.causes.join(' ')).toMatch(/2 original/);
  });
});

describe('Reinforcing feedback loop: water stress → over-extraction → weaker watershed → lower recharge', () => {
  const stressedStart = (): World => {
    const snapshot: WorldSnapshot = withIndicators(newWorld(), { water: 35, ecosystemHealth: 60, pollution: 30 }).toSnapshot();
    const player = snapshot.players.p1;
    if (player) player.credits = 40; // isolate the loop from the player's budget
    return World.fromSnapshot(snapshot, config);
  };

  it('keeps reinforcing itself when nobody responds', () => {
    const worlds = playTurns(stressedStart(), () => DTO.wait, 6);
    for (const world of worlds.slice(1)) {
      expect(lineAmount(world, 'ecosystemHealth', 'Over-extraction')).toBeLessThan(0);
      expect(world.indicators.get('water')).toBeLessThan(config.thresholds.water.stress);
    }
    const watershed = worlds.slice(1).map((w) => w.lastBreakdown?.watershedFactor ?? 0);
    for (let i = 1; i < watershed.length; i += 1) expect(watershed[i]).toBeLessThan(watershed[i - 1] as number);
  });

  it('is interrupted by conservation: water recovers above the threshold and the damage stops', () => {
    const worlds = playTurns(stressedStart(), (w) => (allowed(w, DTO.conserve) ? DTO.conserve : DTO.wait), 8);
    const recoveredAt = worlds.findIndex((w, i) => i > 0 && w.indicators.get('water') >= config.thresholds.water.stress);
    expect(recoveredAt).toBeGreaterThan(0);
    const after = worlds.slice(recoveredAt + 1);
    expect(after.length).toBeGreaterThan(0);
    for (const world of after) expect(lineAmount(world, 'ecosystemHealth', 'Over-extraction')).toBeUndefined();
    const ecoLow = Math.min(...worlds.map((w) => w.indicators.get('ecosystemHealth')));
    expect((worlds[worlds.length - 1] as World).indicators.get('ecosystemHealth')).toBeGreaterThan(ecoLow);
    expect(worlds[recoveredAt]?.history().some((e) => e.summary.startsWith('Water recovered above its stress threshold'))).toBe(true);
  });
});

describe('Threshold rules fire only when their conditions are met', () => {
  it('a crossing event appears only on the turn the value actually crosses', () => {
    // Turn 2 is Summer (recharge ×0.6): from 41.0 with full demand, water drops below 40 in one turn.
    const start = withIndicators(resolve(newWorld(), {}), { water: 41 });
    const crossed = resolve(start, {});
    expect(crossed.indicators.get('water')).toBeLessThan(40);
    const thresholds = crossed.history().filter((e) => e.turn === 2 && e.kind === 'threshold');
    expect(thresholds.map((e) => e.summary)).toEqual([expect.stringMatching(/^Water fell below its stress threshold \(40\)/)]);
    // Effects use start-of-turn values: no over-extraction on the crossing turn…
    expect(lineAmount(crossed, 'ecosystemHealth', 'Over-extraction')).toBeUndefined();
    // …but on the next turn, which does not report the crossing again.
    const next = resolve(crossed, {});
    expect(lineAmount(next, 'ecosystemHealth', 'Over-extraction')).toBe(-config.ecosystem.overExtractionStress);
    expect(next.history().filter((e) => e.turn === 3 && e.summary.startsWith('Water fell'))).toHaveLength(0);
  });

  it('a calm turn produces no threshold, condition, warning or shortfall events', () => {
    const kinds = resolve(newWorld(), {}).history().map((e) => e.kind);
    for (const kind of ['threshold', 'condition', 'warning', 'shortfall'] as const) expect(kinds).not.toContain(kind);
  });

  it('shortages raise living costs for every player', () => {
    const after = resolve(withIndicators(newWorld(['Asha', 'Ben']), { water: 30, food: 20 }), {});
    for (const id of ['p1', 'p2']) expect(after.player(id)?.totals.hardshipPaid).toBe(2);
    expect(after.history().some((e) => e.kind === 'condition' && e.causes.some((c) => c.includes('raised living costs')))).toBe(true);
  });
});
