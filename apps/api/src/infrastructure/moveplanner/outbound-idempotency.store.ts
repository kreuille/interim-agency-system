import type { OutboundIdempotencyStore } from './mp-client.js';

/**
 * Implémentation in-memory pour tests et bootstrap. En prod : table
 * `outbound_idempotency_keys` (Prisma) avec TTL 24h+ ; voir migration
 * Prisma à wirer dans A2.5 (push queue) où on persistera.
 */
export class InMemoryOutboundIdempotencyStore implements OutboundIdempotencyStore {
  private readonly store = new Map<string, { status: number; body: unknown }>();

  get(key: string): Promise<{ status: number; body: unknown } | undefined> {
    return Promise.resolve(this.store.get(key));
  }

  set(key: string, value: { status: number; body: unknown }): Promise<void> {
    this.store.set(key, value);
    return Promise.resolve();
  }

  size(): number {
    return this.store.size;
  }
}
