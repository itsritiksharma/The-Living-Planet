import { PlayerViewAssembler } from '../../src/application/views/PlayerViewAssembler';
import type { PlayerViewDTO } from '../../src/contracts/views';
import { TurnSubmissions } from '../../src/domain/entities/TurnSubmissions';
import type { World } from '../../src/domain/entities/World';
import type { ReflectionsApi } from '../../src/ui/hooks/useGameClient';
import { config } from '../helpers/fixtures';

const assembler = new PlayerViewAssembler(config);

/** The exact read model the server would send this viewer. */
export function viewFor(world: World, viewerId: string | null, submissions?: TurnSubmissions): PlayerViewDTO {
  const connected = new Set(world.players().map((p) => p.id));
  return assembler.assemble(world, submissions ?? TurnSubmissions.empty(world.id, world.turn), connected, viewerId);
}

export function fakeReflections(overrides: Partial<ReflectionsApi> = {}): ReflectionsApi & { recorded: unknown[] } {
  const recorded: unknown[] = [];
  return {
    hidden: false,
    setHidden: () => undefined,
    record: (entry) => void recorded.push(entry),
    entries: [],
    recorded,
    ...overrides,
  };
}
