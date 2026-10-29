import type { PlayerId } from '../../domain/model/types';

/** Source of identifiers. Randomness lives here, outside the deterministic domain. */
export interface IdGenerator {
  worldId(): string;
  playerId(): string;
  sessionToken(): string;
}

/** Which players currently have a live connection (decides when "everyone is ready"). */
export interface PresenceTracker {
  connectedPlayerIds(): ReadonlySet<PlayerId>;
}

/** Tells delivery mechanisms that the shared world (or its readiness) changed. */
export interface ChangeNotifier {
  worldChanged(): void;
}

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
}
