import type { Indicators, Season } from '../model/types';

/**
 * Every tunable number in the River Valley scenario lives here, so that UI components and
 * rules never carry unexplained literals.
 *
 * SIMULATION ASSUMPTIONS: all values are invented game units chosen to make cause and effect
 * legible over a 16-turn scenario. They are not calibrated to real hydrology, ecology or
 * economics and must not be read as forecasts. See docs/SIMULATION_MODEL.md.
 */
export const CONFIG_VERSION = 'river-valley-1.0.0';

export interface SimulationConfig {
  version: string;
  scenario: {
    name: string;
    /** One turn is one season; 16 turns = 4 years. */
    totalTurns: number;
    maxPlayers: number;
    seasons: readonly Season[];
  };
  initialIndicators: Indicators;
  initialStructures: { farm: number; industry: number };
  /** Finite land and upgrade capacity. Map layout tile counts must match these numbers. */
  capacity: { farmPlots: number; industryLots: number; efficiencyUpgrades: number; restorationSites: number };
  thresholds: {
    water: { stress: number; critical: number };
    food: { stress: number; critical: number };
    energy: { stress: number; critical: number };
    ecosystemHealth: { stress: number; critical: number };
    /** Pollution is "higher is worse": damage begins above `damage`; yields drop at `severe`. */
    pollution: { damage: number; severe: number };
  };
  /** Baseline settlement needs per turn, before any player acts. */
  households: {
    water: number;
    food: number;
    energy: number;
    pollution: number;
    /** Added to household demand at the start of each new year (turns 5, 9, 13). */
    yearlyGrowth: { water: number; food: number; energy: number };
  };
  farm: {
    cost: number;
    food: number;
    water: number;
    energy: number;
    pollution: number;
    ownerIncome: number;
    /** One-time ecosystem change when a meadow is converted to farmland. */
    landConversionEcosystem: number;
  };
  industry: {
    cost: number;
    energy: number;
    water: number;
    pollution: number;
    ownerIncome: number;
    /** Output and income multipliers while water starts the turn critical (no cooling water). */
    waterCriticalEnergyFactor: number;
    waterCriticalIncomeFactor: number;
  };
  efficiency: { cost: number; waterUseReduction: number; energyUse: number };
  restoration: { cost: number; ecosystemPerTurn: number; growthTurns: number };
  water: {
    baseRecharge: number;
    seasonalMultiplier: Record<Season, number>;
    /** Watershed factor = base + fromEcosystem × health/100 (healthy land retains more water). */
    watershedBase: number;
    watershedFromEcosystem: number;
  };
  yield: {
    waterStress: number;
    waterCritical: number;
    ecosystemStress: number;
    pollutionSevere: number;
    energyStress: number;
  };
  pollution: { decayRate: number; ecosystemAbsorption: number };
  ecosystem: {
    /** Natural recovery = rate × (100 − health), only while pollution and water are not stressed. */
    recoveryRate: number;
    pollutionDamagePerPoint: number;
    overExtractionStress: number;
    overExtractionCritical: number;
  };
  economy: { startingCredits: number; baseIncome: number; hardshipPerStressedEssential: number };
  project: {
    id: string;
    name: string;
    target: number;
    constructionTurns: number;
    completionEcosystem: number;
    rechargeBonus: number;
    pollutionFiltration: number;
  };
  forecast: { turns: number };
  outcome: {
    /** Consecutive critical turn-ends that end the scenario early in crisis. */
    failureStreak: number;
    trendWindow: number;
    /** Largest ecosystem decline over the trend window that still counts as "stable". */
    resilientEcosystemDeclineTolerance: number;
  };
  map: {
    /**
     * Rows of single-character tiles. Legend:
     * F forest · R river · s restoration site · W wetland project site · a initial farm ·
     * M meadow plot (farm expansion) · H homes · E waterworks · I initial industry ·
     * L industrial lot (industry expansion) · . grassland (no structures, no effect)
     */
    layout: readonly string[];
  };
}

export const RIVER_VALLEY_CONFIG: SimulationConfig = {
  version: CONFIG_VERSION,
  scenario: {
    name: 'The River Valley',
    totalTurns: 16,
    maxPlayers: 6,
    seasons: ['Spring', 'Summer', 'Autumn', 'Winter'],
  },
  initialIndicators: { water: 70, food: 60, energy: 60, ecosystemHealth: 75, pollution: 15 },
  initialStructures: { farm: 3, industry: 2 },
  capacity: { farmPlots: 5, industryLots: 5, efficiencyUpgrades: 5, restorationSites: 6 },
  thresholds: {
    water: { stress: 40, critical: 15 },
    food: { stress: 30, critical: 10 },
    energy: { stress: 25, critical: 10 },
    ecosystemHealth: { stress: 40, critical: 25 },
    pollution: { damage: 40, severe: 60 },
  },
  households: {
    water: 6,
    food: 9.5,
    energy: 7,
    pollution: 0.5,
    yearlyGrowth: { water: 0.5, food: 1, energy: 1 },
  },
  farm: { cost: 5, food: 3, water: 1.5, energy: 0.5, pollution: 0.3, ownerIncome: 1, landConversionEcosystem: -3 },
  industry: {
    cost: 6,
    energy: 4,
    water: 1,
    pollution: 1.2,
    ownerIncome: 2,
    waterCriticalEnergyFactor: 0.7,
    waterCriticalIncomeFactor: 0.5,
  },
  efficiency: { cost: 4, waterUseReduction: 0.1, energyUse: 0.3 },
  restoration: { cost: 3, ecosystemPerTurn: 2, growthTurns: 4 },
  water: {
    baseRecharge: 14,
    seasonalMultiplier: { Spring: 1.3, Summer: 0.6, Autumn: 1.0, Winter: 1.1 },
    watershedBase: 0.5,
    watershedFromEcosystem: 0.5,
  },
  yield: { waterStress: 0.7, waterCritical: 0.3, ecosystemStress: 0.8, pollutionSevere: 0.85, energyStress: 0.85 },
  pollution: { decayRate: 0.08, ecosystemAbsorption: 3 },
  ecosystem: { recoveryRate: 0.04, pollutionDamagePerPoint: 0.15, overExtractionStress: 2, overExtractionCritical: 4 },
  economy: { startingCredits: 10, baseIncome: 2, hardshipPerStressedEssential: 1 },
  project: {
    id: 'wetland',
    name: 'Riverbank Wetland',
    target: 24,
    constructionTurns: 2,
    completionEcosystem: 4,
    rechargeBonus: 2,
    pollutionFiltration: 3,
  },
  forecast: { turns: 3 },
  outcome: { failureStreak: 2, trendWindow: 4, resilientEcosystemDeclineTolerance: 3 },
  map: {
    layout: [
      'FFFsRaMM.',
      'FFssRaMM.',
      'FFsWRaMHH',
      'Fs.WR.EHH',
      'Fs..RIILL',
      'FF..R.LLL',
    ],
  },
};
