import type { PlayerId } from '../../domain/model/types';
import { ApplicationError } from '../errors';
import type { SessionRepository } from '../ports/SessionRepository';
import type { WorldRepository } from '../ports/WorldRepository';
import { loadCurrentWorld } from './guards';

export interface ResumeSessionOutput {
  playerId: PlayerId;
  worldId: string;
  displayName: string;
}

/** Re-binds a reconnecting tab to its player. Naturally idempotent: it only reads state. */
export class ResumeSession {
  constructor(private readonly deps: { worlds: WorldRepository; sessions: SessionRepository }) {}

  async execute(input: { sessionToken: string }): Promise<ResumeSessionOutput> {
    const session = await this.deps.sessions.findByToken(input.sessionToken);
    const notFound = new ApplicationError('SESSION_NOT_FOUND', 'That session is no longer valid (the server may have restarted). Please join again.');
    if (!session) throw notFound;
    const { world } = await loadCurrentWorld(this.deps.worlds);
    const player = world.player(session.playerId);
    if (!player) throw notFound;
    return { playerId: player.id, worldId: world.id, displayName: player.displayName };
  }
}
