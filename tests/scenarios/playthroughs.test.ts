import { describe, expect, it } from 'vitest';
import type { World } from '../../src/domain/model/World';
import { newWorld } from '../helpers/fixtures';
import { balanced, coordinated, expansionist, playScenario, steward, waiter, type Strategy } from '../helpers/strategies';

const NAMES = ['Asha', 'Ben', 'Chen', 'Dana'];

function run(strategies: Strategy[]): World {
  return playScenario(newWorld(NAMES.slice(0, strategies.length)), strategies);
}

const peak = (world: World, key: 'pollution' | 'water') => Math.max(...world.historyPoints().map((p) => p.indicators[key]));
const credits = (world: World, id = 'p1') => world.player(id)?.credits ?? 0;

describe('Repeatable playthroughs under different strategies', () => {
  const results = {
    expansion: run([expansionist]),
    conservation: run([steward]),
    mixed: run([balanced]),
    inaction: run([waiter]),
    groupExpansion: run([expansionist, expansionist, expansionist]),
    groupCoordinated: run([coordinated, coordinated, coordinated]),
    freeRider: run([expansionist, steward, steward]),
  };

  it('prints a comparison table (for the implementation log)', () => {
    const rows = Object.entries(results).map(([name, world]) => {
      const v = world.indicators.toJSON();
      return {
        strategy: name,
        outcome: world.outcome?.outcome,
        ended: world.outcome?.endedEarly ? `early, turn ${world.outcome.finalTurn}` : `turn ${world.outcome?.finalTurn}`,
        water: v.water,
        food: v.food,
        energy: v.energy,
        ecosystem: v.ecosystemHealth,
        pollution: v.pollution,
        credits: world.players().map((p) => p.credits).join('/'),
        wetland: world.project.status,
      };
    });
    console.table(rows);
    expect(rows).toHaveLength(7);
  });

  it('produces different outcomes for different strategies (no single predetermined ending)', () => {
    const outcomes = new Set(Object.values(results).map((w) => w.outcome?.outcome));
    expect(outcomes.size).toBeGreaterThanOrEqual(3);
  });

  it('expansion: private gains now, accumulated pollution and water stress later', () => {
    const { expansion, conservation } = results;
    expect(credits(expansion)).toBeGreaterThan(credits(conservation));
    expect(peak(expansion, 'pollution')).toBeGreaterThan(peak(conservation, 'pollution'));
    expect(expansion.indicators.get('ecosystemHealth')).toBeLessThan(conservation.indicators.get('ecosystemHealth'));
    const summaries = expansion.history().map((e) => e.summary);
    expect(summaries.some((s) => s.startsWith('Pollution passed the damage threshold'))).toBe(true);
    expect(summaries.some((s) => s.startsWith('Water fell below its stress threshold'))).toBe(true);
  });

  it('conservation without any production protects the ecosystem but cannot meet growing demand alone', () => {
    const { conservation } = results;
    expect(conservation.indicators.get('ecosystemHealth')).toBeGreaterThanOrEqual(90);
    expect(conservation.history().some((e) => e.summary.startsWith('Pollution passed the damage threshold'))).toBe(false);
    expect(conservation.outcome?.outcome).not.toBe('resilient');
    expect(conservation.outcome?.reasons.join(' ')).toMatch(/Energy|Food/);
  });

  it('a mixed strategy with a collective contribution builds the wetland and keeps essentials available', () => {
    const { mixed } = results;
    expect(mixed.project.status).toBe('completed');
    expect(mixed.history().some((e) => e.kind === 'project' && e.summary.includes('is complete'))).toBe(true);
    for (const key of ['water', 'food', 'energy'] as const) expect(mixed.indicators.get(key)).toBeGreaterThan(30);
  });

  it('group expansion collapses sooner than solo expansion: more decision-makers, same finite river', () => {
    const { expansion, groupExpansion } = results;
    expect(groupExpansion.outcome?.outcome).toBe('crisis');
    expect(groupExpansion.outcome?.finalTurn ?? 99).toBeLessThan(expansion.outcome?.finalTurn ?? 99);
  });

  it('coordination with shared costs keeps the group out of crisis', () => {
    const { groupCoordinated } = results;
    expect(groupCoordinated.outcome?.outcome).not.toBe('crisis');
    expect(Object.keys(groupCoordinated.project.contributions()).length).toBeGreaterThanOrEqual(2);
  });

  it('free-riding is visible: the expander profits most, pays nothing toward the wetland, and shares its benefits', () => {
    const { freeRider } = results;
    const [expander, ...stewards] = freeRider.players();
    if (!expander) throw new Error('missing player');
    for (const s of stewards) expect(expander.credits).toBeGreaterThan(s.credits);
    expect(freeRider.project.contributionOf(expander.id)).toBe(0);
    expect(freeRider.project.status).toBe('completed');
    expect(freeRider.history().some((e) => e.kind === 'project' && e.causes.some((c) => c.includes(`Did not contribute: ${expander.displayName}`)))).toBe(true);
  });

  it('is repeatable: replaying a strategy gives an identical world', () => {
    expect(run([balanced]).toSnapshot()).toEqual(results.mixed.toSnapshot());
  });
});
