import { DomainError } from '../domain/shared/DomainError';
import type { CommandOutcome, CommandResult, GameCommand } from './commands';
import { ApplicationError, ConcurrencyError } from './errors';
import type { IdempotencyStore } from './ports/IdempotencyStore';
import type { Logger } from './ports/runtime';
import { SerialQueue } from './SerialQueue';
import type { CancelAction } from './usecases/CancelAction';
import type { JoinGame } from './usecases/JoinGame';
import type { ResolveTurn } from './usecases/ResolveTurn';
import type { StartNewScenario } from './usecases/StartNewScenario';
import type { SubmitAction } from './usecases/SubmitAction';

export interface CommandHandlers {
  join: JoinGame;
  submitAction: SubmitAction;
  cancelAction: CancelAction;
  resolveTurn: ResolveTurn;
  startNewScenario: StartNewScenario;
}

const MAX_ATTEMPTS = 2;

/**
 * Single entry point for state-changing commands, providing:
 * - at-most-once execution per commandId: a retry returns the original outcome (`replayed: true`);
 * - protection against a command id being reused for a different request;
 * - serial execution, so two commands never interleave;
 * - one automatic retry after an optimistic-concurrency conflict.
 * Deterministic rejections (domain/application errors) are remembered like successes, because
 * repeating the same request would be rejected the same way. Unexpected errors are not remembered,
 * so a retry can succeed.
 */
export class GameCommandBus {
  private readonly queue = new SerialQueue();

  constructor(
    private readonly deps: { handlers: CommandHandlers; idempotency: IdempotencyStore; logger: Logger },
  ) {}

  dispatch(command: GameCommand): Promise<CommandOutcome> {
    return this.queue.run(() => this.dispatchNow(command));
  }

  private async dispatchNow(command: GameCommand): Promise<CommandOutcome> {
    const key = idempotencyKey(command);
    const fingerprint = fingerprintOf(command);
    const previous = await this.deps.idempotency.get(key);
    if (previous) {
      if (previous.fingerprint !== fingerprint) {
        return {
          ok: false,
          code: 'IDEMPOTENCY_KEY_REUSED',
          message: 'This command id was already used for a different request.',
          replayed: false,
        };
      }
      return { ...previous.outcome, replayed: true };
    }
    const outcome = await this.executeWithRetry(command);
    if (outcome.ok || outcome.code !== 'INTERNAL') {
      await this.deps.idempotency.put(key, { fingerprint, outcome });
    }
    return outcome;
  }

  private async executeWithRetry(command: GameCommand): Promise<CommandOutcome> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return { ok: true, result: await this.execute(command), replayed: false };
      } catch (error) {
        if (error instanceof ConcurrencyError && attempt < MAX_ATTEMPTS) continue;
        return this.toFailure(error);
      }
    }
  }

  private async execute(command: GameCommand): Promise<CommandResult> {
    const { handlers } = this.deps;
    switch (command.kind) {
      case 'join': {
        const joined = await handlers.join.execute({ displayName: command.displayName });
        return { kind: 'joined', ...joined };
      }
      case 'submitAction': {
        const submitted = await handlers.submitAction.execute(command);
        return { kind: 'submitted', ...submitted };
      }
      case 'cancelAction': {
        const cancelled = await handlers.cancelAction.execute(command);
        return { kind: 'cancelled', ...cancelled };
      }
      case 'resolveTurn': {
        const resolved = await handlers.resolveTurn.execute({ turn: command.turn, requestedBy: command.playerId });
        return { kind: 'turn', status: resolved.status, resolvedTurn: resolved.resolvedTurn, currentTurn: resolved.currentTurn };
      }
      case 'startNewScenario': {
        const started = await handlers.startNewScenario.execute(command);
        return { kind: 'scenario', ...started };
      }
    }
  }

  private toFailure(error: unknown): CommandOutcome {
    if (error instanceof DomainError || error instanceof ApplicationError) {
      return { ok: false, code: error.code, message: error.message, replayed: false };
    }
    this.deps.logger.error('Unexpected error while handling a command', error);
    return { ok: false, code: 'INTERNAL', message: 'Something went wrong on the server. Please try again.', replayed: false };
  }
}

/** Joins are keyed by command id alone (no player yet); other commands are scoped to their player. */
export function idempotencyKey(command: GameCommand): string {
  return command.kind === 'join' ? `join:${command.commandId}` : `${command.playerId}:${command.commandId}`;
}

/** Canonical description of what the command asks for, excluding its id. */
export function fingerprintOf(command: GameCommand): string {
  switch (command.kind) {
    case 'join':
      return JSON.stringify(['join', command.displayName]);
    case 'submitAction':
      return JSON.stringify(['submitAction', command.playerId, command.expectedTurn, canonical(command.action)]);
    case 'cancelAction':
      return JSON.stringify(['cancelAction', command.playerId, command.expectedTurn]);
    case 'resolveTurn':
      return JSON.stringify(['resolveTurn', command.playerId, command.turn]);
    case 'startNewScenario':
      return JSON.stringify(['startNewScenario', command.playerId, command.endedWorldId]);
  }
}

/** Key-order-independent JSON for untrusted payloads. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}
