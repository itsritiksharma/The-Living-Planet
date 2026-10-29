import type { CommandOutcome } from '../commands';

export interface IdempotencyRecord {
  /** Canonical form of the original request, to detect a command id reused for a different request. */
  fingerprint: string;
  outcome: CommandOutcome;
}

/** Remembers processed command ids so retries return the original outcome instead of re-executing. */
export interface IdempotencyStore {
  get(key: string): Promise<IdempotencyRecord | undefined>;
  put(key: string, record: IdempotencyRecord): Promise<void>;
}
