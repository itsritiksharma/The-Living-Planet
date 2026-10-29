import { DomainError } from '../shared/DomainError';
import {
  ConserveWaterAction,
  ContributeToProjectAction,
  ExpandProductionAction,
  InspectSystemAction,
  RestoreWatershedAction,
  WaitAction,
} from './actions';
import type { GameAction } from './GameAction';

const MAX_PROJECT_ID_LENGTH = 64;
const MAX_AMOUNT = 100_000;

/**
 * Builds domain actions from untrusted, serialized input. Rejects unknown action types and any
 * unexpected field, so a client can only express an intention, never a resource value or outcome.
 */
export class ActionFactory {
  fromDTO(input: unknown): GameAction {
    if (!isPlainObject(input)) throw invalidAction('An action must be an object.');
    switch (input.type) {
      case 'EXPAND_PRODUCTION': {
        expectExactKeys(input, ['type', 'target']);
        if (input.target !== 'farm' && input.target !== 'industry') {
          throw invalidAction('Expansion target must be "farm" or "industry".');
        }
        return new ExpandProductionAction(input.target);
      }
      case 'CONSERVE_WATER':
        expectExactKeys(input, ['type']);
        return new ConserveWaterAction();
      case 'RESTORE_WATERSHED':
        expectExactKeys(input, ['type']);
        return new RestoreWatershedAction();
      case 'INSPECT_SYSTEM':
        expectExactKeys(input, ['type']);
        return new InspectSystemAction();
      case 'CONTRIBUTE_TO_PROJECT': {
        expectExactKeys(input, ['type', 'projectId', 'amount']);
        const { projectId, amount } = input;
        if (typeof projectId !== 'string' || projectId.length === 0 || projectId.length > MAX_PROJECT_ID_LENGTH) {
          throw invalidAction('projectId must be a short string.');
        }
        if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 1 || amount > MAX_AMOUNT) {
          throw invalidAction('amount must be a whole number of credits (at least 1).');
        }
        return new ContributeToProjectAction(projectId, amount);
      }
      case 'WAIT':
        expectExactKeys(input, ['type']);
        return new WaitAction();
      default:
        throw invalidAction('Unknown action type.');
    }
  }

  /** The implicit action of a player who made no choice for a turn. */
  wait(): GameAction {
    return new WaitAction();
  }
}

function invalidAction(message: string): DomainError {
  return new DomainError('INVALID_ACTION', message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function expectExactKeys(input: Record<string, unknown>, keys: readonly string[]): void {
  const unexpected = Object.keys(input).filter((key) => !keys.includes(key));
  if (unexpected.length > 0) {
    throw invalidAction(`Unexpected field(s) in action: ${unexpected.join(', ')}. Actions carry intentions only.`);
  }
  const missing = keys.filter((key) => !(key in input));
  if (missing.length > 0) throw invalidAction(`Missing field(s) in action: ${missing.join(', ')}.`);
}
