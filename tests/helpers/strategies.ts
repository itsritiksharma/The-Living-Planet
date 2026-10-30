import type { Player } from '../../src/domain/entities/Player';
import type { PlayerActionDTO } from '../../src/domain/model/types';
import type { World } from '../../src/domain/entities/World';
import { DTO, actionFactory, resolve } from './fixtures';

/** A scripted player: picks an intention from the visible world state. */
export type Strategy = (world: World, player: Player, index: number) => PlayerActionDTO;

const valid = (world: World, player: Player, dto: PlayerActionDTO): boolean =>
  world.validate(player.id, actionFactory.fromDTO(dto)).ok;

const contributeAll = (world: World, player: Player): PlayerActionDTO =>
  DTO.contribute(Math.min(player.credits, world.project.remaining));

/** Maximizes private income: build industry, then farms, whenever affordable. */
export const expansionist: Strategy = (world, player) => {
  if (valid(world, player, DTO.expandIndustry)) return DTO.expandIndustry;
  if (valid(world, player, DTO.expandFarm)) return DTO.expandFarm;
  return DTO.wait;
};

/** Conservation and restoration only; funds the wetland when it can. Never adds production. */
export const steward: Strategy = (world, player) => {
  if (world.turn % 2 === 1 && valid(world, player, DTO.restore)) return DTO.restore;
  if (valid(world, player, DTO.conserve)) return DTO.conserve;
  if (world.project.isOpen && player.credits >= 8) return contributeAll(world, player);
  if (valid(world, player, DTO.restore)) return DTO.restore;
  return DTO.wait;
};

/** Some production for real needs, then mitigation and a contribution to the shared project. */
export const balanced: Strategy = (world, player) => {
  const turn = world.turn;
  const scripted: Record<number, PlayerActionDTO> = { 1: DTO.expandFarm, 2: DTO.expandIndustry, 3: DTO.restore, 4: DTO.conserve };
  const planned = scripted[turn];
  if (planned && valid(world, player, planned)) return planned;
  if (world.project.isOpen && player.credits >= 8) return contributeAll(world, player);
  if (turn % 3 === 0 && valid(world, player, DTO.restore)) return DTO.restore;
  if (world.countOf('efficiency') < 3 && valid(world, player, DTO.conserve)) return DTO.conserve;
  return DTO.wait;
};

/** Group play: each player builds one different thing, then all mitigate and share the wetland cost. */
export const coordinated: Strategy = (world, player, index) => {
  const turn = world.turn;
  if (turn === 1) {
    const opening = [DTO.expandFarm, DTO.expandIndustry, DTO.restore][index % 3] as PlayerActionDTO;
    if (valid(world, player, opening)) return opening;
  }
  if (world.project.isOpen && player.credits >= 8) return DTO.contribute(Math.min(8, world.project.remaining));
  if ((turn + index) % 2 === 0 && valid(world, player, DTO.restore)) return DTO.restore;
  if (valid(world, player, DTO.conserve)) return DTO.conserve;
  return DTO.wait;
};

export const waiter: Strategy = () => DTO.wait;

/** Plays until the scenario ends (or `maxTurns`), one strategy per player in join order. */
export function playScenario(world: World, strategies: Strategy[], maxTurns = Number.POSITIVE_INFINITY): World {
  let current = world;
  let played = 0;
  while (current.isActive && played < maxTurns) {
    const byPlayer: Record<string, PlayerActionDTO> = {};
    current.players().forEach((player, index) => {
      const strategy = strategies[index] ?? waiter;
      const dto = strategy(current, player, index);
      byPlayer[player.id] = valid(current, player, dto) ? dto : DTO.wait;
    });
    current = resolve(current, byPlayer);
    played += 1;
  }
  return current;
}
