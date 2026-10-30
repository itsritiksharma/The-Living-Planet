import { ConcurrencyError } from '../../application/errors';
import type { StoredWorld, WorldRepository } from '../../application/ports/WorldRepository';
import type { SimulationConfig } from '../../domain/config/riverValley';
import type { WorldSnapshot } from '../../domain/model/types';
import { World } from '../../domain/entities/World';

/**
 * Phase 1 persistence: the current world lives in process memory and is lost on restart
 * (documented limitation). Stores immutable snapshots and hands out fresh instances, with
 * optimistic concurrency so a stale writer can never overwrite newer state.
 */
export class InMemoryWorldRepository implements WorldRepository {
  private stored: { snapshot: WorldSnapshot; revision: number } | null = null;

  constructor(private readonly config: SimulationConfig) {}

  async current(): Promise<StoredWorld | null> {
    return this.stored ? this.hydrate() : null;
  }

  async insert(world: World, replacing: string | null): Promise<StoredWorld> {
    const currentId = this.stored?.snapshot.id ?? null;
    if (currentId !== replacing) {
      throw new ConcurrencyError(`Expected the current world to be ${replacing ?? 'none'}, but it is ${currentId ?? 'none'}.`);
    }
    this.stored = { snapshot: world.toSnapshot(), revision: 1 };
    return this.hydrate();
  }

  async update(world: World, expectedRevision: number): Promise<StoredWorld> {
    if (!this.stored || this.stored.snapshot.id !== world.id) {
      throw new ConcurrencyError(`World ${world.id} is no longer the current world.`);
    }
    if (this.stored.revision !== expectedRevision) {
      throw new ConcurrencyError(`World ${world.id} changed (revision ${this.stored.revision}, expected ${expectedRevision}).`);
    }
    this.stored = { snapshot: world.toSnapshot(), revision: expectedRevision + 1 };
    return this.hydrate();
  }

  private hydrate(): StoredWorld {
    const stored = this.stored as { snapshot: WorldSnapshot; revision: number };
    return { world: World.fromSnapshot(stored.snapshot, this.config), revision: stored.revision };
  }
}
