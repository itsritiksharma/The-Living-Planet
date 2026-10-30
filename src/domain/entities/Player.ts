import { DomainError } from '../shared/DomainError';
import type { PlayerId, PlayerSnapshot, PlayerTotals, SystemReport } from '../model/types';

/** A participant in the shared world. Owns a private credit balance; everything else is shared. */
export class Player {
  private constructor(private readonly data: PlayerSnapshot) {}

  static fromSnapshot(snapshot: PlayerSnapshot): Player {
    if (!Number.isInteger(snapshot.credits) || snapshot.credits < 0) {
      throw new DomainError('INVALID_PLAYER', `Player ${snapshot.id} has an invalid credit balance.`);
    }
    return new Player(structuredClone(snapshot));
  }

  get id(): PlayerId {
    return this.data.id;
  }

  get displayName(): string {
    return this.data.displayName;
  }

  get joinOrder(): number {
    return this.data.joinOrder;
  }

  get joinedTurn(): number {
    return this.data.joinedTurn;
  }

  get credits(): number {
    return this.data.credits;
  }

  get totals(): Readonly<PlayerTotals> {
    return { ...this.data.totals };
  }

  get report(): SystemReport | null {
    return this.data.report;
  }

  canAfford(cost: number): boolean {
    return this.data.credits >= cost;
  }

  /** Charges an applied action's cost. Called once per applied action, never for blocked ones. */
  payForAction(cost: number): void {
    this.debit(cost);
    this.data.totals.spentOnActions += cost;
  }

  /** Pays an accepted contribution to the shared project. */
  contribute(amount: number): void {
    this.debit(amount);
    this.data.totals.contributed += amount;
  }

  earn(amount: number): void {
    assertWhole(amount);
    this.data.credits += amount;
    this.data.totals.incomeEarned += amount;
  }

  /** Living costs during shortages; never pushes credits below zero. Returns what was actually paid. */
  payHardship(due: number): number {
    assertWhole(due);
    const paid = Math.min(due, this.data.credits);
    this.data.credits -= paid;
    this.data.totals.hardshipPaid += paid;
    return paid;
  }

  receiveReport(report: SystemReport): void {
    this.data.report = structuredClone(report);
  }

  toSnapshot(): PlayerSnapshot {
    return structuredClone(this.data);
  }

  private debit(amount: number): void {
    assertWhole(amount);
    if (amount > this.data.credits) {
      throw new DomainError(
        'INSUFFICIENT_CREDITS',
        `${this.data.displayName} cannot pay ${amount} credits (has ${this.data.credits}).`,
      );
    }
    this.data.credits -= amount;
  }
}

function assertWhole(amount: number): void {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new DomainError('INVALID_AMOUNT', `Credit amounts must be whole, non-negative numbers (got ${amount}).`);
  }
}
