import type { PlayerSession, SessionRepository } from '../../application/ports/SessionRepository';

export class InMemorySessionRepository implements SessionRepository {
  private readonly sessions = new Map<string, PlayerSession>();

  async findByToken(token: string): Promise<PlayerSession | null> {
    const session = this.sessions.get(token);
    return session ? { ...session } : null;
  }

  async save(session: PlayerSession): Promise<void> {
    this.sessions.set(session.token, { ...session });
  }
}
