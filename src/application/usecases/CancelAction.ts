import type { PlayerId } from '../../domain/model/types';
import type { ChangeNotifier } from '../ports/runtime';
import type { SubmissionRepository } from '../ports/SubmissionRepository';
import type { WorldRepository } from '../ports/WorldRepository';
import { loadCurrentWorld, requireOpenTurn, requirePlayer } from './guards';

/** Withdraws a pending intention before the turn resolves. Idempotent: nothing pending is a no-op. */
export class CancelAction {
  constructor(
    private readonly deps: { worlds: WorldRepository; submissions: SubmissionRepository; notifier: ChangeNotifier },
  ) {}

  async execute(input: { playerId: PlayerId; expectedTurn: number }): Promise<{ cancelled: boolean }> {
    const { world } = await loadCurrentWorld(this.deps.worlds);
    requirePlayer(world, input.playerId);
    requireOpenTurn(world, input.expectedTurn);
    const submissions = await this.deps.submissions.get(world.id, world.turn);
    const cancelled = submissions.cancel(input.playerId);
    if (cancelled) {
      await this.deps.submissions.save(submissions);
      this.deps.notifier.worldChanged();
    }
    return { cancelled };
  }
}
