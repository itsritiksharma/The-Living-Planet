/**
 * WebSocket wire protocol. Clients send intentions tagged with a client-generated `commandId`;
 * the server deduplicates by that id, so resending a command after a reconnect is always safe.
 */
import type { PlayerActionDTO } from '../domain/model/types';
import type { PlayerViewDTO } from './views';

export const WEBSOCKET_PATH = '/ws';
export const MAX_MESSAGE_BYTES = 4096;

export type ClientMessage =
  | { type: 'join'; commandId: string; displayName: string }
  | { type: 'resume'; sessionToken: string }
  | { type: 'submitAction'; commandId: string; expectedTurn: number; action: PlayerActionDTO }
  | { type: 'cancelAction'; commandId: string; expectedTurn: number }
  | { type: 'resolveTurn'; commandId: string; turn: number }
  | { type: 'startNewScenario'; commandId: string; endedWorldId: string };

export type CommandResultDTO =
  | { kind: 'submitted'; change: 'recorded' | 'replaced' | 'unchanged'; resolvedTurn: number | null }
  | { kind: 'cancelled'; cancelled: boolean }
  | { kind: 'turn'; status: 'resolved' | 'already_resolved'; resolvedTurn: number; currentTurn: number }
  | { kind: 'scenario'; status: 'started' | 'already_started'; worldId: string };

export type ServerMessage =
  | { type: 'welcome'; playerId: string; sessionToken: string; worldId: string; displayName: string; commandId?: string; replayed?: boolean }
  | { type: 'state'; view: PlayerViewDTO }
  | { type: 'ack'; commandId: string; replayed: boolean; result: CommandResultDTO }
  | { type: 'error'; code: string; message: string; commandId?: string };
