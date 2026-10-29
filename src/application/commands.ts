import type { PlayerId } from '../domain/model/types';

/**
 * Commands change shared state. Each carries a client-generated `commandId`; the command bus
 * guarantees a given id is executed at most once and replays the original outcome on retries.
 * Player identity comes from the authenticated connection, never from the message body.
 */
export type GameCommand =
  | { kind: 'join'; commandId: string; displayName: string }
  | { kind: 'submitAction'; commandId: string; playerId: PlayerId; expectedTurn: number; action: unknown }
  | { kind: 'cancelAction'; commandId: string; playerId: PlayerId; expectedTurn: number }
  | { kind: 'resolveTurn'; commandId: string; playerId: PlayerId; turn: number }
  | { kind: 'startNewScenario'; commandId: string; playerId: PlayerId; endedWorldId: string };

export type CommandResult =
  | { kind: 'joined'; playerId: PlayerId; worldId: string; sessionToken: string; displayName: string }
  | { kind: 'submitted'; change: 'recorded' | 'replaced' | 'unchanged'; resolvedTurn: number | null }
  | { kind: 'cancelled'; cancelled: boolean }
  | { kind: 'turn'; status: 'resolved' | 'already_resolved'; resolvedTurn: number; currentTurn: number }
  | { kind: 'scenario'; status: 'started' | 'already_started'; worldId: string };

export type CommandOutcome =
  | { ok: true; result: CommandResult; replayed: boolean }
  | { ok: false; code: string; message: string; replayed: boolean };
