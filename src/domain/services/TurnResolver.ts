import { ActionFactory } from '../actions/ActionFactory';
import type { AggregationContext } from '../actions/GameAction';
import type { SimulationConfig } from '../config/riverValley';
import type { ContributionOffer } from '../entities/CommunityProject';
import type { Player } from '../entities/Player';
import { ScenarioCalendar } from '../model/ScenarioCalendar';
import type { Structure } from '../entities/Structure';
import type { TurnSubmissions } from '../entities/TurnSubmissions';
import type { EventDraft, PlayerId, StructureKind } from '../model/types';
import type { World } from '../entities/World';
import { DomainError } from '../shared/DomainError';
import { EconomyPolicy } from './EconomyPolicy';
import { EventNarrator, type AppliedAction } from './EventNarrator';
import { FlowCalculator } from './FlowCalculator';
import { OutcomeClassifier } from './OutcomeClassifier';
import { SystemReportBuilder } from './SystemReportBuilder';
import type { ResolveOptions, TurnResolution, TurnSimulator } from './TurnSimulator';

/** Collects one turn's immediate action effects on the draft world (turn order, step 2). */
class TurnAggregation implements AggregationContext {
  readonly offers: ContributionOffer[] = [];
  readonly reportRequests: PlayerId[] = [];
  newFarms = 0;

  constructor(
    private readonly world: World,
    readonly turn: number,
    readonly config: SimulationConfig,
  ) {}

  build(kind: StructureKind, player: Player, cost: number): Structure | null {
    if (this.world.freeSlot(kind) === null) return null;
    player.payForAction(cost);
    const structure = this.world.build(kind, player.id, this.turn);
    if (kind === 'farm') this.newFarms += 1;
    return structure;
  }

  offerContribution(player: Player, amount: number): void {
    this.offers.push({ playerId: player.id, amount });
  }

  requestSystemReport(player: Player): void {
    this.reportRequests.push(player.id);
  }
}

/**
 * Resolves a turn following the documented turn order (docs/SIMULATION_MODEL.md):
 *  1. validate all intentions against the same start-of-turn state
 *  2. aggregate in deterministic priority order (costs, plots, contributions, reports)
 *  3–5. production/consumption, regeneration, pollution and ecosystem response
 *  6–7. threshold effects (from start-of-turn values), then clamp and round
 *  8. private income and shortage hardship
 *  9. decisions, causal events and the turn snapshot
 * 10. end conditions, then advance the turn
 *
 * Pure with respect to its inputs: returns a new World and never mutates the one passed in.
 * Idempotent by turn number: resolving a turn that already resolved is a no-op. Deterministic:
 * no clock, network or unseeded randomness is consulted.
 */
export class TurnResolver implements TurnSimulator {
  private readonly calendar: ScenarioCalendar;
  private readonly flows: FlowCalculator;
  private readonly narrator: EventNarrator;
  private readonly outcomes: OutcomeClassifier;
  private readonly economy: EconomyPolicy;
  private readonly reports: SystemReportBuilder;
  private readonly actions = new ActionFactory();

  constructor(private readonly config: SimulationConfig) {
    this.calendar = new ScenarioCalendar(config);
    this.flows = new FlowCalculator(config, this.calendar);
    this.narrator = new EventNarrator(config, this.calendar);
    this.outcomes = new OutcomeClassifier(config);
    this.economy = new EconomyPolicy(config);
    this.reports = new SystemReportBuilder(config, this.calendar, this);
  }

  resolve(world: World, turn: number, submissions: TurnSubmissions, options: ResolveOptions = {}): TurnResolution {
    if (turn < world.turn) return { status: 'already_resolved', world };
    if (!world.isActive) throw new DomainError('GAME_OVER', 'The scenario has ended.');
    if (turn !== world.turn) throw new DomainError('TURN_NOT_OPEN', `Turn ${turn} is not open; the current turn is ${world.turn}.`);
    if (submissions.worldId !== world.id || submissions.turn !== turn) {
      throw new DomainError('SUBMISSIONS_MISMATCH', 'These submissions belong to a different world or turn.');
    }

    // 1. Validate every intention against the same start-of-turn state (simultaneous turns).
    for (const playerId of submissions.playerIds()) {
      const action = submissions.actionOf(playerId);
      if (!action) continue;
      const result = world.validate(playerId, action);
      if (!result.ok) throw new DomainError(result.code, result.message);
    }

    const draft = world.clone();
    const eventsBefore = draft.history().length;
    const start = world.indicators.toJSON();
    const record = (event: EventDraft | null): void => {
      if (event) draft.recordEvent(event);
    };

    // 2. Aggregate in deterministic priority order; conflicts never depend on arrival order.
    const aggregation = new TurnAggregation(draft, turn, this.config);
    const applied: AppliedAction[] = draft.priorityOrder(turn).map((player) => {
      const submitted = submissions.actionOf(player.id);
      const action = submitted ?? this.actions.wait();
      return { player, action, chosen: submitted !== undefined, application: action.apply(player, aggregation) };
    });
    for (const allocation of draft.project.acceptOffers(aggregation.offers)) {
      if (allocation.accepted > 0) draft.player(allocation.playerId)?.contribute(allocation.accepted);
      const entry = applied.find((candidate) => candidate.player.id === allocation.playerId);
      if (entry) entry.allocation = allocation;
    }
    const fundedNow = draft.project.startConstructionIfFunded(turn, this.config.project.constructionTurns);
    const completedNow = draft.project.completeIfDue(turn);

    // 3–7. Flows from start-of-turn conditions; then clamp to 0–100 and round to 0.1.
    const { breakdown, settled } = this.flows.compute({
      turn,
      start,
      farms: draft.countOf('farm'),
      industry: draft.countOf('industry'),
      efficiencyUpgrades: draft.countOf('efficiency'),
      newFarms: aggregation.newFarms,
      growingRestorationPlots: draft
        .structuresOf('restoration')
        .filter((plot) => plot.isGrowingOn(turn, this.config.restoration.growthTurns)).length,
      wetlandBenefits: draft.project.providesBenefitsOn(turn),
      wetlandCompletedNow: completedNow,
    });
    draft.updateIndicators(settled);
    const end = settled.toJSON();

    // 8. Private economy: income from what each player owns, minus shortage living costs.
    const hardship = this.economy.hardshipDue(start);
    for (const player of draft.players()) {
      player.earn(this.economy.incomeFor(draft, player.id, start).total);
      player.payHardship(hardship.amount);
    }

    // 9. Decisions, causal events (generated from the actual transition) and the snapshot.
    record(this.narrator.newYear(turn));
    for (const entry of applied) {
      const accepted = entry.allocation ? entry.allocation.accepted > 0 : true;
      draft.recordDecision({
        turn,
        playerId: entry.player.id,
        action: entry.action.toDTO(),
        chosen: entry.chosen,
        applied: entry.application.applied && accepted,
        ...(entry.application.applied ? {} : { note: entry.application.reason }),
      });
      record(this.narrator.action(turn, entry, draft));
    }
    if (fundedNow) record(this.narrator.projectFunded(turn, draft));
    if (completedNow) record(this.narrator.projectCompleted(turn, draft));
    record(this.narrator.restoration(turn, draft));
    record(this.narrator.conditions(turn, start, breakdown, hardship));
    record(this.narrator.turnSummary(turn, breakdown, settled.deltaFrom(world.indicators)));
    this.narrator.thresholdCrossings(turn, start, end, breakdown, draft).forEach(record);
    this.narrator.shortfalls(turn, breakdown).forEach(record);
    draft.setBreakdown(breakdown);
    draft.recordHistoryPoint(turn);

    // 10. End conditions, then advance the turn.
    const critical = this.outcomes.criticalIndicators(end);
    const streak = draft.registerTurnEnd(critical.length > 0);
    const endedEarly = streak >= this.config.outcome.failureStreak;
    const finalTurn = this.calendar.isFinalTurn(turn);
    if (critical.length > 0 && !endedEarly && !finalTurn) record(this.narrator.criticalWarning(turn, critical, end));
    draft.advanceTurn();
    if (endedEarly || finalTurn) {
      const outcome = this.outcomes.classify(draft, endedEarly, turn);
      draft.end(outcome);
      record(this.narrator.scenarioEnded(outcome));
    }

    // Private reports for players who researched the system, describing the world after this turn.
    if (options.generateReports !== false && aggregation.reportRequests.length > 0) {
      const report = this.reports.build(draft);
      for (const playerId of aggregation.reportRequests) draft.player(playerId)?.receiveReport(report);
    }

    return { status: 'resolved', world: draft, events: draft.history().slice(eventsBefore), resolvedTurn: turn };
  }
}
