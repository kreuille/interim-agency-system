import { Queue, Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import type { PurgeExpiredArchivesUseCase } from '@interim/application';

export const GED_PURGE_QUEUE_NAME = 'ged-purge';
export const GED_PURGE_REPEAT_CRON = '0 3 1 * *'; // 1er du mois 03h00 Europe/Zurich

export interface GedPurgeJob {
  readonly limit?: number;
  readonly dryRun?: boolean;
}

export interface GedPurgeWorkerDeps {
  readonly connection: Redis;
  readonly useCase: PurgeExpiredArchivesUseCase;
  readonly concurrency?: number;
  /**
   * Hook optionnel pour publier les compteurs dans Prometheus :
   *   `ged_purged_total{category}` (counter)
   *   `ged_retention_violations_total{}` (counter)
   *   `ged_purge_errors_total{}` (counter)
   * Cf. DETTE-049 instrumentation finale.
   */
  readonly onResult?: (result: {
    readonly scanned: number;
    readonly purged: number;
    readonly retentionViolations: number;
    readonly errorsCount: number;
  }) => void;
}

/**
 * Worker BullMQ pour la purge mensuelle des archives GED dont la
 * rétention est dépassée. Closes DETTE-049.
 *
 * Planning :
 *   - Repeatable job avec `repeat: { pattern: GED_PURGE_REPEAT_CRON, tz: 'Europe/Zurich' }`
 *   - Limite default 500/run (sécurité — les runs suivants finiront le reste)
 *   - Mode dry-run via payload pour audit pré-purge
 *
 * Idempotent : la double-vérif `entry.isPurgeable(now)` côté domain
 * garantit qu'un retry n'efface jamais une entrée encore sous rétention.
 *
 * Métriques : voir `onResult` callback (incrémenter Prometheus counters).
 */
export function createGedPurgeWorker(deps: GedPurgeWorkerDeps): Worker<GedPurgeJob> {
  return new Worker<GedPurgeJob>(
    GED_PURGE_QUEUE_NAME,
    async (job: Job<GedPurgeJob>) => {
      const result = await deps.useCase.execute({
        limit: job.data.limit ?? 500,
        ...(job.data.dryRun !== undefined ? { dryRun: job.data.dryRun } : {}),
      });
      if (deps.onResult) {
        deps.onResult({
          scanned: result.scanned,
          purged: result.purged,
          retentionViolations: result.retentionViolations,
          errorsCount: result.errors.length,
        });
      }
      return result;
    },
    {
      connection: deps.connection,
      concurrency: deps.concurrency ?? 1, // 1 seul à la fois (purge = critique)
    },
  );
}

export function createGedPurgeQueue(connection: Redis): Queue<GedPurgeJob> {
  return new Queue<GedPurgeJob>(GED_PURGE_QUEUE_NAME, { connection });
}

/**
 * Planifie le job repeatable mensuel. À appeler une seule fois au boot.
 * BullMQ déduplique le pattern, donc rejouer ne crée pas de doublon.
 */
export async function scheduleGedPurge(
  queue: Queue<GedPurgeJob>,
  opts?: { readonly limit?: number; readonly tz?: string },
): Promise<void> {
  await queue.add(
    GED_PURGE_QUEUE_NAME,
    { limit: opts?.limit ?? 500 },
    {
      jobId: 'ged-purge-monthly',
      repeat: { pattern: GED_PURGE_REPEAT_CRON, tz: opts?.tz ?? 'Europe/Zurich' },
      removeOnComplete: 24, // garde 2 ans d'historique mensuel
      removeOnFail: 100,
      attempts: 1, // pas de retry — un job mensuel échoué sera re-lancé le mois prochain
    },
  );
}
