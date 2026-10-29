import type { SafeStorage } from './storage';

export interface StoredSession {
  token: string;
  playerId: string;
  worldId: string;
  displayName: string;
}

/**
 * Per-tab session (sessionStorage), so each browser tab is its own player and a reload resumes
 * the same player.
 */
export class SessionStore {
  private static readonly KEY = 'living-planet:session';

  constructor(private readonly storage: SafeStorage) {}

  load(): StoredSession | null {
    const raw = this.storage.get(SessionStore.KEY);
    if (!raw) return null;
    try {
      const value = JSON.parse(raw) as Partial<StoredSession>;
      if (typeof value.token === 'string' && typeof value.playerId === 'string' && typeof value.worldId === 'string' && typeof value.displayName === 'string') {
        return value as StoredSession;
      }
    } catch {
      // corrupted entry: treat as absent
    }
    this.clear();
    return null;
  }

  save(session: StoredSession): void {
    this.storage.set(SessionStore.KEY, JSON.stringify(session));
  }

  clear(): void {
    this.storage.remove(SessionStore.KEY);
  }
}
