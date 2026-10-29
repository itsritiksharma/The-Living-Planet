import type { PlayerId } from '../../domain/model/types';
import type { TurnSimulator } from '../../domain/services/TurnSimulator';
import { ApplicationError } from '../errors';
import type { ChangeNotifier, Logger } from '../ports/runtime';
import type { SubmissionRepository } from '../ports/SubmissionRepository';
import type { WorldRepository } from '../ports/WorldRepository';
import { loadCurrentWorld, requirePlayer } from './guards';

export interface ResolveTurnInput {
  turn: number;
  /** Set when a player presses "Resolve now"; omitted when everyone connected is ready. */
  requestedBy?: PlayerId;
}

export interface ResolveTurnOutput {
  status: 'resolved' | 'already_resolved';
  resolvedTurn: number;
  currentTurn: number;
  /** Intentions dropped because the world changed after they were submitted. */
  dropped: { playerId: PlayerId; reason: string }[];
}

/**
 * Resolves the open turn with all submitted intentions; players without one wait.
 * Idempotent by turn number: asking again for a turn that already resolved changes nothing.
 * Saves with the revision it read, so a turn can never be applied twice.
 */
export class ResolveTurn {
  constructor(
    private readonly deps: {
      worlds: WorldRepository;
      submissions: SubmissionRepository;
      simulator: TurnSimulator;
      notifier: ChangeNotifier;
      logger: Logger;
    },
  ) {}

  async execute(input: ResolveTurnInput): Promise<ResolveTurnOutput> {
    const { world, revision } = await loadCurrentWorld(this.deps.worlds);
    if (input.turn < world.turn) {
      return { status: 'already_resolved', resolvedTurn: input.turn, currentTurn: world.turn, dropped: [] };
    }
    if (!world.isActive) throw new ApplicationError('GAME_OVER', 'The scenario has ended.');
    if (input.turn > world.turn) throw new ApplicationError('STALE_TURN', `Turn ${input.turn} has not started yet.`);

    const submissions = await this.deps.submissions.get(world.id, world.turn);
    if (input.requestedBy !== undefined) {
      requirePlayer(world, input.requestedBy);
      if (!submissions.hasSubmitted(input.requestedBy)) {
        throw new ApplicationError('NOT_READY', 'Choose your own action before resolving the turn.');
      }
    }

    // Re-validate: the world may have changed since an intention was submitted (e.g. someone joined).
    const keep: PlayerId[] = [];
    const dropped: ResolveTurnOutput['dropped'] = [];
    for (const playerId of submissions.playerIds()) {
      const action = submissions.actionOf(playerId);
      if (!action) continue;
      const result = world.validate(playerId, action);
      if (result.ok) {
        keep.push(playerId);
        continue;
      }
      dropped.push({ playerId, reason: result.message });
      world.recordEvent({
        turn: world.turn,
        kind: 'action_blocked',
        importance: 'minor',
        summary: `${world.player(playerId)?.displayName ?? 'A player'}'s choice (${action.describe()}) could no longer be applied: ${result.message} They waited instead.`,
        causes: [],
        actorId: playerId,
      });
    }

    const resolution = this.deps.simulator.resolve(world, world.turn, submissions.only(keep));
    if (resolution.status === 'already_resolved') {
      return { status: 'already_resolved', resolvedTurn: input.turn, currentTurn: world.turn, dropped: [] };
    }
    const problems = resolution.world.checkInvariants();
    if (problems.length > 0) {
      this.deps.logger.error(`Invariant check failed after turn ${resolution.resolvedTurn}: ${problems.join(' ')}`);
    }
    await this.deps.worlds.update(resolution.world, revision);
    this.deps.notifier.worldChanged();
    return { status: 'resolved', resolvedTurn: resolution.resolvedTurn, currentTurn: resolution.world.turn, dropped };
  }
}
