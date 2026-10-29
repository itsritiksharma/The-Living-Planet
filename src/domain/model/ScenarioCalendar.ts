import type { SimulationConfig } from '../config/riverValley';
import type { Season } from './types';

export interface HouseholdDemand {
  water: number;
  food: number;
  energy: number;
  pollution: number;
}

/** Maps turn numbers to seasons and years, and to the settlement's growing baseline needs. */
export class ScenarioCalendar {
  constructor(private readonly config: SimulationConfig) {}

  get totalTurns(): number {
    return this.config.scenario.totalTurns;
  }

  season(turn: number): Season {
    const seasons = this.config.scenario.seasons;
    return seasons[(turn - 1) % seasons.length] as Season;
  }

  /** 1-based scenario year. */
  year(turn: number): number {
    return Math.floor((turn - 1) / this.config.scenario.seasons.length) + 1;
  }

  /** True for the first turn of years 2, 3, … (when household demand grows). */
  isNewYear(turn: number): boolean {
    return turn > 1 && (turn - 1) % this.config.scenario.seasons.length === 0;
  }

  isFinalTurn(turn: number): boolean {
    return turn >= this.config.scenario.totalTurns;
  }

  label(turn: number): string {
    return `${this.season(turn)}, Year ${this.year(turn)}`;
  }

  /** Baseline household needs for a turn; demand grows once per year as the settlement grows. */
  householdDemand(turn: number): HouseholdDemand {
    const years = this.year(turn) - 1;
    const { households } = this.config;
    return {
      water: households.water + households.yearlyGrowth.water * years,
      food: households.food + households.yearlyGrowth.food * years,
      energy: households.energy + households.yearlyGrowth.energy * years,
      pollution: households.pollution,
    };
  }
}
