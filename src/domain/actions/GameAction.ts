import type { SimulationConfig } from '../config/riverValley';
import type { Player } from '../model/Player';
import type { Structure } from '../model/Structure';
import type { ActionType, PlayerActionDTO, StructureKind, ValidationCode, ValidationResult } from '../model/types';
import type { World } from '../model/World';

/** What an action may do while one turn's actions are aggregated (turn order, step 2). */
export interface AggregationContext {
  readonly turn: number;
  readonly config: SimulationConfig;
  /**
   * Atomically claims the lowest free slot, charges `cost` and builds the structure. Returns null,
   * charging nothing, when higher-priority requests this turn already used the last slot.
   */
  build(kind: StructureKind, player: Player, cost: number): Structure | null;
  offerContribution(player: Player, amount: number): void;
  requestSystemReport(player: Player): void;
}

export type ActionApplication =
  | { applied: true; cost: number; structure?: Structure }
  | { applied: false; reason: string };

/**
 * Command pattern: each player intention is an object that knows its cost, how to validate
 * itself against the start-of-turn world, and how to apply its immediate effects.
 */
export abstract class GameAction {
  abstract readonly type: ActionType;

  /** Credits charged when the action applies. */
  abstract cost(config: SimulationConfig): number;

  /** Checks the action against the start-of-turn state. Never mutates. */
  abstract validate(world: World, player: Player, config: SimulationConfig): ValidationResult;

  /** Applies the action's immediate, conflict-resolved effects to the draft world. */
  abstract apply(player: Player, context: AggregationContext): ActionApplication;

  abstract toDTO(): PlayerActionDTO;

  /** Short label for decision logs, e.g. "Expand farmland". */
  abstract describe(): string;

  /** Value equality: two actions are the same intention when their serialized forms match. */
  equals(other: GameAction): boolean {
    return JSON.stringify(this.toDTO()) === JSON.stringify(other.toDTO());
  }
}

export function invalid(code: ValidationCode, message: string): ValidationResult {
  return { ok: false, code, message };
}

export function requireCredits(player: Player, cost: number): ValidationResult {
  return player.canAfford(cost)
    ? { ok: true }
    : invalid('INSUFFICIENT_CREDITS', `This costs ${cost} credits; you have ${player.credits}.`);
}
