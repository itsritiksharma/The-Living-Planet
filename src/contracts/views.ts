/**
 * Read models sent to each client. Assembled on the server from the authoritative world, so the
 * map, dashboard, history and project panels always render the same underlying state.
 * Type-only module: safe to import from the browser.
 */
import type {
  EventKind,
  IndicatorKey,
  OutcomeClass,
  PlayerActionDTO,
  ProjectStatus,
  StructureKind,
} from '../domain/model/types';

export type { EventKind, IndicatorKey, OutcomeClass, PlayerActionDTO, ProjectStatus, StructureKind } from '../domain/model/types';

export type IndicatorBandLevel = 'good' | 'watch' | 'stressed' | 'critical';

export interface IndicatorViewDTO {
  key: IndicatorKey;
  label: string;
  value: number;
  /** Change during the last resolved turn; null before the first turn resolves. */
  delta: number | null;
  higherIsBetter: boolean;
  band: { level: IndicatorBandLevel; label: string };
  thresholds: { label: string; value: number }[];
  description: string;
  /** Flows behind the last turn's change (empty before the first turn). */
  breakdown: { label: string; amount: number }[];
}

export interface StructureViewDTO {
  id: string;
  kind: StructureKind;
  slot: number;
  builtTurn: number;
  isInitial: boolean;
  ownerId: string | null;
  ownerName: string | null;
  ownerColor: number | null;
  /** Restoration plots only. */
  growth: { stage: number; total: number; mature: boolean } | null;
}

export interface ProjectViewDTO {
  id: string;
  name: string;
  status: ProjectStatus;
  statusLabel: string;
  funded: number;
  target: number;
  remaining: number;
  fundedTurn: number | null;
  completesTurn: number | null;
  contributions: { playerId: string; displayName: string; amount: number }[];
  nonContributors: string[];
  benefits: string[];
  freeRiderNote: string;
}

export interface EventViewDTO {
  id: string;
  turn: number;
  kind: EventKind;
  importance: 'major' | 'minor';
  summary: string;
  causes: string[];
  deltas?: Partial<Record<IndicatorKey, number>>;
  actorId?: string;
}

export interface CapacityDTO {
  used: number;
  total: number;
}

export interface WorldViewDTO {
  id: string;
  status: 'active' | 'ended';
  /** The turn open for actions. */
  turn: number;
  totalTurns: number;
  lastResolvedTurn: number;
  season: string;
  year: number;
  turnLabel: string;
  indicators: IndicatorViewDTO[];
  /** Expected crop yield next turn under current conditions. */
  yieldPercent: number;
  watershedPercent: number;
  structures: StructureViewDTO[];
  capacity: {
    farmPlots: CapacityDTO;
    industryLots: CapacityDTO;
    efficiencyUpgrades: CapacityDTO;
    restorationSites: CapacityDTO;
  };
  waterUseReductionPercent: number;
  project: ProjectViewDTO;
  /** Risks the current state and rules justify (not a forecast). */
  knownRisks: string[];
  history: EventViewDTO[];
  historyPoints: { turn: number; indicators: Record<IndicatorKey, number> }[];
}

export interface RosterEntryDTO {
  playerId: string;
  displayName: string;
  colorIndex: number;
  joinOrder: number;
  joinedTurn: number;
  connected: boolean;
  ready: boolean;
  credits: number;
  structuresBuilt: number;
  contributed: number;
  isYou: boolean;
}

export type ActionOptionKey = 'expand_farm' | 'expand_industry' | 'conserve' | 'restore' | 'inspect' | 'contribute' | 'wait';

export interface ActionOptionDTO {
  key: ActionOptionKey;
  label: string;
  /** The intention to submit. For contributions, `amount` is a suggested default. */
  template: PlayerActionDTO;
  /** Credits charged when applied; null when the player chooses the amount. */
  cost: number | null;
  costLabel: string;
  available: boolean;
  unavailableReason: string | null;
  immediate: string[];
  delayed: string[];
  risks: string[];
  /** Contributions only: the most this player can offer now. */
  maxAmount: number | null;
  /** True where the optional reflection prompt is offered (expanding production). */
  reflective: boolean;
}

export interface IncomePreviewDTO {
  base: number;
  farms: number;
  industry: number;
  hardship: number;
  net: number;
  notes: string[];
}

export interface SystemReportDTO {
  generatedAfterTurn: number;
  forecast: { turn: number; label: string; indicators: Record<IndicatorKey, number> }[];
  risks: string[];
  relationships: string[];
  disclaimer: string;
}

export interface YouDTO {
  playerId: string;
  displayName: string;
  colorIndex: number;
  credits: number;
  income: IncomePreviewDTO;
  pendingAction: PlayerActionDTO | null;
  pendingLabel: string | null;
  actionOptions: ActionOptionDTO[];
  report: SystemReportDTO | null;
  canResolveNow: boolean;
  /** Connected players who have not chosen yet. */
  waitingFor: string[];
}

export interface ScenarioSummaryDTO {
  outcome: OutcomeClass;
  title: string;
  endedEarly: boolean;
  finalTurn: number;
  reasons: string[];
  tradeOffs: string[];
  indicatorRanges: { key: IndicatorKey; label: string; start: number; end: number; min: number; max: number }[];
  keyEvents: EventViewDTO[];
  players: {
    playerId: string;
    displayName: string;
    colorIndex: number;
    joinedTurn: number;
    credits: number;
    incomeEarned: number;
    spentOnActions: number;
    contributed: number;
    hardshipPaid: number;
    hardshipSharePercent: number;
    built: Record<StructureKind, number>;
  }[];
  decisions: { turn: number; playerId: string; displayName: string; label: string; chosen: boolean; applied: boolean }[];
}

export interface ScenarioInfoDTO {
  name: string;
  configVersion: string;
  totalTurns: number;
  maxPlayers: number;
  mapLayout: string[];
  project: { id: string; name: string; target: number };
  assumptionsNote: string;
}

export interface PlayerViewDTO {
  scenario: ScenarioInfoDTO;
  world: WorldViewDTO;
  roster: RosterEntryDTO[];
  /** Null for a connection that has not joined (spectator view on the join screen). */
  you: YouDTO | null;
  summary: ScenarioSummaryDTO | null;
}
