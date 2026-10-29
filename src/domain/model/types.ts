/**
 * Plain-data shapes of the domain: the serializable snapshots (mementos) that entities are
 * hydrated from and saved to, plus small shared value types.
 *
 * Every indicator value is an abstract game unit on a 0–100 scale. These are simulation
 * assumptions chosen for legibility and balance, not scientific measurements or forecasts.
 */

export type PlayerId = string;
export type EventId = string;
export type StructureId = string;

export const INDICATOR_KEYS = ['water', 'food', 'energy', 'ecosystemHealth', 'pollution'] as const;
export type IndicatorKey = (typeof INDICATOR_KEYS)[number];
export type Indicators = Record<IndicatorKey, number>;

/** Indicators where lower is worse and stress/critical thresholds apply. */
export const DEPLETABLE_KEYS = ['water', 'food', 'energy', 'ecosystemHealth'] as const;
export type DepletableKey = (typeof DEPLETABLE_KEYS)[number];

/** Water, food and energy: the essentials whose shortage raises living costs for everyone. */
export const ESSENTIAL_KEYS = ['water', 'food', 'energy'] as const;
export type EssentialKey = (typeof ESSENTIAL_KEYS)[number];

export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'] as const;
export type Season = (typeof SEASONS)[number];

export type ExpansionTarget = 'farm' | 'industry';

/** Serialized form of a player's intention for one turn. Clients send intentions, never outcomes. */
export type PlayerActionDTO =
  | { type: 'EXPAND_PRODUCTION'; target: ExpansionTarget }
  | { type: 'CONSERVE_WATER' }
  | { type: 'RESTORE_WATERSHED' }
  | { type: 'INSPECT_SYSTEM' }
  | { type: 'CONTRIBUTE_TO_PROJECT'; projectId: string; amount: number }
  | { type: 'WAIT' };

export type ActionType = PlayerActionDTO['type'];

export const ACTION_TYPES: readonly ActionType[] = [
  'EXPAND_PRODUCTION',
  'CONSERVE_WATER',
  'RESTORE_WATERSHED',
  'INSPECT_SYSTEM',
  'CONTRIBUTE_TO_PROJECT',
  'WAIT',
];

export type StructureKind = 'farm' | 'industry' | 'efficiency' | 'restoration';

/**
 * Initial structures have `ownerId: null` and `builtTurn: 0`; their `slot` indexes the initial
 * tiles of that kind. Player-built farms/industry occupy expansion plots/lots (`slot` indexes
 * those); efficiency upgrades and restoration plots use `slot` as upgrade/site number.
 */
export interface StructureSnapshot {
  id: StructureId;
  kind: StructureKind;
  ownerId: PlayerId | null;
  builtTurn: number;
  slot: number;
}

export interface PlayerTotals {
  incomeEarned: number;
  hardshipPaid: number;
  spentOnActions: number;
  contributed: number;
}

export interface PlayerSnapshot {
  id: PlayerId;
  displayName: string;
  /** Stable join sequence: used for deterministic priority, never network arrival order. */
  joinOrder: number;
  joinedTurn: number;
  credits: number;
  totals: PlayerTotals;
  /** Private to this player: produced when they research/inspect the system. */
  report: SystemReport | null;
}

export type ProjectStatus = 'open' | 'in_progress' | 'completed';

export interface ProjectSnapshot {
  id: string;
  name: string;
  target: number;
  funded: number;
  status: ProjectStatus;
  /** Accepted contributions per player (public). */
  contributions: Record<PlayerId, number>;
  fundedTurn: number | null;
  completesTurn: number | null;
}

export type EventKind =
  | 'player_joined'
  | 'action'
  | 'action_blocked'
  | 'turn_summary'
  | 'threshold'
  | 'condition'
  | 'delayed_effect'
  | 'project'
  | 'settlement_growth'
  | 'shortfall'
  | 'warning'
  | 'scenario_end';

/** A history entry. Summaries are generated from actual state transitions, never static flavor text. */
export interface EventSnapshot {
  id: EventId;
  turn: number;
  kind: EventKind;
  importance: 'major' | 'minor';
  summary: string;
  causes: string[];
  deltas?: Partial<Indicators>;
  actorId?: PlayerId;
}

export type EventDraft = Omit<EventSnapshot, 'id'>;

export interface HistoryPoint {
  /** 0 = the initial state; k = the state after turn k resolved. */
  turn: number;
  indicators: Indicators;
}

export interface DecisionRecord {
  turn: number;
  playerId: PlayerId;
  action: PlayerActionDTO;
  /** False when the player made no choice (disconnected, or the turn was resolved early). */
  chosen: boolean;
  applied: boolean;
  note?: string;
}

export interface FlowLine {
  label: string;
  /** Signed contribution to the indicator this turn (positive adds). */
  amount: number;
}

export interface IndicatorBreakdown {
  start: number;
  lines: FlowLine[];
  /** start + sum(lines), before clamping to 0–100. */
  raw: number;
  /** Final value after clamping and rounding. */
  end: number;
}

export interface TurnBreakdown {
  turn: number;
  season: Season;
  year: number;
  /** Fraction of full crop output achieved this turn (0–1). */
  yieldFactor: number;
  yieldReasons: string[];
  /** Fraction of potential river recharge the watershed delivered (0.5–1). */
  watershedFactor: number;
  indicators: Record<IndicatorKey, IndicatorBreakdown>;
}

export interface ForecastPoint {
  turn: number;
  indicators: Indicators;
}

export interface SystemReport {
  /** The report describes the world as it stood after this turn resolved. */
  generatedAfterTurn: number;
  forecast: ForecastPoint[];
  risks: string[];
  relationships: string[];
}

export type OutcomeClass = 'resilient' | 'stressed' | 'crisis';

export interface ScenarioOutcome {
  outcome: OutcomeClass;
  endedEarly: boolean;
  /** The last turn that resolved. */
  finalTurn: number;
  reasons: string[];
}

export interface WorldSnapshot {
  id: string;
  configVersion: string;
  /** The turn currently open for actions (1-based). Once ended, this is finalTurn + 1. */
  turn: number;
  status: 'active' | 'ended';
  indicators: Indicators;
  players: Record<PlayerId, PlayerSnapshot>;
  structures: StructureSnapshot[];
  project: ProjectSnapshot;
  history: EventSnapshot[];
  historyPoints: HistoryPoint[];
  decisions: DecisionRecord[];
  lastBreakdown: TurnBreakdown | null;
  /** Consecutive resolved turns that ended with a critical essential or ecosystem. */
  criticalStreak: number;
  outcome: ScenarioOutcome | null;
  nextEventSeq: number;
  nextStructureSeq: number;
  nextJoinOrder: number;
}

export interface TurnSubmissionsSnapshot {
  worldId: string;
  turn: number;
  actions: Record<PlayerId, PlayerActionDTO>;
}

export type ValidationCode =
  | 'GAME_OVER'
  | 'UNKNOWN_PLAYER'
  | 'INVALID_ACTION'
  | 'INVALID_TARGET'
  | 'INSUFFICIENT_CREDITS'
  | 'NO_FREE_PLOT'
  | 'LIMIT_REACHED'
  | 'UNKNOWN_PROJECT'
  | 'PROJECT_CLOSED'
  | 'INVALID_AMOUNT';

export type ValidationResult = { ok: true } | { ok: false; code: ValidationCode; message: string };
