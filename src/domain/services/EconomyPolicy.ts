import type { SimulationConfig } from '../config/riverValley';
import type { World } from '../model/World';
import type { EssentialKey, Indicators, PlayerId } from '../model/types';
import { ESSENTIAL_KEYS } from '../model/types';

export interface IncomeBreakdown {
  base: number;
  farms: number;
  industry: number;
  total: number;
  /** True when a critical water shortage halved industry income. */
  industryReduced: boolean;
}

export interface HardshipDue {
  essentials: EssentialKey[];
  /** Credits each player owes this turn (never pushing anyone below zero). */
  amount: number;
}

/** Private income and shared-shortage living costs. Rates come from the scenario config. */
export class EconomyPolicy {
  constructor(private readonly config: SimulationConfig) {}

  /** Income for one turn, from what the player owns and the conditions at the start of the turn. */
  incomeFor(world: World, playerId: PlayerId, start: Indicators): IncomeBreakdown {
    const { config } = this;
    const industryReduced = start.water < config.thresholds.water.critical;
    const base = config.economy.baseIncome;
    const farms = world.ownedCount(playerId, 'farm') * config.farm.ownerIncome;
    const industry =
      world.ownedCount(playerId, 'industry') *
      config.industry.ownerIncome *
      (industryReduced ? config.industry.waterCriticalIncomeFactor : 1);
    return { base, farms, industry, total: Math.floor(base + farms + industry), industryReduced };
  }

  /** Each essential below its stress threshold raises everyone's living costs. */
  hardshipDue(start: Indicators): HardshipDue {
    const essentials = ESSENTIAL_KEYS.filter((key) => start[key] < this.config.thresholds[key].stress);
    return { essentials, amount: essentials.length * this.config.economy.hardshipPerStressedEssential };
  }
}
