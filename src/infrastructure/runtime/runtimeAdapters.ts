import { randomUUID } from 'node:crypto';
import type { IdGenerator, Logger } from '../../application/ports/runtime';

/** Unpredictable ids from the platform CSPRNG. Session tokens are full UUIDs (bearer secrets). */
export class CryptoIdGenerator implements IdGenerator {
  worldId(): string {
    return `world-${randomUUID().slice(0, 8)}`;
  }

  playerId(): string {
    return `p-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  }

  sessionToken(): string {
    return randomUUID();
  }
}

export class ConsoleLogger implements Logger {
  constructor(private readonly prefix = '[living-planet]') {}

  info(message: string): void {
    console.info(`${this.prefix} ${message}`);
  }

  warn(message: string): void {
    console.warn(`${this.prefix} ${message}`);
  }

  error(message: string, error?: unknown): void {
    console.error(`${this.prefix} ${message}`, error ?? '');
  }
}
