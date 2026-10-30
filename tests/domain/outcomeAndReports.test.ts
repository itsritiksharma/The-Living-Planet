import { describe, expect, it } from 'vitest';
import { TurnSubmissions } from '../../src/domain/entities/TurnSubmissions';
import type { Indicators, WorldSnapshot } from '../../src/domain/model/types';
import { World } from '../../src/domain/entities/World';
import { OutcomeClassifier } from '../../src/domain/services/OutcomeClassifier';
import { TurnResolver } from '../../src/domain/services/TurnResolver';
import { config, DTO, newWorld, resolve, withIndicators } from '../helpers/fixtures';

const classifier = new OutcomeClassifier(config);
const healthy: Indicators = { water: 60, food: 50, energy: 50, ecosystemHealth: 70, pollution: 20 };

/** A world after `turns` resolved turns whose ecosystem followed `ecoPath` (last value = now). */
function worldAfter(turns: number, final: Indicators, ecoPath: number[] = []): World {
  const snapshot: WorldSnapshot = newWorld().toSnapshot();
  snapshot.turn = turns + 1;
  snapshot.indicators = { ...final };
  snapshot.historyPoints = Array.from({ length: turns + 1 }, (_, turn) => {
    const fromEnd = turns - turn;
    const eco = fromEnd < ecoPath.length ? (ecoPath[ecoPath.length - 1 - fromEnd] as number) : final.ecosystemHealth;
    return { turn, indicators: { ...final, ecosystemHealth: eco } };
  });
  return World.fromSnapshot(snapshot, config);
}

describe('Outcome classification', () => {
  it('resilient: essentials at or above stress and the ecosystem stable or recovering', () => {
    const outcome = classifier.classify(worldAfter(16, healthy, [68, 69, 70, 70, 70]), false, 16);
    expect(outcome.outcome).toBe('resilient');
  });

  it('stressed: an essential below its stress threshold', () => {
    expect(classifier.classify(worldAfter(16, { ...healthy, food: 28 }), false, 16)).toMatchObject({
      outcome: 'stressed',
      reasons: [expect.stringMatching(/Food ended at 28.0, below its stress threshold \(30\)/)],
    });
  });

  it('stressed: ecosystem declining faster than the tolerance over the last four turns', () => {
    const outcome = classifier.classify(worldAfter(16, healthy, [76, 74, 73, 71, 70]), false, 16);
    expect(outcome.outcome).toBe('stressed');
    expect(outcome.reasons.join(' ')).toMatch(/fell 6.0 over the last 4 turns/);
  });

  it('crisis: anything critical at the end', () => {
    expect(classifier.classify(worldAfter(16, { ...healthy, water: 12 }), false, 16).outcome).toBe('crisis');
  });

  it('a world that stays critical for two consecutive turn-ends ends early in crisis', () => {
    const first = resolve(withIndicators(newWorld(), { food: 5 }), {});
    expect(first.isActive).toBe(true);
    expect(first.history().some((e) => e.kind === 'warning')).toBe(true);
    const second = resolve(first, {});
    expect(second.isActive).toBe(false);
    expect(second.outcome).toMatchObject({ outcome: 'crisis', endedEarly: true, finalTurn: 2 });
    expect(second.history().at(-1)?.kind).toBe('scenario_end');
    expect(() => resolve(second, {})).toThrow(/ended/);
  });

  it('one critical turn followed by recovery does not end the scenario', () => {
    const critical = resolve(withIndicators(newWorld(), { water: 10 }), {});
    expect(critical.criticalStreak).toBe(1);
    const recovered = resolve(withIndicators(critical, { water: 50 }), {});
    expect(recovered.criticalStreak).toBe(0);
    expect(recovered.isActive).toBe(true);
  });

  it('the scenario ends after the configured number of turns', () => {
    let world = newWorld();
    for (let turn = 1; turn <= config.scenario.totalTurns; turn += 1) world = resolve(world, {});
    expect(world.status).toBe('ended');
    expect(world.outcome?.finalTurn).toBe(config.scenario.totalTurns);
    expect(world.historyPoints()).toHaveLength(config.scenario.totalTurns + 1);
  });
});

describe('Research / inspect', () => {
  it('reveals a private report to the inspecting player only, without changing the world', () => {
    const start = newWorld(['Asha', 'Ben']);
    const inspected = resolve(start, { p1: DTO.inspect, p2: DTO.wait });
    const waited = resolve(start, { p1: DTO.wait, p2: DTO.wait });
    expect(inspected.indicators.toJSON()).toEqual(waited.indicators.toJSON());
    expect(inspected.player('p2')?.report).toBeNull();
    const report = inspected.player('p1')?.report;
    expect(report?.generatedAfterTurn).toBe(1);
    expect(report?.forecast).toHaveLength(config.forecast.turns);
    expect(report?.relationships.join(' ')).toMatch(/reinforcing loop/);
  });

  it('projects by running the real rules forward with everyone waiting', () => {
    const inspected = resolve(newWorld(), { p1: DTO.inspect });
    const report = inspected.player('p1')?.report;
    const resolver = new TurnResolver(config);
    const next = resolver.resolve(inspected, 2, TurnSubmissions.empty(inspected.id, 2));
    if (next.status !== 'resolved') throw new Error('expected resolution');
    expect(report?.forecast[0]).toEqual({ turn: 2, indicators: next.world.indicators.toJSON() });
  });

  it('flags projected threshold crossings', () => {
    // Spring lifts water from 38 to about 41; the projected Summer turn drops it below 40 again.
    const inspected = resolve(withIndicators(newWorld(), { water: 38 }), { p1: DTO.inspect });
    expect(inspected.indicators.get('water')).toBeGreaterThanOrEqual(40);
    const risks = inspected.player('p1')?.report?.risks.join(' ') ?? '';
    expect(risks).toMatch(/Water is projected to fall below its stress threshold \(40\) on turn 2 \(Summer, Year 1\)/);
  });
});
