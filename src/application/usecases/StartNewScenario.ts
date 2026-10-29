import type { WorldFactory } from '../../domain/factories/WorldFactory';
import type { PlayerId } from '../../domain/model/types';
import { ApplicationError } from '../errors';
import type { ChangeNotifier, IdGenerator } from '../ports/runtime';
import type { WorldRepository } from '../ports/WorldRepository';
import { loadCurrentWorld, requirePlayer } from './guards';

export interface StartNewScenarioOutput {
  status: 'started' | 'already_started';
  worldId: string;
}

/**
 * Starts a fresh scenario for the same group once the current one has ended. Idempotent by the
 * ended world's id: if that world was already replaced, the current world is returned unchanged.
 */
export class StartNewScenario {
  constructor(
    private readonly deps: {
      worlds: WorldRepository;
      worldFactory: WorldFactory;
      ids: IdGenerator;
      notifier: ChangeNotifier;
    },
  ) {}

  async execute(input: { playerId: PlayerId; endedWorldId: string }): Promise<StartNewScenarioOutput> {
    const { world } = await loadCurrentWorld(this.deps.worlds);
    if (world.id !== input.endedWorldId) return { status: 'already_started', worldId: world.id };
    requirePlayer(world, input.playerId);
    if (world.isActive) throw new ApplicationError('SCENARIO_ACTIVE', 'A new scenario can start once this one ends.');
    const fresh = this.deps.worldFactory.restart(world, this.deps.ids.worldId());
    await this.deps.worlds.insert(fresh, world.id);
    this.deps.notifier.worldChanged();
    return { status: 'started', worldId: fresh.id };
  }
}
