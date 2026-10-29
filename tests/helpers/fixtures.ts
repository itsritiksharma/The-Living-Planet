import { ActionFactory } from '../../src/domain/actions/ActionFactory';
import { RIVER_VALLEY_CONFIG, type SimulationConfig } from '../../src/domain/config/riverValley';
import { WorldFactory } from '../../src/domain/factories/WorldFactory';
import { DisplayName } from '../../src/domain/model/DisplayName';
import { TurnSubmissions } from '../../src/domain/model/TurnSubmissions';
import type { Indicators, PlayerActionDTO } from '../../src/domain/model/types';
import { World } from '../../src/domain/model/World';
import { TurnResolver } from '../../src/domain/services/TurnResolver';

export const config = RIVER_VALLEY_CONFIG;
export const actionFactory = new ActionFactory();

export const DTO = {
  expandFarm: { type: 'EXPAND_PRODUCTION', target: 'farm' },
  expandIndustry: { type: 'EXPAND_PRODUCTION', target: 'industry' },
  conserve: { type: 'CONSERVE_WATER' },
  restore: { type: 'RESTORE_WATERSHED' },
  inspect: { type: 'INSPECT_SYSTEM' },
  wait: { type: 'WAIT' },
  contribute: (amount: number): PlayerActionDTO => ({ type: 'CONTRIBUTE_TO_PROJECT', projectId: 'wetland', amount }),
} satisfies Record<string, PlayerActionDTO | ((amount: number) => PlayerActionDTO)>;

/** A world with players p1, p2, … named in order. */
export function newWorld(names: string[] = ['Asha'], cfg: SimulationConfig = config, worldId = 'world-test'): World {
  const world = new WorldFactory(cfg).createNew(worldId);
  names.forEach((name, index) => world.admit(`p${index + 1}`, DisplayName.parse(name)));
  return world;
}

export function submissionsFor(world: World, byPlayer: Record<string, PlayerActionDTO>): TurnSubmissions {
  return TurnSubmissions.of(
    world.id,
    world.turn,
    Object.entries(byPlayer).map(([playerId, dto]) => [playerId, actionFactory.fromDTO(dto)]),
  );
}

/** Resolves the open turn with the given actions (others wait) and returns the new world. */
export function resolve(world: World, byPlayer: Record<string, PlayerActionDTO> = {}, cfg: SimulationConfig = config): World {
  const result = new TurnResolver(cfg).resolve(world, world.turn, submissionsFor(world, byPlayer));
  if (result.status !== 'resolved') throw new Error('Expected the turn to resolve');
  return result.world;
}

/** Test fixture: the same world with some indicator values replaced (history kept consistent). */
export function withIndicators(world: World, values: Partial<Indicators>, cfg: SimulationConfig = config): World {
  const snapshot = world.toSnapshot();
  snapshot.indicators = { ...snapshot.indicators, ...values };
  const last = snapshot.historyPoints[snapshot.historyPoints.length - 1];
  if (last) last.indicators = { ...snapshot.indicators };
  return World.fromSnapshot(snapshot, cfg);
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

/** A config variant for tests: deep-merges overrides into the River Valley defaults. */
export function configWith(overrides: DeepPartial<SimulationConfig>): SimulationConfig {
  const merge = (base: unknown, patch: unknown): unknown => {
    if (typeof base !== 'object' || base === null || Array.isArray(base)) return patch ?? base;
    const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [key, value] of Object.entries((patch ?? {}) as Record<string, unknown>)) {
      result[key] = merge((base as Record<string, unknown>)[key], value);
    }
    return result;
  };
  return merge(config, overrides) as SimulationConfig;
}

/** Deep-freezes a value so any accidental mutation throws in strict mode. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** Deterministic PRNG for property-style tests (mulberry32). Tests only; the simulation never uses randomness. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
