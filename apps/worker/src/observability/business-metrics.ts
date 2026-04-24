import { Counter, Gauge, Histogram, type Registry } from 'prom-client';
// Sub-path explicite pour éviter de tirer prom-client dans le bundle des
// client components Next.js qui importeraient depuis `@interim/shared`.
import {
  assertLabelHygiene,
  createPromRegistry,
  hashAgencyId,
} from '@interim/shared/observability/prom-registry';

/**
 * Business counters Prometheus pour les workers (DETTE-035).
 *
 * Architecture :
 * - 1 seul `Registry` pour tout le process worker (créé via
 *   `createPromRegistry({ service: 'worker' })`).
 * - Tous les metrics inscrits ici sont auto-labellisés `service=worker`
 *   par le default label du registre.
 * - **PII hygiene** : aucun label n'expose un identifiant en clair.
 *   `agency_id_hash` est un SHA-256 tronqué à 12 hex chars (cf.
 *   `hashAgencyId()`). Pas de worker_id, staff_id, iban, avs, email...
 * - **Cardinalité** : labels low-cardinality uniquement
 *   (status, queue, endpoint templatisé). Le hash agency permet
 *   ~16M tenants sans saturer Prometheus.
 *
 * Helper pattern : chaque worker reçoit `BusinessMetrics` injecté et
 * appelle les méthodes `record*()` quand un job se termine. Les métriques
 * elles-mêmes restent encapsulées (pas exposées brutes).
 */

export const workerRegistry: Registry = createPromRegistry({ service: 'worker' });

// ============================================================================
// Paie hebdomadaire (5 métriques)
// ============================================================================

const PAYROLL_LABELS = ['agency_id_hash', 'status'] as const;
assertLabelHygiene('payroll_batch_runs_total', [...PAYROLL_LABELS]);

const payrollBatchRunsTotal = new Counter({
  name: 'payroll_batch_runs_total',
  help: 'Nombre total de batches de paie hebdomadaire exécutés (success ou failed)',
  labelNames: PAYROLL_LABELS,
  registers: [workerRegistry],
});

const payrollBatchDurationSeconds = new Histogram({
  name: 'payroll_batch_duration_seconds',
  help: "Durée d'un batch de paie hebdomadaire (seconds)",
  labelNames: ['agency_id_hash'] as const,
  // Buckets : un batch < 30s pour < 50 workers, < 5min pour < 500
  buckets: [1, 5, 10, 30, 60, 120, 300, 600, 1800],
  registers: [workerRegistry],
});

const payrollBatchWorkersProcessedTotal = new Counter({
  name: 'payroll_batch_workers_processed_total',
  help: 'Nombre cumulé de workers traités par les batches de paie',
  labelNames: ['agency_id_hash'] as const,
  registers: [workerRegistry],
});

const payrollBatchGrossRappenTotal = new Counter({
  name: 'payroll_batch_gross_rappen_total',
  help: 'Cumul des bruts (Rappen) calculés par les batches de paie',
  labelNames: ['agency_id_hash'] as const,
  registers: [workerRegistry],
});

const payrollBatchDeductionsRappenTotal = new Counter({
  name: 'payroll_batch_deductions_rappen_total',
  help: 'Cumul des retenues sociales (Rappen) calculées par les batches de paie',
  labelNames: ['agency_id_hash'] as const,
  registers: [workerRegistry],
});

// ============================================================================
// Availability outbox (4 métriques)
// ============================================================================

const availabilityOutboxPendingCount = new Gauge({
  name: 'availability_outbox_pending_count',
  help: 'Nombre de rows availability_outbox en état pending (scrape DB périodique)',
  labelNames: ['agency_id_hash'] as const,
  registers: [workerRegistry],
});

const availabilityOutboxProcessedTotal = new Counter({
  name: 'availability_outbox_processed_total',
  help: 'Rows availability_outbox traitées (success | retry | dead)',
  labelNames: ['agency_id_hash', 'status'] as const,
  registers: [workerRegistry],
});

const availabilityOutboxPushDurationSeconds = new Histogram({
  name: 'availability_outbox_push_duration_seconds',
  help: "Durée d'un push availability vers MovePlanner (seconds)",
  labelNames: ['agency_id_hash', 'status'] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [workerRegistry],
});

const availabilityOutboxLagSeconds = new Gauge({
  name: 'availability_outbox_lag_seconds',
  help: 'Âge en secondes du plus vieux row pending dans availability_outbox',
  labelNames: ['agency_id_hash'] as const,
  registers: [workerRegistry],
});

// ============================================================================
// Backup / DR (8 métriques)
// ============================================================================

const pgDumpRunsTotal = new Counter({
  name: 'pg_dump_runs_total',
  help: 'Nombre de pg_dump exécutés (success | failed)',
  labelNames: ['status'] as const, // pas d'agency_id (référentiel global, 1 dump tous tenants)
  registers: [workerRegistry],
});

const pgDumpDurationSeconds = new Histogram({
  name: 'pg_dump_duration_seconds',
  help: "Durée d'un pg_dump (seconds)",
  labelNames: ['status'] as const,
  buckets: [10, 30, 60, 300, 600, 1800, 3600],
  registers: [workerRegistry],
});

const pgDumpSizeBytes = new Gauge({
  name: 'pg_dump_size_bytes',
  help: 'Taille du dernier pg_dump (compressé + chiffré age) en bytes',
  registers: [workerRegistry],
});

const pgDumpLastSuccessTimestampSeconds = new Gauge({
  name: 'pg_dump_last_success_timestamp_seconds',
  help: 'Timestamp Unix (seconds) du dernier pg_dump réussi',
  registers: [workerRegistry],
});

const walArchiveLastSuccessTimestampSeconds = new Gauge({
  name: 'wal_archive_last_success_timestamp_seconds',
  help: 'Timestamp Unix (seconds) du dernier WAL archive réussi',
  registers: [workerRegistry],
});

const walArchiveFailuresTotal = new Counter({
  name: 'wal_archive_failures_total',
  help: "Nombre cumulé d'échecs wal-archive.sh",
  registers: [workerRegistry],
});

const drRestoreTestRunsTotal = new Counter({
  name: 'dr_restore_test_runs_total',
  help: 'Nombre cumulé de tests DR exécutés (success | failed | rto_breached)',
  labelNames: ['status'] as const,
  registers: [workerRegistry],
});

const drRestoreTestRpoSeconds = new Histogram({
  name: 'dr_restore_test_rpo_seconds',
  help: 'RPO empirique mesuré par le test DR (delta entre backup et incident simulé)',
  buckets: [60, 300, 600, 900, 1800, 3600], // 1 min → 1h
  registers: [workerRegistry],
});

const drRestoreTestRtoSeconds = new Histogram({
  name: 'dr_restore_test_rto_seconds',
  help: 'RTO empirique mesuré par le test DR (durée totale dump → restore)',
  buckets: [60, 300, 900, 1800, 3600, 7200, 14400, 28800], // 1 min → 8h
  registers: [workerRegistry],
});

// ============================================================================
// MovePlanner (3 métriques) — duplicata côté worker pour les push depuis
// availability-sync. Le côté API a déjà mp_request_total (PR #48), ces
// counters sont distincts par leur registre (worker vs api).
// ============================================================================

const mpPushTotal = new Counter({
  name: 'mp_push_total',
  help: 'Nombre cumulé de push MovePlanner depuis le worker',
  labelNames: ['agency_id_hash', 'endpoint', 'status'] as const,
  registers: [workerRegistry],
});

const mpPushDurationSeconds = new Histogram({
  name: 'mp_push_duration_seconds',
  help: 'Durée des push MovePlanner depuis le worker',
  labelNames: ['endpoint', 'status'] as const, // pas agency_id_hash ici (cardinalité)
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [workerRegistry],
});

const mpCircuitBreakerState = new Gauge({
  name: 'mp_circuit_breaker_state',
  help: 'État du circuit breaker MovePlanner (0=closed, 1=half_open, 2=open)',
  labelNames: ['endpoint'] as const,
  registers: [workerRegistry],
});

// ============================================================================
// API publique : objet helper pour incrémenter les counters depuis les workers
// ============================================================================

/**
 * Statuts conventionnels pour les counters `*_runs_total`.
 * `rto_breached` est spécifique au DR test (script OK mais durée > budget).
 */
export type RunStatus = 'success' | 'failed' | 'rto_breached';

/**
 * Statuts conventionnels pour les counters availability outbox.
 */
export type OutboxStatus = 'success' | 'retry' | 'dead';

/**
 * Helper qui encapsule l'accès aux counters. Préférable d'injecter cette
 * interface dans les workers plutôt que d'importer directement les
 * Counters (testabilité, swap par no-op en test).
 */
export interface BusinessMetrics {
  // --- Paie ---
  recordPayrollBatchRun(input: {
    readonly agencyId: string;
    readonly status: 'success' | 'failed';
    readonly durationSeconds: number;
    readonly workersProcessed: number;
    readonly grossRappen: bigint;
    readonly deductionsRappen: bigint;
  }): void;

  // --- Availability outbox ---
  recordAvailabilityOutboxPushed(input: {
    readonly agencyId: string;
    readonly status: OutboxStatus;
    readonly durationSeconds: number;
  }): void;
  setAvailabilityOutboxPending(agencyId: string, count: number): void;
  setAvailabilityOutboxLag(agencyId: string, lagSeconds: number): void;

  // --- Backup / DR ---
  recordPgDump(input: {
    readonly status: 'success' | 'failed';
    readonly durationSeconds: number;
    readonly sizeBytes?: number;
    readonly successTimestampSeconds?: number;
  }): void;
  setWalArchiveLastSuccess(timestampSeconds: number): void;
  incrementWalArchiveFailures(): void;
  recordDrRestoreTest(input: {
    readonly status: RunStatus;
    readonly rpoSeconds?: number;
    readonly rtoSeconds: number;
  }): void;

  // --- MovePlanner ---
  recordMpPush(input: {
    readonly agencyId: string;
    readonly endpoint: string;
    readonly status: 'success' | 'failed';
    readonly durationSeconds: number;
  }): void;
  setMpCircuitBreakerState(endpoint: string, state: 'closed' | 'half_open' | 'open'): void;
}

/**
 * Implémentation par défaut — connectée au registre Prometheus global.
 */
export function createBusinessMetrics(): BusinessMetrics {
  return {
    recordPayrollBatchRun(input) {
      const ah = hashAgencyId(input.agencyId);
      payrollBatchRunsTotal.inc({ agency_id_hash: ah, status: input.status });
      payrollBatchDurationSeconds.observe({ agency_id_hash: ah }, input.durationSeconds);
      payrollBatchWorkersProcessedTotal.inc({ agency_id_hash: ah }, input.workersProcessed);
      // Conversion bigint → number — pour Prometheus la valeur reste exacte
      // jusqu'à 2^53 (≈ 9 quadrillions de Rappen, soit ≈ 90 trillions CHF).
      // Largement au-dessus de toute paie réelle.
      payrollBatchGrossRappenTotal.inc({ agency_id_hash: ah }, Number(input.grossRappen));
      payrollBatchDeductionsRappenTotal.inc({ agency_id_hash: ah }, Number(input.deductionsRappen));
    },

    recordAvailabilityOutboxPushed(input) {
      const ah = hashAgencyId(input.agencyId);
      availabilityOutboxProcessedTotal.inc({ agency_id_hash: ah, status: input.status });
      availabilityOutboxPushDurationSeconds.observe(
        { agency_id_hash: ah, status: input.status },
        input.durationSeconds,
      );
    },
    setAvailabilityOutboxPending(agencyId, count) {
      availabilityOutboxPendingCount.set({ agency_id_hash: hashAgencyId(agencyId) }, count);
    },
    setAvailabilityOutboxLag(agencyId, lagSeconds) {
      availabilityOutboxLagSeconds.set({ agency_id_hash: hashAgencyId(agencyId) }, lagSeconds);
    },

    recordPgDump(input) {
      pgDumpRunsTotal.inc({ status: input.status });
      pgDumpDurationSeconds.observe({ status: input.status }, input.durationSeconds);
      if (input.sizeBytes !== undefined) pgDumpSizeBytes.set(input.sizeBytes);
      if (input.successTimestampSeconds !== undefined && input.status === 'success') {
        pgDumpLastSuccessTimestampSeconds.set(input.successTimestampSeconds);
      }
    },
    setWalArchiveLastSuccess(timestampSeconds) {
      walArchiveLastSuccessTimestampSeconds.set(timestampSeconds);
    },
    incrementWalArchiveFailures() {
      walArchiveFailuresTotal.inc();
    },
    recordDrRestoreTest(input) {
      drRestoreTestRunsTotal.inc({ status: input.status });
      drRestoreTestRtoSeconds.observe(input.rtoSeconds);
      if (input.rpoSeconds !== undefined) drRestoreTestRpoSeconds.observe(input.rpoSeconds);
    },

    recordMpPush(input) {
      const ah = hashAgencyId(input.agencyId);
      mpPushTotal.inc({ agency_id_hash: ah, endpoint: input.endpoint, status: input.status });
      mpPushDurationSeconds.observe(
        { endpoint: input.endpoint, status: input.status },
        input.durationSeconds,
      );
    },
    setMpCircuitBreakerState(endpoint, state) {
      const value = state === 'closed' ? 0 : state === 'half_open' ? 1 : 2;
      mpCircuitBreakerState.set({ endpoint }, value);
    },
  };
}

/**
 * No-op pour les tests qui n'ont pas besoin de vérifier les métriques.
 */
export function createNoOpBusinessMetrics(): BusinessMetrics {
  return {
    recordPayrollBatchRun: () => undefined,
    recordAvailabilityOutboxPushed: () => undefined,
    setAvailabilityOutboxPending: () => undefined,
    setAvailabilityOutboxLag: () => undefined,
    recordPgDump: () => undefined,
    setWalArchiveLastSuccess: () => undefined,
    incrementWalArchiveFailures: () => undefined,
    recordDrRestoreTest: () => undefined,
    recordMpPush: () => undefined,
    setMpCircuitBreakerState: () => undefined,
  };
}
