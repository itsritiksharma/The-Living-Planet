import type { SimulationConfig } from '../../domain/config/riverValley';
import { INDICATOR_LABELS, joinWords, lowerLabel, plural } from '../../domain/model/labels';
import type { ScenarioCalendar } from '../../domain/model/ScenarioCalendar';
import type { IndicatorKey } from '../../domain/model/types';
import { ESSENTIAL_KEYS, INDICATOR_KEYS } from '../../domain/model/types';
import type { World } from '../../domain/entities/World';
import { fixed1, percent, round1, signed1 } from '../../domain/shared/numbers';
import type { IndicatorBandLevel, IndicatorViewDTO } from '../../contracts/views';

const DESCRIPTIONS: Record<IndicatorKey, string> = {
  water: 'Freshwater available to the settlement from the river and reservoir.',
  food: "Food in the settlement's stores.",
  energy: 'Energy available to homes, pumps and machinery.',
  ecosystemHealth: 'Condition of forests, soil and riverbanks. Healthier land holds more water and absorbs more pollution.',
  pollution: 'Accumulated local pollution. It builds up from emissions and breaks down slowly.',
};

/** Presentation-only early-warning band: within this margin of a threshold the dashboard says "Watch". */
const WATCH_MARGIN = 10;

/** Builds the dashboard read model; the map uses the same bands, so both always agree. */
export class IndicatorPresenter {
  constructor(
    private readonly config: SimulationConfig,
    private readonly calendar: ScenarioCalendar,
  ) {}

  band(key: IndicatorKey, value: number): { level: IndicatorBandLevel; label: string } {
    if (key === 'pollution') {
      const t = this.config.thresholds.pollution;
      if (value >= t.severe) return { level: 'critical', label: 'Severe' };
      if (value > t.damage) return { level: 'stressed', label: 'Damaging' };
      if (value > t.damage - WATCH_MARGIN) return { level: 'watch', label: 'Elevated' };
      return { level: 'good', label: 'Low' };
    }
    const t = this.config.thresholds[key];
    if (value < t.critical) return { level: 'critical', label: 'Critical' };
    if (value < t.stress) return { level: 'stressed', label: 'Stressed' };
    if (value < t.stress + WATCH_MARGIN) return { level: 'watch', label: 'Watch' };
    return { level: 'good', label: 'Good' };
  }

  present(world: World): IndicatorViewDTO[] {
    const breakdown = world.lastBreakdown;
    const t = this.config.thresholds;
    return INDICATOR_KEYS.map((key) => {
      const value = world.indicators.get(key);
      const lines = breakdown?.indicators[key];
      return {
        key,
        label: INDICATOR_LABELS[key],
        value,
        delta: lines ? round1(lines.end - lines.start) : null,
        higherIsBetter: key !== 'pollution',
        band: this.band(key, value),
        thresholds:
          key === 'pollution'
            ? [
                { label: 'Damage', value: t.pollution.damage },
                { label: 'Severe', value: t.pollution.severe },
              ]
            : [
                { label: 'Stress', value: t[key].stress },
                { label: 'Critical', value: t[key].critical },
              ],
        description: DESCRIPTIONS[key],
        breakdown: lines ? lines.lines.map((line) => ({ label: line.label, amount: round1(line.amount) })) : [],
      };
    });
  }

  /**
   * Risks the current state and rules justify for the turn now open. These are facts about the
   * rules, not a forecast; the Research action provides projections.
   */
  knownRisks(world: World): string[] {
    if (!world.isActive) return [];
    const c = this.config;
    const t = c.thresholds;
    const v = world.indicators.toJSON();
    const turn = world.turn;
    const hardship = plural(c.economy.hardshipPerStressedEssential, 'credit');
    const risks: string[] = [];

    if (v.water < t.water.critical) {
      risks.push(`Water is critical (${fixed1(v.water)}): this turn crops yield ${percent(c.yield.waterCritical)}, over-extraction costs ${c.ecosystem.overExtractionCritical} ecosystem health and industry runs at ${percent(c.industry.waterCriticalEnergyFactor)}.`);
    } else if (v.water < t.water.stress) {
      risks.push(`Water is below ${t.water.stress}: this turn crops yield ${percent(c.yield.waterStress)} and emergency pumping costs ${c.ecosystem.overExtractionStress} ecosystem health, weakening future recharge.`);
    }
    const season = this.calendar.season(turn);
    const multiplier = c.water.seasonalMultiplier[season];
    if (multiplier < 1) risks.push(`This turn is ${season}: river recharge is only ${percent(multiplier)} of normal.`);
    if (this.calendar.isNewYear(turn)) risks.push('A new year begins this turn: household demand for water, food and energy grows.');
    const short = ESSENTIAL_KEYS.filter((key) => v[key] < t[key].stress);
    if (short.length > 0) {
      const each = plural(short.length * c.economy.hardshipPerStressedEssential, 'credit');
      risks.push(`Shortage of ${joinWords(short.map(lowerLabel))} raises living costs: every player pays up to ${each} this turn (${hardship} per short essential).`);
    }
    if (v.ecosystemHealth < t.ecosystemHealth.stress) {
      risks.push(`Ecosystem health is below ${t.ecosystemHealth.stress}: crop yields fall to ${percent(c.yield.ecosystemStress)} and the watershed holds less water.`);
    }
    if (v.pollution > t.pollution.damage) {
      const damage = c.ecosystem.pollutionDamagePerPoint * (v.pollution - t.pollution.damage);
      risks.push(`Pollution (${fixed1(v.pollution)}) is above ${t.pollution.damage}: it will damage ecosystem health by ${fixed1(damage)} this turn.`);
    } else {
      const last = world.lastBreakdown?.indicators.pollution;
      const trend = last ? last.end - last.start : 0;
      if (trend > 0 && v.pollution > t.pollution.damage - 15) {
        risks.push(`Pollution is rising (${signed1(trend)} last turn); above ${t.pollution.damage} it starts damaging the ecosystem.`);
      }
    }
    if (world.criticalStreak > 0) {
      risks.push('Something is critical: if any essential or the ecosystem is still critical after this turn, the settlement falls into crisis.');
    }
    return risks;
  }
}
