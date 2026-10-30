import type { Player } from '../../domain/entities/Player';
import type { PlayerId } from '../../domain/model/types';
import type { World } from '../../domain/entities/World';
import { ApplicationError } from '../errors';
import type { StoredWorld, WorldRepository } from '../ports/WorldRepository';

export async function loadCurrentWorld(worlds: WorldRepository): Promise<StoredWorld> {
  const stored = await worlds.current();
  if (!stored) throw new ApplicationError('NO_WORLD', 'No world is running yet.');
  return stored;
}

export function requirePlayer(world: World, playerId: PlayerId): Player {
  const player = world.player(playerId);
  if (!player) throw new ApplicationError('NOT_IN_WORLD', 'You are not part of this settlement.');
  return player;
}

/** Rejects actions on a finished scenario or for a turn other than the one open now. */
export function requireOpenTurn(world: World, expectedTurn: number): void {
  if (!world.isActive) throw new ApplicationError('GAME_OVER', 'The scenario has ended.');
  if (expectedTurn !== world.turn) {
    throw new ApplicationError('STALE_TURN', `That was for turn ${expectedTurn}, but turn ${world.turn} is open now.`);
  }
}
