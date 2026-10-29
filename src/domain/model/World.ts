import type { GameAction } from '../actions/GameAction';
import type { SimulationConfig } from '../config/riverValley';
import { PlayerFactory } from '../factories/PlayerFactory';
import { DomainError } from '../shared/DomainError';
import { CommunityProject } from './CommunityProject';
import type { DisplayName } from './DisplayName';
import { EventLog } from './EventLog';
import { IndicatorSet } from './IndicatorSet';
import { Player } from './Player';
import { Structure } from './Structure';
import type {
  DecisionRecord,
  EventDraft,
  EventSnapshot,
  HistoryPoint,
  PlayerId,
  ScenarioOutcome,
  StructureKind,
  TurnBreakdown,
  ValidationResult,
  WorldSnapshot,
} from './types';
import { INDICATOR_KEYS } from './types';

export type AdmitResult = 'admitted' | 'already_present';

/**
 * Aggregate root of the shared world. All state changes go through its intention-revealing
 * methods so invariants (bounded indicators, finite land, unique players) always hold.
 *
 * Use cases always work on a fresh instance (rehydrated from an immutable snapshot) and domain
 * services that compute a new turn do so on a clone, so a World a caller holds is never
 * changed behind its back.
 */
export class World {
  private turnNumber: number;
  private statusValue: 'active' | 'ended';
  private indicatorSet: IndicatorSet;
  private readonly playerMap: Map<PlayerId, Player>;
  private readonly structureList: Structure[];
  private readonly projectEntity: CommunityProject;
  private readonly log: EventLog;
  private readonly points: HistoryPoint[];
  private readonly decisionLog: DecisionRecord[];
  private breakdownValue: TurnBreakdown | null;
  private streak: number;
  private outcomeValue: ScenarioOutcome | null;
  private nextStructureSeq: number;
  private nextJoinOrder: number;
  private readonly playerFactory: PlayerFactory;

  private constructor(
    private readonly config: SimulationConfig,
    private readonly worldId: string,
    snapshot: WorldSnapshot,
  ) {
    this.turnNumber = snapshot.turn;
    this.statusValue = snapshot.status;
    this.indicatorSet = IndicatorSet.of(snapshot.indicators);
    this.playerMap = new Map(Object.values(snapshot.players).map((p) => [p.id, Player.fromSnapshot(p)]));
    this.structureList = snapshot.structures.map((s) => Structure.fromSnapshot(s));
    this.projectEntity = CommunityProject.fromSnapshot(snapshot.project);
    this.log = EventLog.fromSnapshot(snapshot.history, snapshot.nextEventSeq);
    this.points = structuredClone(snapshot.historyPoints);
    this.decisionLog = structuredClone(snapshot.decisions);
    this.breakdownValue = structuredClone(snapshot.lastBreakdown);
    this.streak = snapshot.criticalStreak;
    this.outcomeValue = structuredClone(snapshot.outcome);
    this.nextStructureSeq = snapshot.nextStructureSeq;
    this.nextJoinOrder = snapshot.nextJoinOrder;
    this.playerFactory = new PlayerFactory(config);
  }

  static fromSnapshot(snapshot: WorldSnapshot, config: SimulationConfig): World {
    if (snapshot.configVersion !== config.version) {
      throw new DomainError(
        'CONFIG_MISMATCH',
        `World ${snapshot.id} was created with config ${snapshot.configVersion}, not ${config.version}.`,
      );
    }
    return new World(config, snapshot.id, snapshot);
  }

  toSnapshot(): WorldSnapshot {
    const players: WorldSnapshot['players'] = {};
    for (const player of this.players()) players[player.id] = player.toSnapshot();
    return {
      id: this.worldId,
      configVersion: this.config.version,
      turn: this.turnNumber,
      status: this.statusValue,
      indicators: this.indicatorSet.toJSON(),
      players,
      structures: this.structureList.map((s) => s.toSnapshot()),
      project: this.projectEntity.toSnapshot(),
      history: this.log.toSnapshot(),
      historyPoints: structuredClone(this.points),
      decisions: structuredClone(this.decisionLog),
      lastBreakdown: structuredClone(this.breakdownValue),
      criticalStreak: this.streak,
      outcome: structuredClone(this.outcomeValue),
      nextEventSeq: this.log.nextSequence,
      nextStructureSeq: this.nextStructureSeq,
      nextJoinOrder: this.nextJoinOrder,
    };
  }

  /** An independent copy: mutating the clone never affects this instance. */
  clone(): World {
    return World.fromSnapshot(this.toSnapshot(), this.config);
  }

  // ---------------------------------------------------------------- queries

  get id(): string {
    return this.worldId;
  }

  get configVersion(): string {
    return this.config.version;
  }

  /** The turn currently open for actions. */
  get turn(): number {
    return this.turnNumber;
  }

  get status(): 'active' | 'ended' {
    return this.statusValue;
  }

  get isActive(): boolean {
    return this.statusValue === 'active';
  }

  get indicators(): IndicatorSet {
    return this.indicatorSet;
  }

  get project(): CommunityProject {
    return this.projectEntity;
  }

  get criticalStreak(): number {
    return this.streak;
  }

  get outcome(): ScenarioOutcome | null {
    return this.outcomeValue;
  }

  get lastBreakdown(): TurnBreakdown | null {
    return this.breakdownValue;
  }

  /** Players in join order. */
  players(): Player[] {
    return [...this.playerMap.values()].sort((a, b) => a.joinOrder - b.joinOrder);
  }

  player(playerId: PlayerId): Player | undefined {
    return this.playerMap.get(playerId);
  }

  hasPlayer(playerId: PlayerId): boolean {
    return this.playerMap.has(playerId);
  }

  structures(): readonly Structure[] {
    return this.structureList;
  }

  structuresOf(kind: StructureKind): Structure[] {
    return this.structureList.filter((s) => s.kind === kind);
  }

  countOf(kind: StructureKind): number {
    return this.structuresOf(kind).length;
  }

  ownedCount(playerId: PlayerId, kind: StructureKind): number {
    return this.structureList.filter((s) => s.kind === kind && s.ownerId === playerId).length;
  }

  builtBy(playerId: PlayerId): Structure[] {
    return this.structureList.filter((s) => s.ownerId === playerId);
  }

  capacityFor(kind: StructureKind): number {
    const { capacity } = this.config;
    switch (kind) {
      case 'farm':
        return capacity.farmPlots;
      case 'industry':
        return capacity.industryLots;
      case 'efficiency':
        return capacity.efficiencyUpgrades;
      case 'restoration':
        return capacity.restorationSites;
    }
  }

  /** Lowest free expansion slot for a kind, or null when the finite land or capacity is used up. */
  freeSlot(kind: StructureKind): number | null {
    const used = new Set(this.structureList.filter((s) => s.kind === kind && !s.isInitial).map((s) => s.slot));
    for (let slot = 0; slot < this.capacityFor(kind); slot += 1) {
      if (!used.has(slot)) return slot;
    }
    return null;
  }

  freeSlotCount(kind: StructureKind): number {
    return this.capacityFor(kind) - this.structureList.filter((s) => s.kind === kind && !s.isInitial).length;
  }

  history(): readonly EventSnapshot[] {
    return this.log.all();
  }

  historyPoints(): readonly HistoryPoint[] {
    return this.points;
  }

  decisions(): readonly DecisionRecord[] {
    return this.decisionLog;
  }

  /**
   * Deterministic priority for resolving conflicts (e.g. two requests for the last plot): join
   * order, rotated one place per turn so nobody is always first. Network arrival order never matters.
   */
  priorityOrder(turn: number = this.turnNumber): Player[] {
    const players = this.players();
    if (players.length === 0) return players;
    const shift = (turn - 1) % players.length;
    return [...players.slice(shift), ...players.slice(0, shift)];
  }

  /** Validates an intention against the current (start-of-turn) state. Never mutates. */
  validate(playerId: PlayerId, action: GameAction): ValidationResult {
    if (!this.isActive) return { ok: false, code: 'GAME_OVER', message: 'The scenario has ended.' };
    const player = this.playerMap.get(playerId);
    if (!player) return { ok: false, code: 'UNKNOWN_PLAYER', message: 'Unknown player.' };
    return action.validate(this, player, this.config);
  }

  // ------------------------------------------------------------- behaviours

  /**
   * Admits a player. Idempotent by id: admitting the same id and name again changes nothing.
   * Players may join at any turn; they start with the scenario's starting credits.
   */
  admit(playerId: PlayerId, name: DisplayName): AdmitResult {
    const existing = this.playerMap.get(playerId);
    if (existing) {
      if (existing.displayName === name.value) return 'already_present';
      throw new DomainError('PLAYER_CONFLICT', 'That player id is already in use by someone else.');
    }
    if (this.playerMap.size >= this.config.scenario.maxPlayers) {
      throw new DomainError('ROOM_FULL', `The settlement is full (${this.config.scenario.maxPlayers} players).`);
    }
    if (this.players().some((p) => name.matches(p.displayName))) {
      throw new DomainError('NAME_TAKEN', `"${name.value}" is already taken in this settlement.`);
    }
    const player = this.playerFactory.create({
      id: playerId,
      displayName: name,
      joinOrder: this.nextJoinOrder,
      joinedTurn: this.turnNumber,
    });
    this.nextJoinOrder += 1;
    this.playerMap.set(playerId, player);
    this.log.record({
      turn: this.turnNumber,
      kind: 'player_joined',
      importance: 'minor',
      summary: `${player.displayName} joined the settlement with ${player.credits} credits.`,
      causes: [],
      actorId: playerId,
    });
    return 'admitted';
  }

  /** Builds a structure in the lowest free slot. Throws when the finite land/capacity is used up. */
  build(kind: StructureKind, ownerId: PlayerId, turn: number): Structure {
    const slot = this.freeSlot(kind);
    if (slot === null) throw new DomainError('NO_FREE_PLOT', `No free ${kind} slot remains.`);
    const structure = Structure.build({ id: `s${this.nextStructureSeq}`, kind, ownerId, builtTurn: turn, slot });
    this.nextStructureSeq += 1;
    this.structureList.push(structure);
    return structure;
  }

  recordEvent(draft: EventDraft): EventSnapshot {
    return this.log.record(draft);
  }

  recordDecision(record: DecisionRecord): void {
    this.decisionLog.push(structuredClone(record));
  }

  updateIndicators(indicators: IndicatorSet): void {
    this.indicatorSet = indicators;
  }

  recordHistoryPoint(turn: number): void {
    this.points.push({ turn, indicators: this.indicatorSet.toJSON() });
  }

  setBreakdown(breakdown: TurnBreakdown): void {
    this.breakdownValue = structuredClone(breakdown);
  }

  /** Tracks consecutive critical turn-ends; returns the new streak length. */
  registerTurnEnd(critical: boolean): number {
    this.streak = critical ? this.streak + 1 : 0;
    return this.streak;
  }

  advanceTurn(): void {
    if (!this.isActive) throw new DomainError('GAME_OVER', 'The scenario has ended.');
    this.turnNumber += 1;
  }

  end(outcome: ScenarioOutcome): void {
    this.statusValue = 'ended';
    this.outcomeValue = structuredClone(outcome);
  }

  /** Returns descriptions of any broken invariant (empty when the world is consistent). */
  checkInvariants(): string[] {
    const problems: string[] = [];
    for (const key of INDICATOR_KEYS) {
      const value = this.indicatorSet.get(key);
      if (Math.abs(value * 10 - Math.round(value * 10)) > 1e-6) problems.push(`${key} is not rounded to 0.1 (${value}).`);
    }
    for (const player of this.playerMap.values()) {
      if (!Number.isInteger(player.credits) || player.credits < 0) problems.push(`${player.id} has invalid credits.`);
    }
    for (const kind of ['farm', 'industry', 'efficiency', 'restoration'] as const) {
      const built = this.structureList.filter((s) => s.kind === kind && !s.isInitial);
      if (built.length > this.capacityFor(kind)) problems.push(`Too many ${kind} structures.`);
      const slots = new Set(built.map((s) => s.slot));
      if (slots.size !== built.length) problems.push(`Duplicate ${kind} slots.`);
      if (built.some((s) => s.slot < 0 || s.slot >= this.capacityFor(kind))) problems.push(`${kind} slot out of range.`);
    }
    for (const structure of this.structureList) {
      if (structure.ownerId !== null && !this.playerMap.has(structure.ownerId)) problems.push(`${structure.id} has an unknown owner.`);
    }
    const project = this.projectEntity;
    const contributed = Object.values(project.contributions()).reduce((sum, value) => sum + value, 0);
    if (project.funded > project.target) problems.push('Project is overfunded.');
    if (contributed !== project.funded) problems.push('Project contributions do not add up to its funding.');
    if (this.points.length !== this.turnNumber) problems.push('History points do not match resolved turns.');
    this.points.forEach((point, index) => {
      if (point.turn !== index) problems.push(`History point ${index} is labelled turn ${point.turn}.`);
    });
    const ids = new Set(this.log.all().map((e) => e.id));
    if (ids.size !== this.log.size) problems.push('Duplicate event ids.');
    if ((this.statusValue === 'ended') !== (this.outcomeValue !== null)) problems.push('Status and outcome disagree.');
    return problems;
  }
}
