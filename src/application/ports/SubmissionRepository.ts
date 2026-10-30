import type { TurnSubmissions } from '../../domain/entities/TurnSubmissions';

/** Persistence port for players' pending intentions, keyed by world and turn. */
export interface SubmissionRepository {
  /** Returns a fresh instance; an empty set when nobody has submitted for that turn. */
  get(worldId: string, turn: number): Promise<TurnSubmissions>;
  save(submissions: TurnSubmissions): Promise<void>;
}
