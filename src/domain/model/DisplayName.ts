import { DomainError } from '../shared/DomainError';

/** A validated, normalized player name. The game needs nothing more personal than this. */
export class DisplayName {
  static readonly MAX_LENGTH = 20;

  private constructor(readonly value: string) {}

  static parse(raw: unknown): DisplayName {
    if (typeof raw !== 'string') throw new DomainError('INVALID_NAME', 'Enter a display name.');
    const cleaned = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
    if (cleaned.length === 0) throw new DomainError('INVALID_NAME', 'Enter a display name.');
    if ([...cleaned].length > DisplayName.MAX_LENGTH) {
      throw new DomainError('INVALID_NAME', `Use at most ${DisplayName.MAX_LENGTH} characters.`);
    }
    if (/[\u0000-\u001f\u007f-\u009f]/u.test(cleaned)) {
      throw new DomainError('INVALID_NAME', 'Names cannot contain control characters.');
    }
    return new DisplayName(cleaned);
  }

  /** Case-insensitive comparison used to keep names distinguishable within one settlement. */
  matches(other: string): boolean {
    return this.value.toLowerCase() === other.toLowerCase();
  }

  toString(): string {
    return this.value;
  }
}
