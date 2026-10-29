import type { SimulationConfig } from '../config/riverValley';
import { INDICATOR_LABELS, joinWords, plural } from '../model/labels';
import type { ScenarioCalendar } from '../model/ScenarioCalendar';
import { TurnSubmissions } from '../model/TurnSubmissions';
import type { ForecastPoint, IndicatorKey, Indicators, SystemReport, TurnBreakdown } from '../model/types';
import { DEPLETABLE_KEYS } from '../model/types';
import type { World } from '../model/World';
import { fixed1, percent, signed1 } from '../shared/numbers';
import type { TurnSimulator } from './TurnSimulator';

/**
 * The "Research / inspect" payoff: explanatory relationships plus a short projection computed
 * by running the real rules forward with everyone waiting. It reveals information; it never
 * changes the world.
 */
export class SystemReportBuilder {
  constructor(
    private readonly config: SimulationConfig,
    private readonly calendar: ScenarioCalendar,
    private readonly simulator: TurnSimulator,
  ) {}

  build(world: World): SystemReport {
    const generatedAfterTurn = world.turn - 1;
    const rules = this.ruleRelationships();
    if (!world.isActive) {
      return {
        generatedAfterTurn,
        forecast: [],
        risks: ['The scenario has ended, so there is nothing left to project.'],
        relationships: rules,
      };
    }

    const forecast: ForecastPoint[] = [];
    let current = world;
    let nextTurn: TurnBreakdown | null = null;
    for (let step = 0; step < this.config.forecast.turns && current.isActive; step += 1) {
      const turn = current.turn;
      const result = this.simulator.resolve(current, turn, TurnSubmissions.empty(current.id, turn), {
        generateReports: false,
      });
      if (result.status !== 'resolved') break;
      current = result.world;
      forecast.push({ turn, indicators: current.indicators.toJSON() });
      nextTurn ??= current.lastBreakdown;
    }

    return {
      generatedAfterTurn,
      forecast,
      risks: this.risks(world.indicators.toJSON(), forecast),
      relationships: [...this.nextTurnRelationships(nextTurn), ...rules],
    };
  }

  private risks(start: Indicators, forecast: readonly ForecastPoint[]): string[] {
    const t = this.config.thresholds;
    const risks: string[] = [];
    const when = (turn: number) => `on turn ${turn} (${this.calendar.label(turn)}) if nobody acts`;

    for (const key of DEPLETABLE_KEYS) {
      const label = INDICATOR_LABELS[key];
      if (start[key] < t[key].critical) risks.push(`${label} is already critical (${fixed1(start[key])}).`);
      else if (start[key] < t[key].stress) risks.push(`${label} is already below its stress threshold (${fixed1(start[key])}).`);
      let previous = start[key];
      for (const point of forecast) {
        const value = point.indicators[key];
        if (previous >= t[key].stress && value < t[key].stress) {
          risks.push(`${label} is projected to fall below its stress threshold (${t[key].stress}) ${when(point.turn)}.`);
        }
        if (previous >= t[key].critical && value < t[key].critical) {
          risks.push(`${label} is projected to fall below its critical level (${t[key].critical}) ${when(point.turn)}.`);
        }
        previous = value;
      }
    }

    if (start.pollution > t.pollution.damage) risks.push(`Pollution is already damaging the ecosystem (${fixed1(start.pollution)}).`);
    let previous = start.pollution;
    for (const point of forecast) {
      const value = point.indicators.pollution;
      if (previous <= t.pollution.damage && value > t.pollution.damage) {
        risks.push(`Pollution is projected to pass the damage threshold (${t.pollution.damage}) ${when(point.turn)}.`);
      }
      if (previous < t.pollution.severe && value >= t.pollution.severe) {
        risks.push(`Pollution is projected to reach the severe level (${t.pollution.severe}) ${when(point.turn)}.`);
      }
      previous = value;
    }

    if (risks.length === 0) {
      risks.push(`No thresholds are projected to be crossed in the next ${plural(forecast.length, 'turn')} if nobody acts.`);
    }
    return risks;
  }

  private nextTurnRelationships(next: TurnBreakdown | null): string[] {
    if (!next) return [];
    const describe = (key: IndicatorKey): string => {
      const b = next.indicators[key];
      const flows = b.lines.map((line) => `${line.label} ${signed1(line.amount)}`).join('; ');
      return `${signed1(b.end - b.start)} (${flows || 'no flows'})`;
    };
    const lines = [
      `Water next turn if everyone waits: ${describe('water')}. The watershed delivers ${percent(next.watershedFactor)} of potential recharge; it rises with ecosystem health.`,
      `Food next turn: ${describe('food')}.${next.yieldReasons.length > 0 ? ` Yield is reduced by ${joinWords(next.yieldReasons)}.` : ''}`,
      `Energy next turn: ${describe('energy')}.`,
      `Pollution next turn: ${describe('pollution')}.`,
      `Ecosystem health next turn: ${describe('ecosystemHealth')}.`,
    ];
    return lines;
  }

  private ruleRelationships(): string[] {
    const c = this.config;
    const t = c.thresholds;
    return [
      `Each industry unit adds ${c.industry.energy} energy, ${c.industry.water} water demand and ${c.industry.pollution} pollution per turn; each farm adds up to ${c.farm.food} food plus ${c.farm.water} water, ${c.farm.energy} energy and ${c.farm.pollution} pollution per turn.`,
      `Crops yield 100% while water is at least ${t.water.stress}, ${percent(c.yield.waterStress)} below it and ${percent(c.yield.waterCritical)} below ${t.water.critical}; ecosystem health below ${t.ecosystemHealth.stress}, pollution of ${t.pollution.severe} or more and energy below ${t.energy.stress} each cut yields further.`,
      `While water is below ${t.water.stress}, emergency pumping costs ${c.ecosystem.overExtractionStress} ecosystem health per turn (${c.ecosystem.overExtractionCritical} below ${t.water.critical}), and a damaged watershed recharges less: a reinforcing loop.`,
      `Pollution above ${t.pollution.damage} damages ecosystem health by ${c.ecosystem.pollutionDamagePerPoint} per point; healthy ecosystems absorb up to ${c.pollution.ecosystemAbsorption} pollution per turn and ${percent(c.pollution.decayRate)} of pollution breaks down naturally.`,
    ];
  }
}
