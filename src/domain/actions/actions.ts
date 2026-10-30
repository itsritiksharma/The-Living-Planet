import type { SimulationConfig } from '../config/riverValley';
import type { Player } from '../entities/Player';
import type { ExpansionTarget, PlayerActionDTO, StructureKind, ValidationResult } from '../model/types';
import type { World } from '../entities/World';
import { GameAction, invalid, requireCredits, type ActionApplication, type AggregationContext } from './GameAction';

function buildOrBlock(kind: StructureKind, slotName: string, player: Player, cost: number, context: AggregationContext): ActionApplication {
  const structure = context.build(kind, player, cost);
  if (structure) return { applied: true, cost, structure };
  return { applied: false, reason: `Higher-priority requests this turn used the last ${slotName}. No credits were charged.` };
}

/** Short-term gain in energy or food capacity, with recurring water demand and pollution. */
export class ExpandProductionAction extends GameAction {
  readonly type = 'EXPAND_PRODUCTION' as const;

  constructor(readonly target: ExpansionTarget) {
    super();
  }

  cost(config: SimulationConfig): number {
    return this.target === 'farm' ? config.farm.cost : config.industry.cost;
  }

  validate(world: World, player: Player, config: SimulationConfig): ValidationResult {
    if (this.target !== 'farm' && this.target !== 'industry') {
      return invalid('INVALID_TARGET', 'Choose farmland or industry to expand.');
    }
    if (world.freeSlot(this.target) === null) {
      return invalid('NO_FREE_PLOT', this.target === 'farm' ? 'No meadow plots are left for new farmland.' : 'No industrial lots are left.');
    }
    return requireCredits(player, this.cost(config));
  }

  apply(player: Player, context: AggregationContext): ActionApplication {
    const slotName = this.target === 'farm' ? 'meadow plot' : 'industrial lot';
    return buildOrBlock(this.target, slotName, player, this.cost(context.config), context);
  }

  toDTO(): PlayerActionDTO {
    return { type: this.type, target: this.target };
  }

  describe(): string {
    return this.target === 'farm' ? 'Expand farmland' : 'Expand industry';
  }
}

/** A permanent water-efficiency upgrade: less water used per unit of activity. */
export class ConserveWaterAction extends GameAction {
  readonly type = 'CONSERVE_WATER' as const;

  cost(config: SimulationConfig): number {
    return config.efficiency.cost;
  }

  validate(world: World, player: Player, config: SimulationConfig): ValidationResult {
    if (world.countOf('efficiency') >= config.capacity.efficiencyUpgrades) {
      return invalid('LIMIT_REACHED', `All ${config.capacity.efficiencyUpgrades} water-efficiency upgrades are installed.`);
    }
    return requireCredits(player, this.cost(config));
  }

  apply(player: Player, context: AggregationContext): ActionApplication {
    return buildOrBlock('efficiency', 'efficiency upgrade', player, this.cost(context.config), context);
  }

  toDTO(): PlayerActionDTO {
    return { type: this.type };
  }

  describe(): string {
    return 'Conserve water (efficiency upgrade)';
  }
}

/** Plants a restoration plot: no immediate effect, gradual ecosystem recovery afterwards. */
export class RestoreWatershedAction extends GameAction {
  readonly type = 'RESTORE_WATERSHED' as const;

  cost(config: SimulationConfig): number {
    return config.restoration.cost;
  }

  validate(world: World, player: Player, config: SimulationConfig): ValidationResult {
    if (world.freeSlot('restoration') === null) {
      return invalid('NO_FREE_PLOT', 'Every restoration site has already been planted.');
    }
    return requireCredits(player, this.cost(config));
  }

  apply(player: Player, context: AggregationContext): ActionApplication {
    return buildOrBlock('restoration', 'restoration site', player, this.cost(context.config), context);
  }

  toDTO(): PlayerActionDTO {
    return { type: this.type };
  }

  describe(): string {
    return 'Restore forest and watershed';
  }
}

/** Spends the turn studying the system: a private report with relationships and a projection. */
export class InspectSystemAction extends GameAction {
  readonly type = 'INSPECT_SYSTEM' as const;

  cost(): number {
    return 0;
  }

  validate(): ValidationResult {
    return { ok: true };
  }

  apply(player: Player, context: AggregationContext): ActionApplication {
    context.requestSystemReport(player);
    return { applied: true, cost: 0 };
  }

  toDTO(): PlayerActionDTO {
    return { type: this.type };
  }

  describe(): string {
    return "Research the valley's systems";
  }
}

/** Offers credits to the shared project. Charged only for the amount actually accepted. */
export class ContributeToProjectAction extends GameAction {
  readonly type = 'CONTRIBUTE_TO_PROJECT' as const;

  constructor(
    readonly projectId: string,
    readonly amount: number,
  ) {
    super();
  }

  cost(): number {
    return this.amount;
  }

  validate(world: World, player: Player): ValidationResult {
    const project = world.project;
    if (this.projectId !== project.id) return invalid('UNKNOWN_PROJECT', 'Unknown community project.');
    if (!project.isOpen) return invalid('PROJECT_CLOSED', `${project.name} is no longer accepting contributions.`);
    if (!Number.isInteger(this.amount) || this.amount < 1) {
      return invalid('INVALID_AMOUNT', 'Contribute a whole number of credits (at least 1).');
    }
    if (this.amount > project.remaining) {
      return invalid('INVALID_AMOUNT', `Only ${project.remaining} more credits are needed.`);
    }
    return requireCredits(player, this.amount);
  }

  apply(player: Player, context: AggregationContext): ActionApplication {
    context.offerContribution(player, this.amount);
    return { applied: true, cost: 0 };
  }

  toDTO(): PlayerActionDTO {
    return { type: this.type, projectId: this.projectId, amount: this.amount };
  }

  describe(): string {
    return `Contribute ${this.amount} credits to the shared project`;
  }
}

/** Lets the world continue without intervention. */
export class WaitAction extends GameAction {
  readonly type = 'WAIT' as const;

  cost(): number {
    return 0;
  }

  validate(): ValidationResult {
    return { ok: true };
  }

  apply(): ActionApplication {
    return { applied: true, cost: 0 };
  }

  toDTO(): PlayerActionDTO {
    return { type: this.type };
  }

  describe(): string {
    return 'Wait';
  }
}
