import { DomainError } from '../shared/DomainError';
import { clamp, round1 } from '../shared/numbers';
import type { IndicatorKey, Indicators } from './types';
import { INDICATOR_KEYS } from './types';

/** Immutable value object: the five world indicators, each within 0–100. */
export class IndicatorSet {
  private readonly values: Readonly<Indicators>;

  private constructor(values: Indicators) {
    this.values = Object.freeze(values);
  }

  static of(values: Indicators): IndicatorSet {
    const copy = {} as Indicators;
    for (const key of INDICATOR_KEYS) {
      const value = values[key];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
        throw new DomainError('INVALID_INDICATOR', `${key} must be a number within 0–100 (got ${String(value)}).`);
      }
      copy[key] = value;
    }
    return new IndicatorSet(copy);
  }

  /** Settles raw post-flow values: clamp to 0–100, then round to one decimal place. */
  static settle(raw: Indicators): IndicatorSet {
    const settled = {} as Indicators;
    for (const key of INDICATOR_KEYS) settled[key] = round1(clamp(raw[key]));
    return IndicatorSet.of(settled);
  }

  get(key: IndicatorKey): number {
    return this.values[key];
  }

  toJSON(): Indicators {
    return { ...this.values };
  }

  /** Rounded change relative to an earlier set. */
  deltaFrom(previous: IndicatorSet): Indicators {
    const delta = {} as Indicators;
    for (const key of INDICATOR_KEYS) delta[key] = round1(this.values[key] - previous.get(key));
    return delta;
  }

  equals(other: IndicatorSet): boolean {
    return INDICATOR_KEYS.every((key) => this.values[key] === other.get(key));
  }
}
