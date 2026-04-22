import { Queue, Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import type { DispatchInboundWebhookUseCase, InboundWebhookEnqueuer } from '@interim/application';

export const WEBHOOK_DISPATCH_QUEUE_NAME = 'mp-webhook-dispatch';

export interface WebhookDispatchJob {
  /** ID interne de la row `inbound_webhook_events`. */
  readonly id: string;
  readonly eventType: string;
}

export interface WebhookDispatchWorkerDeps {
  readonly connection: Redis;
  readonly dispatch: DispatchInboundWebhookUseCase;
  readonly concurrency?: number;
}

/**
 * Consumer BullMQ pour `mp-webhook-dispatch`.
 *
 * Pattern :
 *  1. `RecordInboundWebhookHandler` (HTTP) insère la row + enqueue ici.
 *  2. Le worker dépile, appelle `DispatchInboundWebhookUseCase.execute`.
 *  3. Si `failed` avec `retryAfterSeconds` défini → BullMQ throw pour
 *     que le job soit retenté (BullMQ gère le delay backoff via
 *     `BackoffOptions`). Si `retryAfterSeconds` undefined → DEAD,
 *     log + alert (DETTE-029).
 */
export function createWebhookDispatchWorker(
  deps: WebhookDispatchWorkerDeps,
): Worker<WebhookDispatchJob> {
  return new Worker<WebhookDispatchJob>(
    WEBHOOK_DISPATCH_QUEUE_NAME,
    async (job: Job<WebhookDispatchJob>) => {
      const result = await deps.dispatch.execute({ id: job.data.id });
      if (result.status === 'failed') {
        if (result.retryAfterSeconds === undefined) {
          // Dead : on logge mais on n'attend plus de retry BullMQ.
          throw new Error(`webhook ${job.data.id} dead-lettered`);
        }
        // Throw pour que BullMQ retry après le délai.
        throw new Error(
          `webhook ${job.data.id} failed (retry in ${String(result.retryAfterSeconds)}s)`,
        );
      }
      return result;
    },
    {
      connection: deps.connection,
      concurrency: deps.concurrency ?? 4,
    },
  );
}

export function createWebhookDispatchQueue(connection: Redis): Queue<WebhookDispatchJob> {
  return new Queue<WebhookDispatchJob>(WEBHOOK_DISPATCH_QUEUE_NAME, { connection });
}

/**
 * Adaptateur `InboundWebhookEnqueuer` qui publie sur la queue BullMQ.
 * Utilisé côté API par `RecordInboundWebhookUseCase` après l'INSERT.
 */
export class BullmqInboundWebhookEnqueuer implements InboundWebhookEnqueuer {
  constructor(private readonly queue: Queue<WebhookDispatchJob>) {}

  async enqueueDispatch(input: { id: string; eventType: string }): Promise<void> {
    await this.queue.add(WEBHOOK_DISPATCH_QUEUE_NAME, input, {
      // BullMQ attempts pour la résilience side BullMQ. Notre use case
      // tient le compteur authoritative dans `retryCount` (Postgres).
      attempts: 6,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
  }
}
