import { DisplayName } from '../../domain/model/DisplayName';
import type { PlayerId } from '../../domain/model/types';
import type { ChangeNotifier, IdGenerator } from '../ports/runtime';
import type { SessionRepository } from '../ports/SessionRepository';
import type { WorldRepository } from '../ports/WorldRepository';
import { loadCurrentWorld } from './guards';

export interface JoinGameOutput {
  playerId: PlayerId;
  sessionToken: string;
  worldId: string;
  displayName: string;
}

/**
 * Adds a player to the shared world and issues a session token. Not naturally idempotent (each call
 * creates a new player), so it relies on the command bus: a retried join with the same commandId
 * returns the original player and token instead of creating a duplicate.
 */
export class JoinGame {
  constructor(
    private readonly deps: {
      worlds: WorldRepository;
      sessions: SessionRepository;
      ids: IdGenerator;
      notifier: ChangeNotifier;
    },
  ) {}

  async execute(input: { displayName: string }): Promise<JoinGameOutput> {
    const name = DisplayName.parse(input.displayName);
    const { world, revision } = await loadCurrentWorld(this.deps.worlds);
    const playerId = this.deps.ids.playerId();
    world.admit(playerId, name);
    await this.deps.worlds.update(world, revision);
    const session = { token: this.deps.ids.sessionToken(), playerId };
    await this.deps.sessions.save(session);
    this.deps.notifier.worldChanged();
    return { playerId, sessionToken: session.token, worldId: world.id, displayName: name.value };
  }
}
