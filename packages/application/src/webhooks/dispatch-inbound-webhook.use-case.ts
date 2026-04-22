import type { Clock } from '@interim/shared';
import { nextInboundDelaySeconds, type InboundWebhookRepository } from './inbound-webhook.js';
import type { InboundWebhookDispatcher } from './webhook-event-dispatcher.js';

/**
 * Use case appelé par le worker BullMQ `mp-webhook-dispatch` pour
 * traiter un event. Idempotent (peut être rejoué).
 */
export interface DispatchInboundWebhookInput {
  readonly id: string;
}

export type DispatchInboundWebhookResult =
  | { readonly status: 'processed' }
  | { readonly status: 'not_found' }
  | { readonly status: 'already_processed' }
  | { readonly status: 'no_handler' }
  | { readonly status: 'failed'; readonly retryAfterSeconds: number | undefined };

export class DispatchInboundWebhookUseCase {
  constructor(
    private readonly repo: InboundWebhookRepository,
    private readonly dispatcher: InboundWebhookDispatcher,
    private readonly clock: Clock,
  ) {}

  async execute(input: DispatchInboundWebhookInput): Promise<DispatchInboundWebhookResult> {
    const event = await this.repo.findById(input.id);
    if (!event) return { status: 'not_found' };
    if (event.status === 'PROCESSED') return { status: 'already_processed' };

    const now = this.clock.now();
    await this.repo.markProcessing(event.id, now);
    try {
      const dispatched = await this.dispatcher.dispatch({
        eventId: event.eventId,
        eventType: event.eventType,
        timestamp: event.receivedAt.toISOString(),
        payload: event.payload,
      });
      // Pas de handler ⇒ on marque processed quand même (no-op accepté).
      await this.repo.markProcessed(event.id, this.clock.now());
      return dispatched.handled ? { status: 'processed' } : { status: 'no_handler' };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'unknown_error';
      await this.repo.markFailed({ id: event.id, errorMessage });
      const delay = nextInboundDelaySeconds(event.retryCount + 1);
      return { status: 'failed', retryAfterSeconds: delay };
    }
  }
}
