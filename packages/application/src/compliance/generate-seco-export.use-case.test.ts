import { describe, expect, it } from 'vitest';
import { FixedClock } from '@interim/shared';
import { GenerateSecoExportUseCase } from './generate-seco-export.use-case.js';
import {
  InMemorySecoExportAuditLogger,
  StubSecoContractsDataPort,
  StubSecoLseInfoPort,
  StubSecoMissionsDataPort,
  StubSecoTimesheetsDataPort,
  StubSecoWorkersDataPort,
} from './test-helpers.js';

const NOW = new Date('2026-07-01T08:00:00Z');
const clock = new FixedClock(NOW);

function buildUseCase(opts: { lseFails?: boolean } = {}) {
  const workers = new StubSecoWorkersDataPort([
    {
      workerId: 'w-1',
      lastName: 'Dupont',
      firstName: 'Jean',
      avs: '756.1234.5678.97',
      permit: 'C',
      canton: 'GE',
      registeredAtIso: '2024-01-01',
      activeMissionsCount: 1,
    },
  ]);
  const missions = new StubSecoMissionsDataPort([
    {
      missionContractId: 'mc-1',
      reference: 'MC-2026-04-001',
      workerId: 'w-1',
      clientName: 'Acme SA',
      canton: 'GE',
      cctReference: 'CN 2024-2028',
      hourlyRateRappen: 3500,
      startsAtIso: '2026-04-01',
      endsAtIso: '2026-04-30',
      state: 'signed',
    },
  ]);
  const contracts = new StubSecoContractsDataPort([
    {
      missionContractId: 'mc-1',
      reference: 'MC-2026-04-001',
      signedAtIso: '2026-04-15T00:00:00.000Z',
      signedPdfKey: 'gs://x/y',
      zertesEnvelopeId: 'env-1',
    },
  ]);
  const timesheets = new StubSecoTimesheetsDataPort([
    {
      timesheetId: 'ts-1',
      externalTimesheetId: 'mp-1',
      workerId: 'w-1',
      clientName: 'Acme SA',
      weekIso: '2026-W17',
      totalMinutes: 480,
      state: 'signed',
      anomaliesCount: 0,
      receivedAtIso: '2026-04-27',
    },
  ]);
  const lse = opts.lseFails
    ? {
        load: () => Promise.reject(new Error('db_timeout')),
      }
    : new StubSecoLseInfoPort({
        authorization: 'cantonal',
        authorizationNumber: 'GE-LSE-2024-001',
        issuedByCanton: 'GE',
        validFromIso: '2024-01-01',
        validUntilIso: '2027-01-01',
      });
  const audit = new InMemorySecoExportAuditLogger();
  const useCase = new GenerateSecoExportUseCase(
    workers,
    missions,
    contracts,
    timesheets,
    lse,
    audit,
    clock,
  );
  return { useCase, audit };
}

describe('GenerateSecoExportUseCase', () => {
  it('happy path : bundle + csv + audit log', async () => {
    const { useCase, audit } = buildUseCase();
    const result = await useCase.execute({
      agencyId: 'agency-a',
      agencyName: 'Acme Intérim',
      range: { fromIso: '2026-01-01', toIso: '2026-06-30' },
      actorUserId: 'admin-1',
      actorIp: '10.0.0.1',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.bundle.workers).toHaveLength(1);
      expect(result.value.bundle.missions).toHaveLength(1);
      expect(result.value.bundle.timesheets).toHaveLength(1);
      expect(result.value.bundle.stats.workersCount).toBe(1);
      expect(result.value.bundle.stats.timesheetsTotalHours).toBeCloseTo(8.0, 1);
      expect(result.value.csvBundle.workers.content).toContain('Dupont');
      expect(result.value.csvBundle.summaryTxt.content).toContain('Acme Intérim');
    }
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]?.actorUserId).toBe('admin-1');
    expect(audit.entries[0]?.actorIp).toBe('10.0.0.1');
    expect(audit.entries[0]?.stats.workersCount).toBe(1);
  });

  it('range invalide (from > to) → invalid_range', async () => {
    const { useCase } = buildUseCase();
    const r = await useCase.execute({
      agencyId: 'a',
      agencyName: 'Acme',
      range: { fromIso: '2026-12-31', toIso: '2026-01-01' },
      actorUserId: 'u',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('invalid_range');
  });

  it('range format invalide → invalid_range', async () => {
    const { useCase } = buildUseCase();
    const r = await useCase.execute({
      agencyId: 'a',
      agencyName: 'Acme',
      range: { fromIso: '01/01/2026', toIso: '30/06/2026' },
      actorUserId: 'u',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('invalid_range');
  });

  it('LSE port fail → lse_load_failed (pas de bundle généré)', async () => {
    const { useCase, audit } = buildUseCase({ lseFails: true });
    const r = await useCase.execute({
      agencyId: 'a',
      agencyName: 'Acme',
      range: { fromIso: '2026-01-01', toIso: '2026-06-30' },
      actorUserId: 'u',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('lse_load_failed');
    expect(audit.entries).toHaveLength(0);
  });

  it('generatedAt = clock.now() figé', async () => {
    const { useCase } = buildUseCase();
    const r = await useCase.execute({
      agencyId: 'a',
      agencyName: 'Acme',
      range: { fromIso: '2026-01-01', toIso: '2026-06-30' },
      actorUserId: 'u',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.bundle.generatedAtIso).toBe(NOW.toISOString());
    }
  });
});
