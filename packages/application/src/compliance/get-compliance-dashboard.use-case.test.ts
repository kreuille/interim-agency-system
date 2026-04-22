import { describe, expect, it } from 'vitest';
import { FixedClock } from '@interim/shared';
import { GetComplianceDashboardUseCase } from './get-compliance-dashboard.use-case.js';
import {
  FailingLseStatusPort,
  StubActiveMissionsStatusPort,
  StubCctStatusPort,
  StubLseStatusPort,
  StubNlpdStatusPort,
  StubWorkerDocsStatusPort,
} from './test-helpers.js';

const NOW = new Date('2026-04-22T08:00:00Z');
const clock = new FixedClock(NOW);

function buildUseCase(opts: { failLse?: boolean } = {}): GetComplianceDashboardUseCase {
  const lse = opts.failLse
    ? new FailingLseStatusPort('db_timeout')
    : new StubLseStatusPort({
        authorization: 'cantonal',
        expiresAt: new Date('2027-04-22T00:00:00Z'),
      });
  const cct = new StubCctStatusPort({
    lastUpdatedAt: new Date('2026-01-01T00:00:00Z'),
    numberOfBranchesConfigured: 4,
  });
  const docs = new StubWorkerDocsStatusPort({
    totalWorkers: 100,
    workersWithAllDocsValid: 100,
    upcomingExpirations60Days: 0,
  });
  const missions = new StubActiveMissionsStatusPort({ count: 25, workersOverWeeklyLimit: 0 });
  const nlpd = new StubNlpdStatusPort({
    registryUpToDate: true,
    dpiaPresent: true,
    lastDataPersonRequestPending: 0,
  });
  return new GetComplianceDashboardUseCase(lse, cct, docs, missions, nlpd, clock);
}

describe('GetComplianceDashboardUseCase', () => {
  it('happy path : 5 indicateurs ok → worstStatus ok', async () => {
    const useCase = buildUseCase();
    const snap = await useCase.execute({ agencyId: 'agency-a' });
    expect(snap.indicators).toHaveLength(5);
    expect(snap.worstStatus).toBe('ok');
    expect(snap.agencyId).toBe('agency-a');
    expect(snap.indicators.map((i) => i.domain)).toEqual([
      'lse_authorization',
      'cct_rates',
      'worker_documents',
      'active_missions',
      'nlpd_registry',
    ]);
  });

  it('port LSE échoue → indicateur critical "données indisponibles", 4 autres OK → worstStatus critical', async () => {
    const useCase = buildUseCase({ failLse: true });
    const snap = await useCase.execute({ agencyId: 'agency-a' });
    const lseInd = snap.indicators.find((i) => i.domain === 'lse_authorization');
    expect(lseInd?.status).toBe('critical');
    expect(lseInd?.title).toBe('Données indisponibles');
    expect(lseInd?.details).toContain('db_timeout');
    expect(snap.worstStatus).toBe('critical');
  });

  it('parallélisme : 5 ports chargés en concurrent (Promise.all)', async () => {
    // Test indirect : ne fait que vérifier que les 5 indicateurs sont
    // présents et lastCheckedAt = clock.now() (cohérent inter-indicateurs).
    const useCase = buildUseCase();
    const snap = await useCase.execute({ agencyId: 'agency-a' });
    for (const ind of snap.indicators) {
      expect(ind.lastCheckedAt.toISOString()).toBe(NOW.toISOString());
    }
    expect(snap.generatedAt.toISOString()).toBe(NOW.toISOString());
  });
});
