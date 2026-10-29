import type { PresenceTracker } from '../../application/ports/runtime';
import type { PlayerId } from '../../domain/model/types';
import type { ServerMessage } from '../../contracts/protocol';

/** A live client connection, independent of the transport library. */
export interface ClientConnection {
  readonly id: string;
  send(message: ServerMessage): void;
}

export interface RegisteredConnection {
  connection: ClientConnection;
  playerId: PlayerId | null;
}

/** Tracks live connections and which player each one is bound to; doubles as the presence port. */
export class ConnectionRegistry implements PresenceTracker {
  private readonly entries = new Map<string, RegisteredConnection>();

  add(connection: ClientConnection): void {
    this.entries.set(connection.id, { connection, playerId: null });
  }

  /** Removes a connection and returns the player it was bound to, if any. */
  remove(connectionId: string): PlayerId | null {
    const entry = this.entries.get(connectionId);
    this.entries.delete(connectionId);
    return entry?.playerId ?? null;
  }

  get(connectionId: string): RegisteredConnection | undefined {
    return this.entries.get(connectionId);
  }

  bind(connectionId: string, playerId: PlayerId): void {
    const entry = this.entries.get(connectionId);
    if (entry) entry.playerId = playerId;
  }

  playerOf(connectionId: string): PlayerId | null {
    return this.entries.get(connectionId)?.playerId ?? null;
  }

  all(): RegisteredConnection[] {
    return [...this.entries.values()];
  }

  connectedPlayerIds(): ReadonlySet<PlayerId> {
    const ids = new Set<PlayerId>();
    for (const entry of this.entries.values()) if (entry.playerId) ids.add(entry.playerId);
    return ids;
  }
}
