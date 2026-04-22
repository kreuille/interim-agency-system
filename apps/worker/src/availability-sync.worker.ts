import { Queue, Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import type { PushAvailabilityUseCase } from '@interim/application';

export const AVAILABILITY_SYNC_QUEUE_NAME = 'availability-sync';

/**
 * Job payload — pour ce worker, le payload est juste un trigger.
 * Le drain effectif se fait via le `PushAvailabilityUseCase` qui
 * interroge la table outbox.
 */
export interface AvailabilitySyncJob {
  readonly tick: 'realtime' | 'nightly';
}

export interface AvailabilitySyncWorkerDeps {
  readonly connection: Redis;
  readonly drain: PushAvailabilityUseCase;
  /** Référence à la queue pour réenqueuer si on sature un batch. */
  readonly queue: Queue<AvailabilitySyncJob>;
  readonly concurrency?: number;
  /** Si saturation détectée, taille au-dessus de laquelle on re-trigger. */
  readonly saturationThreshold?: number;
}

/**
 * Consumer BullMQ pour `availability-sync`.
 *
 * Pattern : chaque mutation `WorkerAvailability` enqueue une row
 * outbox (via `EnqueueAvailabilityPushUseCase`) puis publie un job
 * BullMQ `tick: realtime`. Le job lance simplement le drain (jusqu'à
 * `batchSize` rows). En complément, un cron émet `tick: nightly`
 * à 04:00 Europe/Zurich (DETTE-031, à wirer côté infra).
 *
 * Idempotent : `claimDue` ne sélectionne que les rows
 * `pending|failed`. Si plusieurs jobs concurrent claimaient la même
 * row, `FOR UPDATE SKIP LOCKED` en Postgres garantit l'exclusion (le
 * repo in-memory de tests respecte la même sémantique).
 *
 * Note BullMQ v5 : `QueueScheduler` est intégré au `Worker` — pas
 * besoin d'instancier un scheduler séparé.
 */
export function createAvailabilitySyncWorker(
  deps: AvailabilitySyncWorkerDeps,
): Worker<AvailabilitySyncJob> {
  const threshold = deps.saturationThreshold ?? 10;
  return new Worker<AvailabilitySyncJob>(
    AVAILABILITY_SYNC_QUEUE_NAME,
    async (_job: Job<AvailabilitySyncJob>) => {
      const result = await deps.drain.execute();
      // Re-enqueue automatiquement si on a saturé le batch (filet pour
      // les forts volumes : on continue à drainer jusqu'à vider).
      if (result.processed >= threshold) {
        await deps.queue.add(AVAILABILITY_SYNC_QUEUE_NAME, { tick: 'realtime' });
      }
      return result;
    },
    {
      connection: deps.connection,
      concurrency: deps.concurrency ?? 2,
    },
  );
}

export function createAvailabilitySyncQueue(connection: Redis): Queue<AvailabilitySyncJob> {
  return new Queue<AvailabilitySyncJob>(AVAILABILITY_SYNC_QUEUE_NAME, { connection });
}
