import type { SimulationConfig } from '../../domain/config/riverValley';
import { plural } from '../../domain/model/labels';
import { ScenarioCalendar } from '../../domain/model/ScenarioCalendar';
import type { TurnSubmissions } from '../../domain/entities/TurnSubmissions';
import type { PlayerId, SystemReport } from '../../domain/model/types';
import type { World } from '../../domain/entities/World';
import { EconomyPolicy } from '../../domain/services/EconomyPolicy';
import { FlowCalculator } from '../../domain/services/FlowCalculator';
import type {
  PlayerViewDTO,
  ProjectViewDTO,
  RosterEntryDTO,
  StructureViewDTO,
  SystemReportDTO,
  WorldViewDTO,
  YouDTO,
} from '../../contracts/views';
import { ActionOptionsAssembler } from './ActionOptionsAssembler';
import { toEventView } from './eventView';
import { IndicatorPresenter } from './IndicatorPresenter';
import { ScenarioSummaryAssembler } from './ScenarioSummaryAssembler';

const PLAYER_COLORS = 6;
const PROJECT_STATUS_LABELS = { open: 'Open for contributions', in_progress: 'Under construction', completed: 'Complete' } as const;

/**
 * Projects the authoritative world into what one viewer may see. Private data (other players'
 * pending choices and research reports) never leaves the server.
 */
export class PlayerViewAssembler {
  private readonly calendar: ScenarioCalendar;
  private readonly flows: FlowCalculator;
  private readonly economy: EconomyPolicy;
  private readonly indicators: IndicatorPresenter;
  private readonly options: ActionOptionsAssembler;
  private readonly summary: ScenarioSummaryAssembler;

  constructor(private readonly config: SimulationConfig) {
    this.calendar = new ScenarioCalendar(config);
    this.flows = new FlowCalculator(config, this.calendar);
    this.economy = new EconomyPolicy(config);
    this.indicators = new IndicatorPresenter(config, this.calendar);
    this.options = new ActionOptionsAssembler(config);
    this.summary = new ScenarioSummaryAssembler(config);
  }

  assemble(world: World, submissions: TurnSubmissions, connected: ReadonlySet<PlayerId>, viewerId: PlayerId | null): PlayerViewDTO {
    const colorIndex = new Map(world.players().map((p, index) => [p.id, index % PLAYER_COLORS]));
    const colorOf = (id: PlayerId): number => colorIndex.get(id) ?? 0;
    const viewer = viewerId !== null ? world.player(viewerId) : undefined;
    return {
      scenario: {
        name: this.config.scenario.name,
        configVersion: this.config.version,
        totalTurns: this.config.scenario.totalTurns,
        maxPlayers: this.config.scenario.maxPlayers,
        mapLayout: [...this.config.map.layout],
        project: { id: this.config.project.id, name: this.config.project.name, target: this.config.project.target },
        assumptionsNote: 'All numbers are game units chosen for this scenario, not scientific measurements or forecasts.',
      },
      world: this.worldView(world, colorOf),
      roster: world.players().map(
        (p): RosterEntryDTO => ({
          playerId: p.id,
          displayName: p.displayName,
          colorIndex: colorOf(p.id),
          joinOrder: p.joinOrder,
          joinedTurn: p.joinedTurn,
          connected: connected.has(p.id),
          ready: world.isActive && submissions.hasSubmitted(p.id),
          credits: p.credits,
          structuresBuilt: world.builtBy(p.id).length,
          contributed: world.project.contributionOf(p.id),
          isYou: p.id === viewerId,
        }),
      ),
      you: viewer ? this.you(world, submissions, connected, viewer.id, colorOf) : null,
      summary: this.summary.build(world, colorOf),
    };
  }

  private worldView(world: World, colorOf: (id: PlayerId) => number): WorldViewDTO {
    const openTurn = Math.min(world.turn, this.config.scenario.totalTurns);
    const growthTurns = this.config.restoration.growthTurns;
    const values = world.indicators.toJSON();
    const capacity = (kind: 'farm' | 'industry' | 'efficiency' | 'restoration') => ({
      used: world.capacityFor(kind) - world.freeSlotCount(kind),
      total: world.capacityFor(kind),
    });
    return {
      id: world.id,
      status: world.status,
      turn: world.turn,
      totalTurns: this.config.scenario.totalTurns,
      lastResolvedTurn: world.turn - 1,
      season: this.calendar.season(openTurn),
      year: this.calendar.year(openTurn),
      turnLabel: world.isActive
        ? `Turn ${world.turn} of ${this.config.scenario.totalTurns} · ${this.calendar.label(world.turn)}`
        : `Scenario ended after turn ${world.turn - 1}`,
      indicators: this.indicators.present(world),
      yieldPercent: Math.round(this.flows.yieldFactor(values).factor * 100),
      watershedPercent: Math.round(this.flows.watershedFactor(values.ecosystemHealth) * 100),
      structures: world.structures().map(
        (s): StructureViewDTO => ({
          id: s.id,
          kind: s.kind,
          slot: s.slot,
          builtTurn: s.builtTurn,
          isInitial: s.isInitial,
          ownerId: s.ownerId,
          ownerName: s.ownerId ? (world.player(s.ownerId)?.displayName ?? null) : null,
          ownerColor: s.ownerId ? colorOf(s.ownerId) : null,
          growth:
            s.kind === 'restoration'
              ? {
                  stage: s.growthStage(world.turn, growthTurns),
                  total: growthTurns,
                  mature: s.growthStage(world.turn, growthTurns) >= growthTurns,
                }
              : null,
        }),
      ),
      capacity: {
        farmPlots: capacity('farm'),
        industryLots: capacity('industry'),
        efficiencyUpgrades: capacity('efficiency'),
        restorationSites: capacity('restoration'),
      },
      waterUseReductionPercent: Math.round(world.countOf('efficiency') * this.config.efficiency.waterUseReduction * 100),
      project: this.projectView(world),
      knownRisks: this.indicators.knownRisks(world),
      history: world.history().map(toEventView),
      historyPoints: world.historyPoints().map((point) => ({ turn: point.turn, indicators: { ...point.indicators } })),
    };
  }

  private projectView(world: World): ProjectViewDTO {
    const project = world.project;
    const contributions = project.contributions();
    const p = this.config.project;
    const statusLabel = world.isActive
      ? PROJECT_STATUS_LABELS[project.status]
      : project.status === 'open'
        ? 'Never built: the scenario ended before it was funded'
        : project.status === 'in_progress'
          ? 'Funded, but unfinished when the scenario ended'
          : PROJECT_STATUS_LABELS.completed;
    return {
      id: project.id,
      name: project.name,
      status: project.status,
      statusLabel,
      funded: project.funded,
      target: project.target,
      remaining: project.remaining,
      fundedTurn: project.fundedTurn,
      completesTurn: project.completesTurn,
      contributions: world
        .players()
        .filter((player) => (contributions[player.id] ?? 0) > 0)
        .map((player) => ({ playerId: player.id, displayName: player.displayName, amount: contributions[player.id] ?? 0 })),
      nonContributors: world
        .players()
        .filter((player) => !((contributions[player.id] ?? 0) > 0))
        .map((player) => player.displayName),
      benefits: [
        `+${p.rechargeBonus} water recharge every turn after completion.`,
        `−${p.pollutionFiltration} pollution every turn after completion (filtration).`,
        `+${p.completionEcosystem} ecosystem health once, when it completes.`,
        `Construction takes ${plural(p.constructionTurns, 'turn')} after the target is reached.`,
      ],
      freeRiderNote: 'Benefits go to everyone in the valley, whether or not they contributed. Contributions are public.',
    };
  }

  private you(
    world: World,
    submissions: TurnSubmissions,
    connected: ReadonlySet<PlayerId>,
    playerId: PlayerId,
    colorOf: (id: PlayerId) => number,
  ): YouDTO {
    const player = world.player(playerId);
    if (!player) throw new Error(`Unknown viewer ${playerId}`);
    const start = world.indicators.toJSON();
    const income = this.economy.incomeFor(world, playerId, start);
    const hardship = this.economy.hardshipDue(start);
    const pending = world.isActive ? submissions.actionOf(playerId) : undefined;
    const notes: string[] = [];
    if (income.industryReduced) notes.push('Industry income is halved while water is critical.');
    if (hardship.amount > 0) notes.push(`Shortages cost every player up to ${plural(hardship.amount, 'credit')} this turn.`);
    return {
      playerId,
      displayName: player.displayName,
      colorIndex: colorOf(playerId),
      credits: player.credits,
      income: {
        base: income.base,
        farms: income.farms,
        industry: income.industry,
        hardship: hardship.amount,
        net: income.total - hardship.amount,
        notes,
      },
      pendingAction: pending ? pending.toDTO() : null,
      pendingLabel: pending ? pending.describe() : null,
      actionOptions: world.isActive ? this.options.build(world, playerId) : [],
      report: player.report ? this.reportView(player.report) : null,
      canResolveNow: world.isActive && submissions.hasSubmitted(playerId),
      waitingFor: world.isActive
        ? world
            .players()
            .filter((p) => connected.has(p.id) && !submissions.hasSubmitted(p.id))
            .map((p) => p.displayName)
        : [],
    };
  }

  private reportView(report: SystemReport): SystemReportDTO {
    return {
      generatedAfterTurn: report.generatedAfterTurn,
      forecast: report.forecast.map((point) => ({
        turn: point.turn,
        label: this.calendar.label(point.turn),
        indicators: { ...point.indicators },
      })),
      risks: [...report.risks],
      relationships: [...report.relationships],
      disclaimer: "Projection under the game's rules if every player waits. Game units, not a real-world forecast.",
    };
  }
}
