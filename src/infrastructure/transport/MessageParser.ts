import type { PlayerActionDTO } from '../../domain/model/types';
import { MAX_MESSAGE_BYTES, type ClientMessage } from '../../contracts/protocol';

export type ParseResult =
  | { ok: true; message: ClientMessage }
  | { ok: false; code: 'BAD_MESSAGE'; message: string; commandId?: string };

const COMMAND_ID = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_TEXT = 128;
const MAX_TURN = 10_000;

/**
 * Validates raw WebSocket text against the protocol: size, JSON, known message types and exact
 * field sets. Any extra field (e.g. a client trying to send `credits` or `water`) is rejected.
 * Action payload contents are validated again, strictly, by the domain ActionFactory.
 */
export class MessageParser {
  parse(raw: string): ParseResult {
    if (Buffer.byteLength(raw, 'utf8') > MAX_MESSAGE_BYTES) return bad(`Messages are limited to ${MAX_MESSAGE_BYTES} bytes.`);
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return bad('Messages must be valid JSON.');
    }
    if (!isPlainObject(data)) return bad('Messages must be JSON objects.');
    const commandId = typeof data.commandId === 'string' && COMMAND_ID.test(data.commandId) ? data.commandId : undefined;
    const fail = (message: string): ParseResult => bad(message, commandId);

    switch (data.type) {
      case 'join': {
        const problem = exactKeys(data, ['type', 'commandId', 'displayName']) ?? requireCommandId(commandId);
        if (problem) return fail(problem);
        if (typeof data.displayName !== 'string' || data.displayName.length > MAX_TEXT) return fail('displayName must be a short string.');
        return ok({ type: 'join', commandId: commandId as string, displayName: data.displayName });
      }
      case 'resume': {
        const problem = exactKeys(data, ['type', 'sessionToken']);
        if (problem) return fail(problem);
        if (typeof data.sessionToken !== 'string' || data.sessionToken.length === 0 || data.sessionToken.length > MAX_TEXT) {
          return fail('sessionToken must be a short string.');
        }
        return ok({ type: 'resume', sessionToken: data.sessionToken });
      }
      case 'submitAction': {
        const problem =
          exactKeys(data, ['type', 'commandId', 'expectedTurn', 'action']) ?? requireCommandId(commandId) ?? requireTurn(data.expectedTurn, 'expectedTurn');
        if (problem) return fail(problem);
        if (!isPlainObject(data.action)) return fail('action must be an object.');
        return ok({
          type: 'submitAction',
          commandId: commandId as string,
          expectedTurn: data.expectedTurn as number,
          action: data.action as PlayerActionDTO,
        });
      }
      case 'cancelAction': {
        const problem = exactKeys(data, ['type', 'commandId', 'expectedTurn']) ?? requireCommandId(commandId) ?? requireTurn(data.expectedTurn, 'expectedTurn');
        if (problem) return fail(problem);
        return ok({ type: 'cancelAction', commandId: commandId as string, expectedTurn: data.expectedTurn as number });
      }
      case 'resolveTurn': {
        const problem = exactKeys(data, ['type', 'commandId', 'turn']) ?? requireCommandId(commandId) ?? requireTurn(data.turn, 'turn');
        if (problem) return fail(problem);
        return ok({ type: 'resolveTurn', commandId: commandId as string, turn: data.turn as number });
      }
      case 'startNewScenario': {
        const problem = exactKeys(data, ['type', 'commandId', 'endedWorldId']) ?? requireCommandId(commandId);
        if (problem) return fail(problem);
        if (typeof data.endedWorldId !== 'string' || data.endedWorldId.length === 0 || data.endedWorldId.length > MAX_TEXT) {
          return fail('endedWorldId must be a short string.');
        }
        return ok({ type: 'startNewScenario', commandId: commandId as string, endedWorldId: data.endedWorldId });
      }
      default:
        return fail('Unknown message type.');
    }
  }
}

function ok(message: ClientMessage): ParseResult {
  return { ok: true, message };
}

function bad(message: string, commandId?: string): ParseResult {
  return commandId ? { ok: false, code: 'BAD_MESSAGE', message, commandId } : { ok: false, code: 'BAD_MESSAGE', message };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(data: Record<string, unknown>, keys: readonly string[]): string | null {
  const unexpected = Object.keys(data).filter((key) => !keys.includes(key));
  if (unexpected.length > 0) return `Unexpected field(s): ${unexpected.join(', ')}. Clients send intentions only.`;
  const missing = keys.filter((key) => !(key in data));
  return missing.length > 0 ? `Missing field(s): ${missing.join(', ')}.` : null;
}

function requireCommandId(commandId: string | undefined): string | null {
  return commandId ? null : 'commandId must be 8–64 letters, digits, "-" or "_".';
}

function requireTurn(value: unknown, field: string): string | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_TURN
    ? null
    : `${field} must be a positive whole number.`;
}
