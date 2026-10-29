import type { EventDraft, EventSnapshot } from './types';

/** Append-only world history with deterministic, unique event ids (e1, e2, …). */
export class EventLog {
  private constructor(
    private readonly events: EventSnapshot[],
    private nextSeq: number,
  ) {}

  static fromSnapshot(events: readonly EventSnapshot[], nextSeq: number): EventLog {
    return new EventLog(structuredClone([...events]), nextSeq);
  }

  record(draft: EventDraft): EventSnapshot {
    const event: EventSnapshot = { id: `e${this.nextSeq}`, ...structuredClone(draft) };
    this.nextSeq += 1;
    this.events.push(event);
    return event;
  }

  all(): readonly EventSnapshot[] {
    return this.events;
  }

  get size(): number {
    return this.events.length;
  }

  get nextSequence(): number {
    return this.nextSeq;
  }

  toSnapshot(): EventSnapshot[] {
    return structuredClone(this.events);
  }
}
