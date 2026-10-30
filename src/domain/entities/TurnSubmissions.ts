import type { ActionFactory } from '../actions/ActionFactory';
import type { GameAction } from '../actions/GameAction';
import type { PlayerActionDTO, PlayerId, TurnSubmissionsSnapshot } from '../model/types';

export type SubmissionChange = 'recorded' | 'replaced' | 'unchanged';

/** Players' intentions for one turn of one world, collected until the turn resolves simultaneously. */
export class TurnSubmissions {
  private constructor(
    readonly worldId: string,
    readonly turn: number,
    private readonly actions: Map<PlayerId, GameAction>,
  ) {}

  static empty(worldId: string, turn: number): TurnSubmissions {
    return new TurnSubmissions(worldId, turn, new Map());
  }

  static of(worldId: string, turn: number, actions: Iterable<[PlayerId, GameAction]>): TurnSubmissions {
    return new TurnSubmissions(worldId, turn, new Map(actions));
  }

  static fromSnapshot(snapshot: TurnSubmissionsSnapshot, factory: ActionFactory): TurnSubmissions {
    const entries = Object.entries(snapshot.actions).map(
      ([playerId, dto]) => [playerId, factory.fromDTO(dto)] as [PlayerId, GameAction],
    );
    return new TurnSubmissions(snapshot.worldId, snapshot.turn, new Map(entries));
  }

  /** Idempotent: submitting an identical action again changes nothing. */
  submit(playerId: PlayerId, action: GameAction): SubmissionChange {
    const existing = this.actions.get(playerId);
    if (existing?.equals(action)) return 'unchanged';
    this.actions.set(playerId, action);
    return existing ? 'replaced' : 'recorded';
  }

  /** Idempotent: cancelling when nothing is pending is a no-op that returns false. */
  cancel(playerId: PlayerId): boolean {
    return this.actions.delete(playerId);
  }

  actionOf(playerId: PlayerId): GameAction | undefined {
    return this.actions.get(playerId);
  }

  hasSubmitted(playerId: PlayerId): boolean {
    return this.actions.has(playerId);
  }

  playerIds(): PlayerId[] {
    return [...this.actions.keys()];
  }

  get size(): number {
    return this.actions.size;
  }

  /** True when every listed player has submitted and at least one player is listed. */
  allSubmitted(playerIds: Iterable<PlayerId>): boolean {
    const ids = [...playerIds];
    return ids.length > 0 && ids.every((id) => this.actions.has(id));
  }

  /** A copy that keeps only the given players' actions. */
  only(playerIds: Iterable<PlayerId>): TurnSubmissions {
    const keep = new Set(playerIds);
    return new TurnSubmissions(
      this.worldId,
      this.turn,
      new Map([...this.actions].filter(([id]) => keep.has(id))),
    );
  }

  toSnapshot(): TurnSubmissionsSnapshot {
    const actions: Record<PlayerId, PlayerActionDTO> = {};
    for (const [playerId, action] of this.actions) actions[playerId] = action.toDTO();
    return { worldId: this.worldId, turn: this.turn, actions };
  }
}
