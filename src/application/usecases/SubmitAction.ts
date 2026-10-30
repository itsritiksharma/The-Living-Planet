import type { ActionFactory } from '../../domain/actions/ActionFactory';
import type { SubmissionChange } from '../../domain/entities/TurnSubmissions';
import type { PlayerId } from '../../domain/model/types';
import { DomainError } from '../../domain/shared/DomainError';
import type { ChangeNotifier, PresenceTracker } from '../ports/runtime';
import type { SubmissionRepository } from '../ports/SubmissionRepository';
import type { WorldRepository } from '../ports/WorldRepository';
import { loadCurrentWorld, requireOpenTurn, requirePlayer } from './guards';
import type { ResolveTurn } from './ResolveTurn';

export interface SubmitActionInput {
  playerId: PlayerId;
  expectedTurn: number;
  /** Untrusted serialized intention from the client. */
  action: unknown;
}

export interface SubmitActionOutput {
  change: SubmissionChange;
  /** Set when this submission completed readiness and the turn resolved. */
  resolvedTurn: number | null;
}

/**
 * Records a player's intention for the open turn. Idempotent: an identical re-submission is
 * 'unchanged'. When every connected player is ready, the turn resolves simultaneously.
 */
export class SubmitAction {
  constructor(
    private readonly deps: {
      worlds: WorldRepository;
      submissions: SubmissionRepository;
      presence: PresenceTracker;
      notifier: ChangeNotifier;
      actions: ActionFactory;
      resolveTurn: ResolveTurn;
    },
  ) {}

  async execute(input: SubmitActionInput): Promise<SubmitActionOutput> {
    const action = this.deps.actions.fromDTO(input.action);
    const { world } = await loadCurrentWorld(this.deps.worlds);
    requirePlayer(world, input.playerId);
    requireOpenTurn(world, input.expectedTurn);
    const validation = world.validate(input.playerId, action);
    if (!validation.ok) throw new DomainError(validation.code, validation.message);

    const submissions = await this.deps.submissions.get(world.id, world.turn);
    const change = submissions.submit(input.playerId, action);
    if (change !== 'unchanged') await this.deps.submissions.save(submissions);

    let resolvedTurn: number | null = null;
    const connected = [...this.deps.presence.connectedPlayerIds()].filter((id) => world.hasPlayer(id));
    if (submissions.allSubmitted(connected)) {
      const result = await this.deps.resolveTurn.execute({ turn: world.turn });
      if (result.status === 'resolved') resolvedTurn = result.resolvedTurn;
    }
    this.deps.notifier.worldChanged();
    return { change, resolvedTurn };
  }
}
