import { randomUUID } from 'node:crypto';
import type { AgencyId } from '@interim/domain';
import type { Clock } from '@interim/shared';
import type { InboundWebhookRepository, InsertInboundResult } from './inbound-webhook.js';

/**
 * Persiste un webhook entrant (idempotent par eventId) et publie un job
 * BullMQ pour qu'un worker le dispatch ensuite.
 *
 * Appelé depuis le contrôleur HTTP `moveplanner-webhook.controller.ts`
 * (côté `apps/api`) APRÈS vérification HMAC réussie.
 *
 * Le contrôleur reste fin et synchrone : il insère + enqueue, puis
 * répond 200 immédiatement. Le traitement effectif est asynchrone, ce
 * qui évite de timeout côté MP en cas de handler lent.
 */
export interface InboundWebhookEnqueuer {
  enqueueDispatch(input: { readonly id: string; readonly eventType: string }): Promise<void>;
}

export interface RecordInboundWebhookInput {
  readonly agencyId: AgencyId;
  readonly eventId: string;
  readonly eventType: string;
  readonly signature: string;
  readonly payload: unknown;
  readonly headers: Record<string, string>;
}

export type RecordInboundWebhookResult =
  | { readonly status: 'recorded'; readonly id: string }
  | { readonly status: 'duplicate' };

export class RecordInboundWebhookUseCase {
  constructor(
    private readonly repo: InboundWebhookRepository,
    private readonly enqueuer: InboundWebhookEnqueuer,
    private readonly clock: Clock,
    private readonly idFactory: () => string = randomUUID,
  ) {}

  async execute(input: RecordInboundWebhookInput): Promise<RecordInboundWebhookResult> {
    const id = this.idFactory();
    const insertResult: InsertInboundResult = await this.repo.insertIfNew({
      id,
      agencyId: input.agencyId,
      eventId: input.eventId,
      eventType: input.eventType,
      signature: input.signature,
      payload: input.payload,
      headers: input.headers,
      receivedAt: this.clock.now(),
    });
    if (!insertResult.inserted) {
      // Doublon : MP a retry. Ne pas re-enqueue, ne pas re-process.
      return { status: 'duplicate' };
    }
    await this.enqueuer.enqueueDispatch({
      id: insertResult.id,
      eventType: input.eventType,
    });
    return { status: 'recorded', id: insertResult.id };
  }
}
