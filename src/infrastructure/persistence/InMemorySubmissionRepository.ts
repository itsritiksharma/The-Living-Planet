import type { SubmissionRepository } from '../../application/ports/SubmissionRepository';
import type { ActionFactory } from '../../domain/actions/ActionFactory';
import { TurnSubmissions } from '../../domain/model/TurnSubmissions';
import type { TurnSubmissionsSnapshot } from '../../domain/model/types';

/** Pending intentions per (world, turn), kept as snapshots; only the current world's are retained. */
export class InMemorySubmissionRepository implements SubmissionRepository {
  private readonly store = new Map<string, TurnSubmissionsSnapshot>();

  constructor(private readonly actions: ActionFactory) {}

  async get(worldId: string, turn: number): Promise<TurnSubmissions> {
    const snapshot = this.store.get(key(worldId, turn));
    return snapshot ? TurnSubmissions.fromSnapshot(snapshot, this.actions) : TurnSubmissions.empty(worldId, turn);
  }

  async save(submissions: TurnSubmissions): Promise<void> {
    for (const existing of this.store.keys()) {
      if (!existing.startsWith(`${submissions.worldId}:`)) this.store.delete(existing);
    }
    this.store.set(key(submissions.worldId, submissions.turn), submissions.toSnapshot());
  }
}

function key(worldId: string, turn: number): string {
  return `${worldId}:${turn}`;
}
