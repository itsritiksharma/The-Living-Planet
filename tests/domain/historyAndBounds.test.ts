import { describe, expect, it } from 'vitest';
import type { PlayerActionDTO } from '../../src/domain/model/types';
import { INDICATOR_KEYS } from '../../src/domain/model/types';
import type { World } from '../../src/domain/model/World';
import { round1 } from '../../src/domain/shared/numbers';
import { actionFactory, DTO, newWorld, resolve, seededRandom } from '../helpers/fixtures';
import { balanced, expansionist, playScenario, steward } from '../helpers/strategies';

const CANDIDATES: PlayerActionDTO[] = [
  DTO.expandFarm,
  DTO.expandIndustry,
  DTO.conserve,
  DTO.restore,
  DTO.inspect,
  DTO.wait,
  DTO.contribute(1),
  DTO.contribute(4),
  DTO.contribute(12),
];

/** Random valid actions for every player each turn (seeded: reproducible). */
function randomPlaythrough(seed: number): World {
  const random = seededRandom(seed);
  const names = ['Asha', 'Ben', 'Chen', 'Dana', 'Eli', 'Fay'].slice(0, 1 + Math.floor(random() * 4));
  let world = newWorld(names);
  while (world.isActive) {
    const byPlayer: Record<string, PlayerActionDTO> = {};
    for (const player of world.players()) {
      const valid = CANDIDATES.filter((dto) => world.validate(player.id, actionFactory.fromDTO(dto)).ok);
      if (random() < 0.85) byPlayer[player.id] = valid[Math.floor(random() * valid.length)] ?? DTO.wait;
    }
    world = resolve(world, byPlayer);
  }
  return world;
}

describe('Resource bounds and invariants (200 seeded random playthroughs)', () => {
  it('keeps every indicator within 0–100, credits whole and non-negative, and all invariants intact', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const world = randomPlaythrough(seed);
      expect(world.checkInvariants(), `seed ${seed}`).toEqual([]);
      for (const point of world.historyPoints()) {
        for (const key of INDICATOR_KEYS) {
          const value = point.indicators[key];
          expect(Number.isFinite(value) && value >= 0 && value <= 100, `seed ${seed} ${key}=${value}`).toBe(true);
        }
      }
      for (const player of world.players()) {
        expect(Number.isInteger(player.credits) && player.credits >= 0, `seed ${seed}`).toBe(true);
      }
      expect(world.outcome).not.toBeNull();
    }
  });
});

describe('Event history explains changes accurately', () => {
  const worlds = [
    playScenario(newWorld(['Asha']), [expansionist]),
    playScenario(newWorld(['Asha', 'Ben']), [balanced, steward]),
    randomPlaythrough(7),
  ];

  it.each(worlds.map((w, i) => [i, w] as const))('turn summaries report exactly the change in the snapshots (world %i)', (_i, world) => {
    const points = world.historyPoints();
    const summaries = world.history().filter((e) => e.kind === 'turn_summary');
    expect(summaries).toHaveLength(points.length - 1);
    for (const summary of summaries) {
      const before = points[summary.turn - 1]?.indicators;
      const after = points[summary.turn]?.indicators;
      if (!before || !after) throw new Error('missing history point');
      for (const key of INDICATOR_KEYS) expect(summary.deltas?.[key], `${key} on turn ${summary.turn}`).toBe(round1(after[key] - before[key]));
    }
  });

  it.each(worlds.map((w, i) => [i, w] as const))('threshold events correspond to real crossings (world %i)', (_i, world) => {
    const points = world.historyPoints();
    const crossings = world.history().filter((e) => e.kind === 'threshold');
    for (const event of crossings) {
      const before = points[event.turn - 1]?.indicators;
      const after = points[event.turn]?.indicators;
      if (!before || !after) throw new Error('missing history point');
      const value = Number(/now (\d+(?:\.\d)?)/.exec(event.summary)?.[1]);
      const key = INDICATOR_KEYS.find((k) => event.summary.toLowerCase().startsWith(k === 'ecosystemHealth' ? 'ecosystem health' : k));
      expect(key, event.summary).toBeDefined();
      if (key) {
        expect(value).toBe(after[key]);
        expect(after[key]).not.toBe(before[key]);
      }
    }
  });

  it('action events reference structures that actually exist', () => {
    const world = worlds[0] as World;
    const built = world.history().filter((e) => e.kind === 'action' && e.summary.includes('expanded'));
    expect(built.length).toBe(world.structures().filter((s) => !s.isInitial).length);
  });
});
