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
  /**
   * Hook optionnel pour publier les compteurs Prometheus (DETTE-035) :
   *   - `availability_outbox_processed_total{agency_id_hash, status}`
   *   - `availability_outbox_push_duration_seconds`
   * À wire au bootstrap dans `apps/worker/src/main.ts` avec
   * `createBusinessMetrics().recordAvailabilityOutboxPushed()`.
   *
   * Si non fourni → no-op (idéal pour les tests existants).
   */
  readonly onResult?: (result: {
    readonly processed: number;
    readonly succeeded: number;
    readonly retried: number;
    readonly dead: number;
    readonly durationSeconds: number;
  }) => void;
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
      const startedAt = Date.now();
      const result = await deps.drain.execute();
      // Re-enqueue automatiquement si on a saturé le batch (filet pour
      // les forts volumes : on continue à drainer jusqu'à vider).
      if (result.processed >= threshold) {
        await deps.queue.add(AVAILABILITY_SYNC_QUEUE_NAME, { tick: 'realtime' });
      }
      // Publication métriques (no-op si pas wiré).
      // `PushAvailabilityResult` : processed, succeeded, failed, dead.
      // failed = transient (ré-essayé plus tard) ; dead = max retries
      // dépassés (DLQ alerting).
      deps.onResult?.({
        processed: result.processed,
        succeeded: result.succeeded,
        retried: result.failed,
        dead: result.dead,
        durationSeconds: (Date.now() - startedAt) / 1000,
      });
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

/**
 * Cron BullMQ "nightly" : déclenche un drain complet de l'outbox tous
 * les jours à ~04:00 Europe/Zurich. Filet de sécurité contre les rows
 * qui auraient échappé au push realtime (worker offline pendant la nuit,
 * MP indisponible longtemps, etc.).
 *
 * `jobId` figé → un seul cron actif même après redéploys multiples.
 *
 * Note tz : on planifie en UTC à 02:00 (= 04:00 Europe/Zurich en heure
 * d'été, 03:00 en heure d'hiver). Pour une heure CH stable il faudra
 * un scheduler tz-aware (ex. `bullmq-cron-tz` ou cron extérieur).
 * Le drift d'1h en hiver est jugé acceptable pour ce filet de sécurité.
 */
export const NIGHTLY_DRAIN_JOB_ID = 'nightly-drain';
export const NIGHTLY_DRAIN_CRON = '0 2 * * *';

export async function scheduleNightlyDrain(queue: Queue<AvailabilitySyncJob>): Promise<void> {
  await queue.add(
    AVAILABILITY_SYNC_QUEUE_NAME,
    { tick: 'nightly' },
    {
      jobId: NIGHTLY_DRAIN_JOB_ID,
      repeat: { pattern: NIGHTLY_DRAIN_CRON },
    },
  );
}
