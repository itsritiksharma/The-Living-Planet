import type { SimulationConfig } from '../config/riverValley';
import { IndicatorSet } from '../model/IndicatorSet';
import { plural } from '../model/labels';
import type { ScenarioCalendar } from '../model/ScenarioCalendar';
import type { FlowLine, IndicatorBreakdown, IndicatorKey, Indicators, TurnBreakdown } from '../model/types';
import { INDICATOR_KEYS } from '../model/types';
import { fixed1, percent } from '../shared/numbers';

export interface FlowInput {
  turn: number;
  /** Start-of-turn indicators: every multiplier and threshold effect is computed from these. */
  start: Indicators;
  /** Structure counts after this turn's construction. */
  farms: number;
  industry: number;
  efficiencyUpgrades: number;
  newFarms: number;
  growingRestorationPlots: number;
  wetlandBenefits: boolean;
  wetlandCompletedNow: boolean;
}

export interface FlowResult {
  breakdown: TurnBreakdown;
  settled: IndicatorSet;
}

/**
 * The stock-and-flow rules of the River Valley (see docs/SIMULATION_MODEL.md). Pure and
 * deterministic: the same input always produces the same breakdown.
 */
export class FlowCalculator {
  constructor(
    private readonly config: SimulationConfig,
    private readonly calendar: ScenarioCalendar,
  ) {}

  /** Share of potential river recharge the watershed delivers: healthy land retains more water. */
  watershedFactor(ecosystemHealth: number): number {
    const { water } = this.config;
    return water.watershedBase + (water.watershedFromEcosystem * ecosystemHealth) / 100;
  }

  /** Crop yield multiplier from start-of-turn conditions, with the reason for each reduction. */
  yieldFactor(start: Indicators): { factor: number; reasons: string[] } {
    const { thresholds: t, yield: y } = this.config;
    let factor = 1;
    const reasons: string[] = [];
    if (start.water < t.water.critical) {
      factor *= y.waterCritical;
      reasons.push(`water below ${t.water.critical} (×${y.waterCritical})`);
    } else if (start.water < t.water.stress) {
      factor *= y.waterStress;
      reasons.push(`water below ${t.water.stress} (×${y.waterStress})`);
    }
    if (start.ecosystemHealth < t.ecosystemHealth.stress) {
      factor *= y.ecosystemStress;
      reasons.push(`ecosystem health below ${t.ecosystemHealth.stress} (×${y.ecosystemStress})`);
    }
    if (start.pollution >= t.pollution.severe) {
      factor *= y.pollutionSevere;
      reasons.push(`pollution at or above ${t.pollution.severe} (×${y.pollutionSevere})`);
    }
    if (start.energy < t.energy.stress) {
      factor *= y.energyStress;
      reasons.push(`energy below ${t.energy.stress} (×${y.energyStress})`);
    }
    return { factor, reasons };
  }

  compute(input: FlowInput): FlowResult {
    const { config, calendar } = this;
    const { start, turn } = input;
    const t = config.thresholds;
    const season = calendar.season(turn);
    const demand = calendar.householdDemand(turn);
    const seasonal = config.water.seasonalMultiplier[season];
    const watershed = this.watershedFactor(start.ecosystemHealth);
    const waterCritical = start.water < t.water.critical;
    const { factor: yieldFactor, reasons: yieldReasons } = this.yieldFactor(start);

    const lines: Record<IndicatorKey, FlowLine[]> = {
      water: [],
      food: [],
      energy: [],
      ecosystemHealth: [],
      pollution: [],
    };
    const add = (key: IndicatorKey, label: string, amount: number): void => {
      if (amount !== 0) lines[key].push({ label, amount });
    };

    // Water: natural recharge (season × watershed health) + wetland storage − use + efficiency savings.
    add('water', `River recharge (${season} ×${seasonal}, watershed ${percent(watershed)})`, config.water.baseRecharge * seasonal * watershed);
    if (input.wetlandBenefits) add('water', 'Wetland storage', config.project.rechargeBonus);
    const householdWater = demand.water;
    const farmWater = input.farms * config.farm.water;
    const industryWater = input.industry * config.industry.water;
    add('water', 'Household use', -householdWater);
    add('water', `Farm irrigation (${plural(input.farms, 'farm')})`, -farmWater);
    add('water', `Industry cooling (${plural(input.industry, 'unit')})`, -industryWater);
    const reduction = Math.min(input.efficiencyUpgrades, config.capacity.efficiencyUpgrades) * config.efficiency.waterUseReduction;
    add(
      'water',
      `Efficiency savings (${plural(input.efficiencyUpgrades, 'upgrade')}, −${percent(reduction)} use)`,
      (householdWater + farmWater + industryWater) * reduction,
    );

    // Food: harvest at the start-of-turn yield − household consumption.
    add('food', `Harvest (${plural(input.farms, 'farm')} at ${percent(yieldFactor)} yield)`, input.farms * config.farm.food * yieldFactor);
    add('food', 'Household food', -demand.food);

    // Energy: industry output (reduced without cooling water) − households, farm machinery, pumps.
    const energyFactor = waterCritical ? config.industry.waterCriticalEnergyFactor : 1;
    add(
      'energy',
      waterCritical
        ? `Industry output (${plural(input.industry, 'unit')}, cooling-water shortage ×${energyFactor})`
        : `Industry output (${plural(input.industry, 'unit')})`,
      input.industry * config.industry.energy * energyFactor,
    );
    add('energy', 'Household energy', -demand.energy);
    add('energy', `Farm machinery (${plural(input.farms, 'farm')})`, -input.farms * config.farm.energy);
    add('energy', `Efficiency pumps (${plural(input.efficiencyUpgrades, 'upgrade')})`, -input.efficiencyUpgrades * config.efficiency.energyUse);

    // Pollution (a stock): emissions − natural breakdown − ecosystem absorption − wetland filtration.
    add('pollution', `Industry emissions (${plural(input.industry, 'unit')})`, input.industry * config.industry.pollution);
    add('pollution', `Farm runoff (${plural(input.farms, 'farm')})`, input.farms * config.farm.pollution);
    add('pollution', 'Household waste', demand.pollution);
    add('pollution', `Natural breakdown (${percent(config.pollution.decayRate)} of pollution)`, -config.pollution.decayRate * start.pollution);
    add(
      'pollution',
      `Absorption by ecosystems (health ${fixed1(start.ecosystemHealth)})`,
      (-config.pollution.ecosystemAbsorption * start.ecosystemHealth) / 100,
    );
    if (input.wetlandBenefits) add('pollution', 'Wetland filtration', -config.project.pollutionFiltration);

    // Ecosystem health: recovery when unstressed − pollution damage − over-extraction − land
    // conversion + restoration growth + wetland completion.
    const eco = config.ecosystem;
    if (start.pollution < t.pollution.damage && start.water >= t.water.stress) {
      add('ecosystemHealth', 'Natural recovery', eco.recoveryRate * (100 - start.ecosystemHealth));
    }
    if (start.pollution > t.pollution.damage) {
      add(
        'ecosystemHealth',
        `Pollution damage (pollution ${fixed1(start.pollution)} above ${t.pollution.damage})`,
        -eco.pollutionDamagePerPoint * (start.pollution - t.pollution.damage),
      );
    }
    if (waterCritical) {
      add('ecosystemHealth', `Over-extraction (water below ${t.water.critical})`, -eco.overExtractionCritical);
    } else if (start.water < t.water.stress) {
      add('ecosystemHealth', `Over-extraction (water below ${t.water.stress})`, -eco.overExtractionStress);
    }
    add('ecosystemHealth', `Land conversion (${plural(input.newFarms, 'new farm')})`, input.newFarms * config.farm.landConversionEcosystem);
    add(
      'ecosystemHealth',
      `Restoration growth (${plural(input.growingRestorationPlots, 'plot')})`,
      input.growingRestorationPlots * config.restoration.ecosystemPerTurn,
    );
    if (input.wetlandCompletedNow) add('ecosystemHealth', 'Wetland completed', config.project.completionEcosystem);

    const raw = {} as Indicators;
    for (const key of INDICATOR_KEYS) raw[key] = start[key] + lines[key].reduce((sum, line) => sum + line.amount, 0);
    const settled = IndicatorSet.settle(raw);
    const indicators = {} as Record<IndicatorKey, IndicatorBreakdown>;
    for (const key of INDICATOR_KEYS) {
      indicators[key] = { start: start[key], lines: lines[key], raw: raw[key], end: settled.get(key) };
    }
    return {
      breakdown: {
        turn,
        season,
        year: calendar.year(turn),
        yieldFactor,
        yieldReasons,
        watershedFactor: watershed,
        indicators,
      },
      settled,
    };
  }
}
