import type { PlayerId, StructureId, StructureKind, StructureSnapshot } from './types';

/** Something built in the valley. Immutable once built; the map shows exactly these. */
export class Structure {
  private constructor(private readonly data: Readonly<StructureSnapshot>) {}

  static fromSnapshot(snapshot: StructureSnapshot): Structure {
    return new Structure(Object.freeze({ ...snapshot }));
  }

  static build(params: StructureSnapshot): Structure {
    return Structure.fromSnapshot(params);
  }

  get id(): StructureId {
    return this.data.id;
  }

  get kind(): StructureKind {
    return this.data.kind;
  }

  get ownerId(): PlayerId | null {
    return this.data.ownerId;
  }

  get builtTurn(): number {
    return this.data.builtTurn;
  }

  get slot(): number {
    return this.data.slot;
  }

  /** Built before the scenario began (shared settlement infrastructure). */
  get isInitial(): boolean {
    return this.data.builtTurn === 0;
  }

  /** Restoration planted on turn t adds ecosystem health on turns t+1 … t+growthTurns. */
  isGrowingOn(turn: number, growthTurns: number): boolean {
    return this.data.kind === 'restoration' && turn > this.data.builtTurn && turn <= this.data.builtTurn + growthTurns;
  }

  /** Growth turns completed, as seen while `openTurn` is open for actions (0 … growthTurns). */
  growthStage(openTurn: number, growthTurns: number): number {
    return Math.min(growthTurns, Math.max(0, openTurn - 1 - this.data.builtTurn));
  }

  toSnapshot(): StructureSnapshot {
    return { ...this.data };
  }
}
