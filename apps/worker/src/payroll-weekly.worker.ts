import { Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import { WeekIso } from '@interim/shared';
import {
  asAgencyId,
  PayrollEngine,
  type AgencyId,
  type PayrollBreakdown,
  type ComputeWeekInput,
} from '@interim/domain';

export const PAYROLL_WEEKLY_QUEUE_NAME = 'payroll-weekly';

/**
 * Cron : tous les vendredis à 18:00 Europe/Zurich.
 * Convention : la semaine ISO traitée est celle qui se termine le
 * dimanche **précédent** la date d'exécution (= semaine N-1).
 */
export const PAYROLL_WEEKLY_REPEAT_CRON = '0 18 * * 5';

/**
 * Payload du job : agency + semaine ISO + clé idempotency.
 * Le wiring (use case `RunPayrollWeekUseCase`) charge les inputs
 * (timesheets signés, clients, taux) via les repositories Prisma.
 *
 * `idempotencyKey` permet d'éviter le double-paiement si le worker
 * relance un job déjà traité (BullMQ retry sur erreur transitoire).
 */
export interface PayrollWeeklyJob {
  readonly agencyId: string; // sérialisé en string pour BullMQ
  readonly isoWeek: string; // ex: "2026-W17"
  readonly idempotencyKey: string;
}

/**
 * Use case attendu : récupère les timesheets, clients, taux pour
 * (agencyId, isoWeek), invoque `PayrollEngine.computeWeek` pour chaque
 * worker, persiste les `PayrollBreakdown` résultants. Retourne
 * l'agrégat pour métriques.
 *
 * Volontairement abstrait — l'implémentation concrète se trouve dans
 * `packages/application` (`run-payroll-week.use-case.ts`, à créer en
 * sprint A.7 pour wiring complet).
 */
export interface RunPayrollWeekUseCase {
  execute(input: { readonly agencyId: AgencyId; readonly isoWeek: WeekIso }): Promise<{
    readonly breakdowns: readonly PayrollBreakdown[];
    readonly workersProcessed: number;
    readonly grossRappenTotal: bigint;
    readonly deductionsRappenTotal: bigint;
  }>;
}

export interface PayrollWeeklyWorkerDeps {
  readonly connection: Redis;
  readonly useCase: RunPayrollWeekUseCase;
  readonly concurrency?: number;
  /**
   * Hook métriques (DETTE-035) — appelé sur succès ET échec :
   *   - `payroll_batch_runs_total{status, agency_id_hash}`
   *   - `payroll_batch_duration_seconds`
   *   - `payroll_batch_workers_processed_total`
   *   - `payroll_batch_gross_rappen_total`
   *   - `payroll_batch_deductions_rappen_total`
   *
   * À wire au bootstrap dans `apps/worker/src/main.ts` :
   * ```
   * createPayrollWeeklyWorker({
   *   connection, useCase,
   *   onResult: (r) => metrics.recordPayrollBatchRun({
   *     agencyId: r.agencyId,
   *     status: r.status,
   *     durationSeconds: r.durationSeconds,
   *     workersProcessed: r.workersProcessed,
   *     grossRappen: r.grossRappen,
   *     deductionsRappen: r.deductionsRappen,
   *   }),
   * })
   * ```
   */
  readonly onResult?: (result: {
    readonly agencyId: string;
    readonly isoWeek: string;
    readonly status: 'success' | 'failed';
    readonly durationSeconds: number;
    readonly workersProcessed: number;
    readonly grossRappen: bigint;
    readonly deductionsRappen: bigint;
    readonly errorMessage?: string;
  }) => void;
}

/**
 * Worker BullMQ pour la paie hebdomadaire.
 *
 * - Charge l'agrégat via `RunPayrollWeekUseCase`.
 * - Sur succès : émet `onResult({status:'success', ...})` pour métriques
 *   + retourne le breakdown (BullMQ stocke en job result).
 * - Sur échec : émet `onResult({status:'failed', errorMessage, ...})`
 *   AVANT de re-throw (BullMQ retry avec backoff exponentiel).
 *
 * Idempotent : `RunPayrollWeekUseCase` doit checker `idempotencyKey`
 * en amont (ne pas re-générer un Payslip déjà émis).
 */
export function createPayrollWeeklyWorker(deps: PayrollWeeklyWorkerDeps): Worker<PayrollWeeklyJob> {
  return new Worker<PayrollWeeklyJob>(
    PAYROLL_WEEKLY_QUEUE_NAME,
    async (job: Job<PayrollWeeklyJob>) => {
      const startedAt = Date.now();
      const agencyId = asAgencyId(job.data.agencyId);
      const isoWeekMatch = /^(\d{4})-W(\d{2})$/u.exec(job.data.isoWeek);
      if (!isoWeekMatch?.[1] || !isoWeekMatch[2]) {
        throw new Error(`Invalid isoWeek format: ${job.data.isoWeek} (expected YYYY-Www)`);
      }
      const isoWeek = WeekIso.of(Number(isoWeekMatch[1]), Number(isoWeekMatch[2]));

      try {
        const result = await deps.useCase.execute({ agencyId, isoWeek });
        const durationSeconds = (Date.now() - startedAt) / 1000;
        deps.onResult?.({
          agencyId: job.data.agencyId,
          isoWeek: job.data.isoWeek,
          status: 'success',
          durationSeconds,
          workersProcessed: result.workersProcessed,
          grossRappen: result.grossRappenTotal,
          deductionsRappen: result.deductionsRappenTotal,
        });
        return {
          breakdownsCount: result.breakdowns.length,
          workersProcessed: result.workersProcessed,
        };
      } catch (err) {
        const durationSeconds = (Date.now() - startedAt) / 1000;
        deps.onResult?.({
          agencyId: job.data.agencyId,
          isoWeek: job.data.isoWeek,
          status: 'failed',
          durationSeconds,
          workersProcessed: 0,
          grossRappen: 0n,
          deductionsRappen: 0n,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },
    {
      connection: deps.connection,
      concurrency: deps.concurrency ?? 1, // 1 par défaut : la paie est sérialisée par tenant
    },
  );
}

// Réexport pour faciliter les tests : permet de wire un PayrollEngine
// custom dans le useCase d'integ.
export { PayrollEngine };
export type { ComputeWeekInput, PayrollBreakdown };
