import type { SimulationConfig } from '../config/riverValley';
import { INDICATOR_LABELS, joinWords, lowerLabel } from '../model/labels';
import type { World } from '../entities/World';
import type { DepletableKey, Indicators, ScenarioOutcome } from '../model/types';
import { DEPLETABLE_KEYS, ESSENTIAL_KEYS } from '../model/types';
import { fixed1, round1, signed1 } from '../shared/numbers';

/**
 * Classifies how the scenario ended. Success is deliberately not "maximize every meter":
 * resilience means essentials stayed available and the ecosystem is stable or recovering.
 */
export class OutcomeClassifier {
  constructor(private readonly config: SimulationConfig) {}

  /** Essentials or ecosystem below their critical level (the failure condition). */
  criticalIndicators(values: Indicators): DepletableKey[] {
    return DEPLETABLE_KEYS.filter((key) => values[key] < this.config.thresholds[key].critical);
  }

  /** Ecosystem change across the configured trend window, ending at the latest history point. */
  ecosystemTrend(world: World): { change: number; turns: number } {
    const points = world.historyPoints();
    const last = points[points.length - 1];
    const earlier = points[Math.max(0, points.length - 1 - this.config.outcome.trendWindow)];
    if (!last || !earlier) return { change: 0, turns: 0 };
    return {
      change: round1(last.indicators.ecosystemHealth - earlier.indicators.ecosystemHealth),
      turns: last.turn - earlier.turn,
    };
  }

  classify(world: World, endedEarly: boolean, finalTurn: number): ScenarioOutcome {
    const t = this.config.thresholds;
    const values = world.indicators.toJSON();
    const critical = this.criticalIndicators(values);

    if (endedEarly) {
      const streak = world.criticalStreak;
      return {
        outcome: 'crisis',
        endedEarly: true,
        finalTurn,
        reasons: [
          `${capitalize(joinWords(critical.map(lowerLabel)))} stayed below the critical level for ${streak} consecutive turns (turns ${finalTurn - streak + 1}–${finalTurn}), so the scenario ended early.`,
          ...critical.map(
            (key) => `${INDICATOR_LABELS[key]} ended at ${fixed1(values[key])} (critical below ${t[key].critical}).`,
          ),
        ],
      };
    }

    if (critical.length > 0) {
      return {
        outcome: 'crisis',
        endedEarly: false,
        finalTurn,
        reasons: critical.map(
          (key) => `${INDICATOR_LABELS[key]} ended at ${fixed1(values[key])}, below its critical level (${t[key].critical}).`,
        ),
      };
    }

    const failures: string[] = [];
    for (const key of ESSENTIAL_KEYS) {
      if (values[key] < t[key].stress) {
        failures.push(`${INDICATOR_LABELS[key]} ended at ${fixed1(values[key])}, below its stress threshold (${t[key].stress}).`);
      }
    }
    if (values.ecosystemHealth < t.ecosystemHealth.stress) {
      failures.push(
        `Ecosystem health ended at ${fixed1(values.ecosystemHealth)}, below its stress threshold (${t.ecosystemHealth.stress}).`,
      );
    }
    const trend = this.ecosystemTrend(world);
    if (trend.change < -this.config.outcome.resilientEcosystemDeclineTolerance) {
      failures.push(
        `Ecosystem health fell ${fixed1(-trend.change)} over the last ${trend.turns} turns, so it is not stable or recovering.`,
      );
    }

    if (failures.length === 0) {
      return {
        outcome: 'resilient',
        endedEarly: false,
        finalTurn,
        reasons: [
          'Water, food and energy all ended at or above their stress thresholds.',
          `Ecosystem health (${fixed1(values.ecosystemHealth)}) is stable or recovering (${signed1(trend.change)} over the last ${trend.turns} turns).`,
        ],
      };
    }
    return { outcome: 'stressed', endedEarly: false, finalTurn, reasons: failures };
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
