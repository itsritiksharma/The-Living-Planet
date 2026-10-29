import type { TurnSubmissions } from '../model/TurnSubmissions';
import type { EventSnapshot } from '../model/types';
import type { World } from '../model/World';

export type TurnResolution =
  | { status: 'resolved'; world: World; events: EventSnapshot[]; resolvedTurn: number }
  | { status: 'already_resolved'; world: World };

export interface ResolveOptions {
  /** Inspect reports run projections; projections themselves must not produce reports. */
  generateReports?: boolean;
}

export interface TurnSimulator {
  resolve(world: World, turn: number, submissions: TurnSubmissions, options?: ResolveOptions): TurnResolution;
}
