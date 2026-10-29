import type { PlayerId, ProjectSnapshot, ProjectStatus } from './types';

export interface ContributionOffer {
  playerId: PlayerId;
  amount: number;
}

export interface ContributionAllocation {
  playerId: PlayerId;
  offered: number;
  accepted: number;
}

/**
 * The shared response: everyone benefits once it is built, whether or not they paid
 * (the free-rider problem is intentional and visible).
 */
export class CommunityProject {
  private constructor(private readonly data: ProjectSnapshot) {}

  static open(params: { id: string; name: string; target: number }): CommunityProject {
    return new CommunityProject({
      id: params.id,
      name: params.name,
      target: params.target,
      funded: 0,
      status: 'open',
      contributions: {},
      fundedTurn: null,
      completesTurn: null,
    });
  }

  static fromSnapshot(snapshot: ProjectSnapshot): CommunityProject {
    return new CommunityProject(structuredClone(snapshot));
  }

  get id(): string {
    return this.data.id;
  }

  get name(): string {
    return this.data.name;
  }

  get target(): number {
    return this.data.target;
  }

  get funded(): number {
    return this.data.funded;
  }

  get status(): ProjectStatus {
    return this.data.status;
  }

  get fundedTurn(): number | null {
    return this.data.fundedTurn;
  }

  get completesTurn(): number | null {
    return this.data.completesTurn;
  }

  get remaining(): number {
    return Math.max(0, this.data.target - this.data.funded);
  }

  get isOpen(): boolean {
    return this.data.status === 'open';
  }

  contributionOf(playerId: PlayerId): number {
    return this.data.contributions[playerId] ?? 0;
  }

  contributions(): Readonly<Record<PlayerId, number>> {
    return { ...this.data.contributions };
  }

  /**
   * Accepts one turn's simultaneous offers, listed in priority order. When they exceed what is
   * still needed, every offer is scaled by the same factor with largest-remainder rounding (ties
   * go to the earlier offer). Arrival order never matters, and nobody pays for unneeded capacity.
   */
  acceptOffers(offers: readonly ContributionOffer[]): ContributionAllocation[] {
    if (!this.isOpen || offers.length === 0) {
      return offers.map((offer) => ({ playerId: offer.playerId, offered: offer.amount, accepted: 0 }));
    }
    const remaining = this.remaining;
    const total = offers.reduce((sum, offer) => sum + offer.amount, 0);
    let accepted: number[];
    if (total <= remaining) {
      accepted = offers.map((offer) => offer.amount);
    } else {
      // Exact integer arithmetic: quota_i = amount_i × remaining / total.
      const scaled = offers.map((offer) => offer.amount * remaining);
      accepted = scaled.map((value) => Math.floor(value / total));
      let leftover = remaining - accepted.reduce((sum, value) => sum + value, 0);
      const byRemainder = offers
        .map((_, index) => index)
        .sort((a, b) => ((scaled[b] as number) % total) - ((scaled[a] as number) % total) || a - b);
      for (const index of byRemainder) {
        if (leftover === 0) break;
        if ((scaled[index] as number) % total > 0) {
          accepted[index] = (accepted[index] as number) + 1;
          leftover -= 1;
        }
      }
    }

    offers.forEach((offer, index) => {
      const amount = accepted[index] as number;
      if (amount > 0) {
        this.data.contributions[offer.playerId] = this.contributionOf(offer.playerId) + amount;
        this.data.funded += amount;
      }
    });
    return offers.map((offer, index) => ({
      playerId: offer.playerId,
      offered: offer.amount,
      accepted: accepted[index] as number,
    }));
  }

  /** Idempotent: begins construction the first time the target is met; later calls change nothing. */
  startConstructionIfFunded(turn: number, constructionTurns: number): boolean {
    if (this.data.status !== 'open' || this.data.funded < this.data.target) return false;
    this.data.status = 'in_progress';
    this.data.fundedTurn = turn;
    this.data.completesTurn = turn + constructionTurns;
    return true;
  }

  /** Idempotent: completes once, during the scheduled turn; later calls change nothing. */
  completeIfDue(turn: number): boolean {
    if (this.data.status !== 'in_progress' || this.data.completesTurn === null || turn < this.data.completesTurn) {
      return false;
    }
    this.data.status = 'completed';
    return true;
  }

  /** Recurring benefits apply on turns after the one in which the project completed. */
  providesBenefitsOn(turn: number): boolean {
    return this.data.status === 'completed' && this.data.completesTurn !== null && turn > this.data.completesTurn;
  }

  toSnapshot(): ProjectSnapshot {
    return structuredClone(this.data);
  }
}
