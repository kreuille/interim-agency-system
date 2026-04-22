import type { AgencyId } from '@interim/domain';
import type {
  InboundWebhookEventRecord,
  InboundWebhookRepository,
  InsertInboundResult,
  InsertInboundWebhookInput,
} from './inbound-webhook.js';
import type { InboundWebhookEnqueuer } from './record-inbound-webhook.use-case.js';

/**
 * Repository in-memory pour tests.
 * - `eventId` unique : INSERT idempotent simulé via Map<eventId, record>.
 */
export class InMemoryInboundWebhookRepository implements InboundWebhookRepository {
  private readonly byEventId = new Map<string, InboundWebhookEventRecord>();
  private readonly byId = new Map<string, InboundWebhookEventRecord>();

  insertIfNew(input: InsertInboundWebhookInput): Promise<InsertInboundResult> {
    if (this.byEventId.has(input.eventId)) {
      return Promise.resolve({ inserted: false, reason: 'duplicate' });
    }
    const record: InboundWebhookEventRecord = {
      id: input.id,
      agencyId: input.agencyId,
      eventId: input.eventId,
      eventType: input.eventType,
      signature: input.signature,
      receivedAt: input.receivedAt,
      processedAt: undefined,
      status: 'PENDING',
      payload: input.payload,
      headers: input.headers,
      errorMessage: undefined,
      retryCount: 0,
    };
    this.byEventId.set(input.eventId, record);
    this.byId.set(input.id, record);
    return Promise.resolve({ inserted: true, id: input.id });
  }

  findById(id: string): Promise<InboundWebhookEventRecord | undefined> {
    return Promise.resolve(this.byId.get(id));
  }

  markProcessing(id: string, _now: Date): Promise<void> {
    const r = this.byId.get(id);
    if (r) this.update(r, { status: 'PROCESSING' });
    return Promise.resolve();
  }

  markProcessed(id: string, now: Date): Promise<void> {
    const r = this.byId.get(id);
    if (r) this.update(r, { status: 'PROCESSED', processedAt: now });
    return Promise.resolve();
  }

  markFailed(input: { id: string; errorMessage: string }): Promise<void> {
    const r = this.byId.get(input.id);
    if (r) {
      this.update(r, {
        status: 'FAILED',
        errorMessage: input.errorMessage,
        retryCount: r.retryCount + 1,
      });
    }
    return Promise.resolve();
  }

  snapshot(): readonly InboundWebhookEventRecord[] {
    return [...this.byId.values()];
  }

  byAgency(agencyId: AgencyId): readonly InboundWebhookEventRecord[] {
    return [...this.byId.values()].filter((r) => r.agencyId === agencyId);
  }

  private update(
    record: InboundWebhookEventRecord,
    patch: Partial<InboundWebhookEventRecord>,
  ): void {
    const next = { ...record, ...patch };
    this.byId.set(record.id, next);
    this.byEventId.set(record.eventId, next);
  }
}

/**
 * Enqueuer in-memory : retient les jobs publiés.
 */
export class InMemoryInboundWebhookEnqueuer implements InboundWebhookEnqueuer {
  readonly enqueued: { id: string; eventType: string }[] = [];

  enqueueDispatch(input: { id: string; eventType: string }): Promise<void> {
    this.enqueued.push({ id: input.id, eventType: input.eventType });
    return Promise.resolve();
  }
}
