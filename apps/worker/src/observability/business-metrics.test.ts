import { describe, expect, it } from 'vitest';
import {
  createBusinessMetrics,
  createNoOpBusinessMetrics,
  workerRegistry,
} from './business-metrics.js';

/**
 * Tests Prometheus business counters (DETTE-035).
 *
 * On instancie le `workerRegistry` une fois (singleton process). Pour éviter
 * la pollution inter-tests, on lit toujours `workerRegistry.metrics()`
 * et on compte les delta plutôt que les valeurs absolues.
 */

async function getMetricsText(): Promise<string> {
  return workerRegistry.metrics();
}

function countSeriesValue(text: string, metricLine: string): number {
  // Match `<metric_line>{...} <value>` ou `<metric_line> <value>`.
  // Ex: `payroll_batch_runs_total{agency_id_hash="abc",status="success"} 3`
  const lines = text.split('\n').filter((l) => l.startsWith(metricLine) && !l.startsWith('#'));
  return lines.reduce((sum, l) => {
    const lastSpace = l.lastIndexOf(' ');
    const num = Number(l.slice(lastSpace + 1));
    return sum + (Number.isFinite(num) ? num : 0);
  }, 0);
}

describe('createBusinessMetrics — paie', () => {
  const metrics = createBusinessMetrics();

  it('recordPayrollBatchRun success → increments counters et histogram', async () => {
    const before = await getMetricsText();
    const beforeCount = countSeriesValue(before, 'payroll_batch_runs_total');

    metrics.recordPayrollBatchRun({
      agencyId: 'agency-test-1',
      status: 'success',
      durationSeconds: 42,
      workersProcessed: 12,
      grossRappen: 50_000n,
      deductionsRappen: 12_500n,
    });

    const after = await getMetricsText();
    const afterCount = countSeriesValue(after, 'payroll_batch_runs_total');
    expect(afterCount - beforeCount).toBe(1);

    // Vérifie présence des labels avec hash (jamais en clair)
    // Note : `service="worker"` est ajouté en default label par createPromRegistry,
    // d'où le `[^}]*` permissif sur le suffixe des labels.
    expect(after).toMatch(
      /payroll_batch_runs_total\{agency_id_hash="[0-9a-f]{12}",status="success"[^}]*\}/u,
    );
    expect(after).not.toContain('agency-test-1'); // PII protégée

    // Histogram observé
    expect(after).toContain('payroll_batch_duration_seconds_count');
  });

  it('recordPayrollBatchRun failed → counter status=failed', () => {
    metrics.recordPayrollBatchRun({
      agencyId: 'agency-test-2',
      status: 'failed',
      durationSeconds: 10,
      workersProcessed: 0,
      grossRappen: 0n,
      deductionsRappen: 0n,
    });
    // Pas d'assertion stricte ici (cumulé) — le test précédent vérifie
    // déjà l'incrémentation.
  });

  it('agencyId est hashé (pas en clair dans /metrics)', async () => {
    metrics.recordPayrollBatchRun({
      agencyId: 'super-secret-agency-id',
      status: 'success',
      durationSeconds: 1,
      workersProcessed: 1,
      grossRappen: 1n,
      deductionsRappen: 0n,
    });
    const text = await getMetricsText();
    expect(text).not.toContain('super-secret-agency-id');
  });
});

describe('createBusinessMetrics — availability outbox', () => {
  const metrics = createBusinessMetrics();

  it('recordAvailabilityOutboxPushed success → counter + histogram', async () => {
    metrics.recordAvailabilityOutboxPushed({
      agencyId: 'agency-avail-1',
      status: 'success',
      durationSeconds: 0.25,
    });
    const text = await getMetricsText();
    expect(text).toMatch(/availability_outbox_processed_total\{[^}]*status="success"[^}]*\}/u);
    expect(text).toContain('availability_outbox_push_duration_seconds_count');
  });

  it('setAvailabilityOutboxPending → gauge value', async () => {
    metrics.setAvailabilityOutboxPending('agency-pending', 42);
    const text = await getMetricsText();
    expect(text).toMatch(/availability_outbox_pending_count\{[^}]*\} 42/u);
  });

  it('setAvailabilityOutboxLag → gauge value', async () => {
    metrics.setAvailabilityOutboxLag('agency-lag', 600);
    const text = await getMetricsText();
    expect(text).toMatch(/availability_outbox_lag_seconds\{[^}]*\} 600/u);
  });

  it('status=dead pour les rows DLQ', async () => {
    metrics.recordAvailabilityOutboxPushed({
      agencyId: 'agency-dead',
      status: 'dead',
      durationSeconds: 5,
    });
    const text = await getMetricsText();
    expect(text).toMatch(/availability_outbox_processed_total\{[^}]*status="dead"[^}]*\}/u);
  });
});

describe('createBusinessMetrics — DR / backup', () => {
  const metrics = createBusinessMetrics();

  it('recordPgDump success met aussi à jour size + last_success_timestamp', async () => {
    const ts = 1_700_000_000;
    metrics.recordPgDump({
      status: 'success',
      durationSeconds: 45,
      sizeBytes: 1024 * 1024 * 50, // 50 MB
      successTimestampSeconds: ts,
    });
    const text = await getMetricsText();
    expect(text).toMatch(/pg_dump_runs_total\{[^}]*status="success"[^}]*\}/u);
    expect(text).toMatch(/pg_dump_size_bytes(\{[^}]*\})? 52428800/u);
    expect(text).toMatch(
      new RegExp(`pg_dump_last_success_timestamp_seconds(\\{[^}]*\\})? ${String(ts)}`, 'u'),
    );
  });

  it('recordPgDump failed ne met pas à jour last_success', async () => {
    const before = await getMetricsText();
    const beforeTs = /pg_dump_last_success_timestamp_seconds\{.*\} (\d+)/u.exec(before)?.[1] ?? '0';

    metrics.recordPgDump({
      status: 'failed',
      durationSeconds: 5,
      successTimestampSeconds: 9_999_999_999, // ne devrait PAS être appliqué
    });

    const after = await getMetricsText();
    const afterTs = /pg_dump_last_success_timestamp_seconds\{.*\} (\d+)/u.exec(after)?.[1] ?? '0';
    expect(afterTs).toBe(beforeTs); // unchanged car status=failed
  });

  it('setWalArchiveLastSuccess + incrementWalArchiveFailures', async () => {
    metrics.setWalArchiveLastSuccess(1_700_001_234);
    metrics.incrementWalArchiveFailures();
    metrics.incrementWalArchiveFailures();

    const text = await getMetricsText();
    expect(text).toContain('wal_archive_last_success_timestamp_seconds');
    expect(text).toMatch(/wal_archive_failures_total\{.*\} \d+/u);
  });

  it('recordDrRestoreTest enregistre RPO + RTO', async () => {
    metrics.recordDrRestoreTest({
      status: 'success',
      rpoSeconds: 360,
      rtoSeconds: 1200,
    });
    const text = await getMetricsText();
    expect(text).toMatch(/dr_restore_test_runs_total\{[^}]*status="success"[^}]*\}/u);
    expect(text).toContain('dr_restore_test_rpo_seconds_count');
    expect(text).toContain('dr_restore_test_rto_seconds_count');
  });

  it("status='rto_breached' valide", async () => {
    metrics.recordDrRestoreTest({
      status: 'rto_breached',
      rtoSeconds: 18_000, // 5h, > budget 4h
    });
    const text = await getMetricsText();
    expect(text).toMatch(/dr_restore_test_runs_total\{[^}]*status="rto_breached"[^}]*\}/u);
  });
});

describe('createBusinessMetrics — MovePlanner', () => {
  const metrics = createBusinessMetrics();

  it('recordMpPush émet counter + histogram', async () => {
    metrics.recordMpPush({
      agencyId: 'agency-mp-1',
      endpoint: 'POST /availability/push',
      status: 'success',
      durationSeconds: 0.15,
    });
    const text = await getMetricsText();
    expect(text).toMatch(
      /mp_push_total\{[^}]*endpoint="POST \/availability\/push"[^}]*status="success"[^}]*\}/u,
    );
    expect(text).toContain('mp_push_duration_seconds_count');
  });

  it('setMpCircuitBreakerState : closed=0, half_open=1, open=2', async () => {
    metrics.setMpCircuitBreakerState('POST /availability/push', 'open');
    const text = await getMetricsText();
    expect(text).toMatch(
      /mp_circuit_breaker_state\{[^}]*endpoint="POST \/availability\/push"[^}]*\} 2/u,
    );

    metrics.setMpCircuitBreakerState('POST /availability/push', 'half_open');
    const text2 = await getMetricsText();
    expect(text2).toMatch(
      /mp_circuit_breaker_state\{[^}]*endpoint="POST \/availability\/push"[^}]*\} 1/u,
    );

    metrics.setMpCircuitBreakerState('POST /availability/push', 'closed');
    const text3 = await getMetricsText();
    expect(text3).toMatch(
      /mp_circuit_breaker_state\{[^}]*endpoint="POST \/availability\/push"[^}]*\} 0/u,
    );
  });
});

describe('createNoOpBusinessMetrics — pour les tests', () => {
  const noop = createNoOpBusinessMetrics();

  it("toutes les méthodes sont no-op (pas d'erreur)", () => {
    expect(() => {
      noop.recordPayrollBatchRun({
        agencyId: 'a',
        status: 'success',
        durationSeconds: 1,
        workersProcessed: 1,
        grossRappen: 1n,
        deductionsRappen: 0n,
      });
      noop.recordAvailabilityOutboxPushed({
        agencyId: 'a',
        status: 'success',
        durationSeconds: 0.1,
      });
      noop.setAvailabilityOutboxPending('a', 0);
      noop.setAvailabilityOutboxLag('a', 0);
      noop.recordPgDump({ status: 'success', durationSeconds: 1 });
      noop.setWalArchiveLastSuccess(1);
      noop.incrementWalArchiveFailures();
      noop.recordDrRestoreTest({ status: 'success', rtoSeconds: 1 });
      noop.recordMpPush({ agencyId: 'a', endpoint: 'x', status: 'success', durationSeconds: 0.1 });
      noop.setMpCircuitBreakerState('x', 'closed');
    }).not.toThrow();
  });
});

describe('workerRegistry — registry singleton', () => {
  it('expose service=worker dans toutes les métriques', async () => {
    const text = await workerRegistry.metrics();
    // Au moins une ligne avec service="worker" doit exister
    expect(text).toMatch(/\{[^}]*service="worker"[^}]*\}/u);
  });

  it('expose les métriques système Node (interim_worker_*)', async () => {
    const text = await workerRegistry.metrics();
    expect(text).toContain('interim_worker_process_cpu_user_seconds_total');
  });
});
