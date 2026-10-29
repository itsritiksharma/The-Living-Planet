import type { PlayerId } from '../../domain/model/types';
import type { PlayerViewDTO } from '../../contracts/views';
import type { PresenceTracker } from '../ports/runtime';
import type { SubmissionRepository } from '../ports/SubmissionRepository';
import type { WorldRepository } from '../ports/WorldRepository';
import type { PlayerViewAssembler } from '../views/PlayerViewAssembler';

/** Query: what one viewer (or a not-yet-joined connection) may see of the shared world. Read-only. */
export class GetPlayerView {
  constructor(
    private readonly deps: {
      worlds: WorldRepository;
      submissions: SubmissionRepository;
      presence: PresenceTracker;
      assembler: PlayerViewAssembler;
    },
  ) {}

  async execute(input: { playerId: PlayerId | null }): Promise<PlayerViewDTO | null> {
    const stored = await this.deps.worlds.current();
    if (!stored) return null;
    const { world } = stored;
    const submissions = await this.deps.submissions.get(world.id, world.turn);
    const viewer = input.playerId !== null && world.hasPlayer(input.playerId) ? input.playerId : null;
    return this.deps.assembler.assemble(world, submissions, this.deps.presence.connectedPlayerIds(), viewer);
  }
}
