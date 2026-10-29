import type { CommandOutcome, CommandResult, GameCommand } from '../../application/commands';
import { ApplicationError } from '../../application/errors';
import type { GameCommandBus } from '../../application/GameCommandBus';
import type { ChangeNotifier, Logger } from '../../application/ports/runtime';
import type { ResumeSession } from '../../application/usecases/ResumeSession';
import type { PlayerId } from '../../domain/model/types';
import type { ClientMessage, CommandResultDTO, ServerMessage } from '../../contracts/protocol';
import type { ConnectionRegistry } from './ConnectionRegistry';
import { MessageParser } from './MessageParser';

type Welcome = Extract<ServerMessage, { type: 'welcome' }>;

/**
 * Interface adapter between the wire protocol and the use cases. Player identity always comes from
 * the connection's session binding, never from the message, so a client cannot act for someone else.
 */
export class GameController {
  private readonly parser = new MessageParser();
  /** The join each connection completed, so a resent join on the same connection is answered idempotently. */
  private readonly joins = new Map<string, { commandId: string; welcome: Welcome }>();

  constructor(
    private readonly deps: {
      bus: GameCommandBus;
      resume: ResumeSession;
      registry: ConnectionRegistry;
      notifier: ChangeNotifier;
      logger: Logger;
    },
  ) {}

  /** Handles one raw message; replies go only to the sending connection. */
  async receive(connectionId: string, raw: string): Promise<void> {
    const entry = this.deps.registry.get(connectionId);
    if (!entry) return;
    const parsed = this.parser.parse(raw);
    const replies: ServerMessage[] = parsed.ok
      ? await this.handle(connectionId, parsed.message)
      : [error(parsed.code, parsed.message, parsed.commandId)];
    for (const reply of replies) entry.connection.send(reply);
  }

  forget(connectionId: string): void {
    this.joins.delete(connectionId);
  }

  async handle(connectionId: string, message: ClientMessage): Promise<ServerMessage[]> {
    switch (message.type) {
      case 'join':
        return this.join(connectionId, message);
      case 'resume':
        return this.resume(connectionId, message.sessionToken);
      default: {
        const playerId = this.deps.registry.playerOf(connectionId);
        if (!playerId) return [error('NOT_JOINED', 'Join the settlement first.', message.commandId)];
        const outcome = await this.deps.bus.dispatch(toCommand(message, playerId));
        if (!outcome.ok) return [error(outcome.code, outcome.message, message.commandId)];
        return [{ type: 'ack', commandId: message.commandId, replayed: outcome.replayed, result: toResultDTO(outcome.result) }];
      }
    }
  }

  private async join(connectionId: string, message: Extract<ClientMessage, { type: 'join' }>): Promise<ServerMessage[]> {
    const previous = this.joins.get(connectionId);
    if (previous) {
      if (previous.commandId === message.commandId) return [{ ...previous.welcome, replayed: true }];
      return [error('ALREADY_JOINED', 'This connection has already joined the settlement.', message.commandId)];
    }
    const outcome: CommandOutcome = await this.deps.bus.dispatch({
      kind: 'join',
      commandId: message.commandId,
      displayName: message.displayName,
    });
    if (!outcome.ok) return [error(outcome.code, outcome.message, message.commandId)];
    if (outcome.result.kind !== 'joined') return [error('INTERNAL', 'Unexpected join result.', message.commandId)];
    const { playerId, sessionToken, worldId, displayName } = outcome.result;
    const welcome: Welcome = { type: 'welcome', playerId, sessionToken, worldId, displayName, commandId: message.commandId };
    this.joins.set(connectionId, { commandId: message.commandId, welcome });
    this.deps.registry.bind(connectionId, playerId);
    this.deps.notifier.worldChanged();
    return [{ ...welcome, replayed: outcome.replayed }];
  }

  private async resume(connectionId: string, sessionToken: string): Promise<ServerMessage[]> {
    try {
      const resumed = await this.deps.resume.execute({ sessionToken });
      this.deps.registry.bind(connectionId, resumed.playerId);
      this.deps.notifier.worldChanged();
      return [{ type: 'welcome', playerId: resumed.playerId, sessionToken, worldId: resumed.worldId, displayName: resumed.displayName }];
    } catch (caught) {
      if (caught instanceof ApplicationError) return [error(caught.code, caught.message)];
      this.deps.logger.error('Unexpected error while resuming a session', caught);
      return [error('INTERNAL', 'Something went wrong on the server. Please try again.')];
    }
  }
}

function toCommand(message: Exclude<ClientMessage, { type: 'join' | 'resume' }>, playerId: PlayerId): GameCommand {
  switch (message.type) {
    case 'submitAction':
      return { kind: 'submitAction', commandId: message.commandId, playerId, expectedTurn: message.expectedTurn, action: message.action };
    case 'cancelAction':
      return { kind: 'cancelAction', commandId: message.commandId, playerId, expectedTurn: message.expectedTurn };
    case 'resolveTurn':
      return { kind: 'resolveTurn', commandId: message.commandId, playerId, turn: message.turn };
    case 'startNewScenario':
      return { kind: 'startNewScenario', commandId: message.commandId, playerId, endedWorldId: message.endedWorldId };
  }
}

function toResultDTO(result: CommandResult): CommandResultDTO {
  switch (result.kind) {
    case 'submitted':
      return { kind: 'submitted', change: result.change, resolvedTurn: result.resolvedTurn };
    case 'cancelled':
      return { kind: 'cancelled', cancelled: result.cancelled };
    case 'turn':
      return { kind: 'turn', status: result.status, resolvedTurn: result.resolvedTurn, currentTurn: result.currentTurn };
    case 'scenario':
      return { kind: 'scenario', status: result.status, worldId: result.worldId };
    case 'joined':
      throw new Error('Join results are delivered as welcome messages.');
  }
}

function error(code: string, message: string, commandId?: string): ServerMessage {
  return commandId ? { type: 'error', code, message, commandId } : { type: 'error', code, message };
}
