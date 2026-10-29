import type { World } from '../../domain/model/World';

export interface StoredWorld {
  /** A fresh instance: mutating it never changes what is stored until it is saved. */
  world: World;
  revision: number;
}

/** Persistence port for the shared world (Phase 1: one current world; in-memory adapter). */
export interface WorldRepository {
  current(): Promise<StoredWorld | null>;
  /**
   * Makes a brand-new world current. Rejects with ConcurrencyError unless `replacing` is the id of
   * the world that is current now (null when there is none yet).
   */
  insert(world: World, replacing: string | null): Promise<StoredWorld>;
  /** Saves the current world; rejects with ConcurrencyError if it changed since `expectedRevision`. */
  update(world: World, expectedRevision: number): Promise<StoredWorld>;
}
