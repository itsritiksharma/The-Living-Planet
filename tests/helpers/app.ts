import type { ChangeNotifier, IdGenerator, Logger, PresenceTracker } from '../../src/application/ports/runtime';
import { createGameApplication } from '../../src/infrastructure/composition/createGameApplication';

export class FakePresence implements PresenceTracker {
  readonly ids = new Set<string>();

  connectedPlayerIds(): ReadonlySet<string> {
    return this.ids;
  }
}

export class RecordingNotifier implements ChangeNotifier {
  count = 0;

  worldChanged(): void {
    this.count += 1;
  }
}

/** Predictable ids for tests (production uses CryptoIdGenerator). */
export class SequentialIds implements IdGenerator {
  private next = 0;

  worldId(): string {
    this.next += 1;
    return `world-${this.next}`;
  }

  playerId(): string {
    this.next += 1;
    return `player-${this.next}`;
  }

  sessionToken(): string {
    this.next += 1;
    return `token-${this.next}`;
  }
}

export class SilentLogger implements Logger {
  readonly errors: string[] = [];

  info(): void {}

  warn(): void {}

  error(message: string): void {
    this.errors.push(message);
  }
}

export async function createTestApp() {
  const presence = new FakePresence();
  const notifier = new RecordingNotifier();
  const logger = new SilentLogger();
  const app = createGameApplication({ presence, notifier, ids: new SequentialIds(), logger });
  await app.initialize.execute();
  let commands = 0;
  const nextCommandId = () => {
    commands += 1;
    return `cmd-${String(commands).padStart(6, '0')}`;
  };
  /** Joins and marks the player as connected; returns the new player's id and token. */
  const join = async (displayName: string) => {
    const outcome = await app.bus.dispatch({ kind: 'join', commandId: nextCommandId(), displayName });
    if (!outcome.ok || outcome.result.kind !== 'joined') throw new Error(`join failed: ${JSON.stringify(outcome)}`);
    presence.ids.add(outcome.result.playerId);
    return outcome.result;
  };
  return { app, presence, notifier, logger, nextCommandId, join };
}
