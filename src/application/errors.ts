/** A request was not acceptable at the application level (wrong turn, not joined, …). `code` is client-safe. */
export class ApplicationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ApplicationError';
    this.code = code;
  }
}

/** Optimistic-concurrency conflict: the stored state moved on. Transient; the command bus retries. */
export class ConcurrencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConcurrencyError';
  }
}
