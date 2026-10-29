import type { PlayerId } from '../../domain/model/types';

/** A bearer token that lets a browser tab resume its player after reconnecting. */
export interface PlayerSession {
  token: string;
  playerId: PlayerId;
}

export interface SessionRepository {
  findByToken(token: string): Promise<PlayerSession | null>;
  save(session: PlayerSession): Promise<void>;
}
