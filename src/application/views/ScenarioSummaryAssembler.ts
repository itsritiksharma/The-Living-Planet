import { ActionFactory } from '../../domain/actions/ActionFactory';
import type { SimulationConfig } from '../../domain/config/riverValley';
import { INDICATOR_LABELS, joinWords, OUTCOME_TITLES, plural } from '../../domain/model/labels';
import type { IndicatorKey, StructureKind } from '../../domain/model/types';
import { INDICATOR_KEYS } from '../../domain/model/types';
import type { World } from '../../domain/model/World';
import { fixed1 } from '../../domain/shared/numbers';
import type { ScenarioSummaryDTO } from '../../contracts/views';
import { toEventView } from './eventView';

/**
 * The end-of-scenario report: what happened, the trade-offs, who bore which costs and the
 * sequence of decisions. It describes; it does not rank players or assign moral labels.
 */
export class ScenarioSummaryAssembler {
  private readonly actions = new ActionFactory();

  constructor(private readonly config: SimulationConfig) {}

  build(world: World, colorOf: (playerId: string) => number): ScenarioSummaryDTO | null {
    const outcome = world.outcome;
    if (!outcome) return null;
    const points = world.historyPoints();
    const players = world.players();
    const project = world.project;

    const ranges = INDICATOR_KEYS.map((key) => {
      const values = points.map((point) => point.indicators[key]);
      return {
        key,
        label: INDICATOR_LABELS[key],
        start: values[0] ?? 0,
        end: values[values.length - 1] ?? 0,
        min: Math.min(...values),
        max: Math.max(...values),
      };
    });
    const extremeTurn = (key: IndicatorKey, pick: 'min' | 'max'): number => {
      const target = ranges.find((range) => range.key === key)?.[pick];
      return points.find((point) => point.indicators[key] === target)?.turn ?? 0;
    };
    const rangeOf = (key: IndicatorKey) => ranges.find((range) => range.key === key) as (typeof ranges)[number];

    const tradeOffs: string[] = [];
    const totalIncome = players.reduce((sum, p) => sum + p.totals.incomeEarned, 0);
    const richest = [...players].sort((a, b) => b.credits - a.credits)[0];
    if (richest) {
      tradeOffs.push(
        `Private gains: players earned ${plural(totalIncome, 'credit')} in total; ${richest.displayName} ends with the most (${richest.credits}).`,
      );
    }
    const eco = rangeOf('ecosystemHealth');
    tradeOffs.push(`Ecosystem health went from ${fixed1(eco.start)} to ${fixed1(eco.end)} (lowest ${fixed1(eco.min)}, turn ${extremeTurn('ecosystemHealth', 'min')}).`);
    const pollution = rangeOf('pollution');
    tradeOffs.push(`Pollution went from ${fixed1(pollution.start)} to ${fixed1(pollution.end)} (peak ${fixed1(pollution.max)}, turn ${extremeTurn('pollution', 'max')}).`);
    const water = rangeOf('water');
    tradeOffs.push(`Water went from ${fixed1(water.start)} to ${fixed1(water.end)} (lowest ${fixed1(water.min)}, turn ${extremeTurn('water', 'min')}).`);
    const built = (kind: StructureKind) => world.structuresOf(kind).filter((s) => !s.isInitial).length;
    tradeOffs.push(
      `Built during the scenario: ${plural(built('farm'), 'farm')}, ${plural(built('industry'), 'industry unit')}, ` +
        `${plural(built('efficiency'), 'efficiency upgrade')} and ${plural(built('restoration'), 'restoration plot')}.`,
    );
    const contributions = project.contributions();
    const contributors = players.filter((p) => (contributions[p.id] ?? 0) > 0);
    if (project.status === 'completed') {
      tradeOffs.push(
        `The ${project.name} was completed on turn ${project.completesTurn}, paid for by ${joinWords(contributors.map((p) => `${p.displayName} (${contributions[p.id]})`))}; everyone shared its benefits.`,
      );
    } else if (project.status === 'in_progress') {
      tradeOffs.push(`The ${project.name} was funded but still under construction when the scenario ended.`);
    } else {
      tradeOffs.push(`The ${project.name} reached ${project.funded} of ${project.target} credits and was never built.`);
    }
    const hardest = [...players]
      .filter((p) => p.totals.hardshipPaid > 0)
      .sort((a, b) => share(b.totals.hardshipPaid, b.totals.incomeEarned) - share(a.totals.hardshipPaid, a.totals.incomeEarned))[0];
    if (hardest) {
      const portion = `${share(hardest.totals.hardshipPaid, hardest.totals.incomeEarned)}% of ${hardest.displayName}'s income`;
      tradeOffs.push(
        players.length > 1
          ? `Shortage living costs took ${portion}, the largest share of anyone: the same shortage weighs more on smaller incomes.`
          : `Shortage living costs took ${portion}.`,
      );
    }

    return {
      outcome: outcome.outcome,
      title: OUTCOME_TITLES[outcome.outcome],
      endedEarly: outcome.endedEarly,
      finalTurn: outcome.finalTurn,
      reasons: outcome.reasons,
      tradeOffs,
      indicatorRanges: ranges,
      keyEvents: world
        .history()
        .filter((event) => event.importance === 'major')
        .map(toEventView),
      players: players.map((p) => ({
        playerId: p.id,
        displayName: p.displayName,
        colorIndex: colorOf(p.id),
        joinedTurn: p.joinedTurn,
        credits: p.credits,
        incomeEarned: p.totals.incomeEarned,
        spentOnActions: p.totals.spentOnActions,
        contributed: p.totals.contributed,
        hardshipPaid: p.totals.hardshipPaid,
        hardshipSharePercent: share(p.totals.hardshipPaid, p.totals.incomeEarned),
        built: {
          farm: world.ownedCount(p.id, 'farm'),
          industry: world.ownedCount(p.id, 'industry'),
          efficiency: world.ownedCount(p.id, 'efficiency'),
          restoration: world.ownedCount(p.id, 'restoration'),
        },
      })),
      decisions: world.decisions().map((decision) => ({
        turn: decision.turn,
        playerId: decision.playerId,
        displayName: world.player(decision.playerId)?.displayName ?? 'A former player',
        label: this.actions.fromDTO(decision.action).describe(),
        chosen: decision.chosen,
        applied: decision.applied,
      })),
    };
  }
}

function share(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

