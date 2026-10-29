import type { IdempotencyRecord, IdempotencyStore } from '../../application/ports/IdempotencyStore';

/** Bounded (least-recently-stored first out) record of processed command ids. */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly records = new Map<string, IdempotencyRecord>();

  constructor(private readonly capacity = 2000) {}

  async get(key: string): Promise<IdempotencyRecord | undefined> {
    const record = this.records.get(key);
    return record ? structuredClone(record) : undefined;
  }

  async put(key: string, record: IdempotencyRecord): Promise<void> {
    this.records.delete(key);
    this.records.set(key, structuredClone(record));
    while (this.records.size > this.capacity) {
      const oldest = this.records.keys().next().value;
      if (oldest === undefined) break;
      this.records.delete(oldest);
    }
  }

  get size(): number {
    return this.records.size;
  }
}
