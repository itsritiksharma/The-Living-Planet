import type { WorldFactory } from '../../domain/factories/WorldFactory';
import type { IdGenerator } from '../ports/runtime';
import type { StoredWorld, WorldRepository } from '../ports/WorldRepository';

/** Ensures a world exists. Idempotent: when one is already running, it is returned unchanged. */
export class InitializeWorld {
  constructor(
    private readonly deps: { worlds: WorldRepository; worldFactory: WorldFactory; ids: IdGenerator },
  ) {}

  async execute(): Promise<StoredWorld> {
    const existing = await this.deps.worlds.current();
    if (existing) return existing;
    return this.deps.worlds.insert(this.deps.worldFactory.createNew(this.deps.ids.worldId()), null);
  }
}
