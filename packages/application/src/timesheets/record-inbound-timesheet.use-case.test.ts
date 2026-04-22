import { describe, expect, it } from 'vitest';
import { FixedClock } from '@interim/shared';
import { asAgencyId, asClientId, asStaffId, type TimesheetEntry } from '@interim/domain';
import { RecordInboundTimesheetUseCase } from './record-inbound-timesheet.use-case.js';
import { InMemoryTimesheetRepository } from './test-helpers.js';

const NOW = new Date('2026-04-22T08:00:00Z');
const clock = new FixedClock(NOW);
const AGENCY = asAgencyId('agency-a');
const WORKER = asStaffId('worker-1');
const CLIENT = asClientId('client-1');

let counter = 0;
const fixedId = (): string => `ts-${String(++counter)}`;

function entry(opts: {
  date: string;
  start: string;
  end: string;
  breakMin?: number;
  plannedStart?: string;
  plannedEnd?: string;
}): TimesheetEntry {
  const workDate = new Date(`${opts.date}T00:00:00Z`);
  const actualStart = new Date(`${opts.date}T${opts.start}:00Z`);
  const actualEnd = new Date(`${opts.date}T${opts.end}:00Z`);
  const plannedStart = new Date(`${opts.date}T${opts.plannedStart ?? opts.start}:00Z`);
  const plannedEnd = new Date(`${opts.date}T${opts.plannedEnd ?? opts.end}:00Z`);
  return {
    workDate,
    plannedStart,
    plannedEnd,
    actualStart,
    actualEnd,
    breakMinutes: opts.breakMin ?? 60,
  };
}

function makeCase() {
  const repo = new InMemoryTimesheetRepository();
  const useCase = new RecordInboundTimesheetUseCase(repo, clock);
  return { repo, useCase };
}

describe('RecordInboundTimesheetUseCase', () => {
  it("happy path : timesheet créé en received, pas d'anomalie", async () => {
    counter = 100;
    const { useCase, repo } = makeCase();
    const r = await useCase.execute({
      agencyId: AGENCY,
      externalTimesheetId: 'mp-ts-100',
      workerId: WORKER,
      clientId: CLIENT,
      entries: [entry({ date: '2026-04-22', start: '08:00', end: '17:00' })],
      hourlyRateRappen: 3200,
      eventType: 'timesheet.ready_for_signature',
      idFactory: fixedId,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.state).toBe('received');
      expect(r.value.anomaliesCount).toBe(0);
      expect(r.value.alreadyExisted).toBe(false);
    }
    expect(repo.size()).toBe(1);
  });

  it('idempotent : même externalTimesheetId → alreadyExisted', async () => {
    counter = 110;
    const { useCase, repo } = makeCase();
    const input = {
      agencyId: AGENCY,
      externalTimesheetId: 'mp-ts-110',
      workerId: WORKER,
      clientId: CLIENT,
      entries: [entry({ date: '2026-04-22', start: '08:00', end: '17:00' })],
      hourlyRateRappen: 3200,
      eventType: 'timesheet.ready_for_signature' as const,
      idFactory: fixedId,
    };
    const r1 = await useCase.execute(input);
    const r2 = await useCase.execute(input);
    expect(r1.ok && r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r1.value.alreadyExisted).toBe(false);
      expect(r2.value.alreadyExisted).toBe(true);
      expect(r2.value.timesheetId).toBe(r1.value.timesheetId);
    }
    expect(repo.size()).toBe(1);
  });

  it('pause manquante 8h sans pause → anomalie missing_break, état received (warning)', async () => {
    counter = 120;
    const { useCase } = makeCase();
    const r = await useCase.execute({
      agencyId: AGENCY,
      externalTimesheetId: 'mp-ts-120',
      workerId: WORKER,
      clientId: CLIENT,
      entries: [entry({ date: '2026-04-22', start: '08:00', end: '17:00', breakMin: 0 })],
      hourlyRateRappen: 3200,
      eventType: 'timesheet.ready_for_signature',
      idFactory: fixedId,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.anomaliesCount).toBeGreaterThanOrEqual(1);
      expect(r.value.state).toBe('received'); // warning seul → received
    }
  });

  it('cumul 51h sur semaine → anomalie blocker → état under_review', async () => {
    counter = 130;
    const { useCase, repo } = makeCase();
    // Seed un premier timesheet 42h sur lundi-vendredi
    await useCase.execute({
      agencyId: AGENCY,
      externalTimesheetId: 'mp-prior',
      workerId: WORKER,
      clientId: CLIENT,
      entries: [
        entry({ date: '2026-04-20', start: '08:00', end: '17:30', breakMin: 30 }),
        entry({ date: '2026-04-21', start: '08:00', end: '17:30', breakMin: 30 }),
        entry({ date: '2026-04-22', start: '08:00', end: '17:30', breakMin: 30 }),
        entry({ date: '2026-04-23', start: '08:00', end: '17:30', breakMin: 30 }),
        entry({ date: '2026-04-24', start: '08:00', end: '14:30', breakMin: 30 }),
      ],
      hourlyRateRappen: 3200,
      eventType: 'timesheet.draft',
      idFactory: fixedId,
    });
    expect(repo.size()).toBe(1);

    // Nouveau timesheet samedi 9h → cumul 51h
    const r = await useCase.execute({
      agencyId: AGENCY,
      externalTimesheetId: 'mp-ts-130',
      workerId: WORKER,
      clientId: CLIENT,
      entries: [entry({ date: '2026-04-25', start: '08:00', end: '17:30', breakMin: 30 })],
      hourlyRateRappen: 3200,
      eventType: 'timesheet.ready_for_signature',
      idFactory: fixedId,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.state).toBe('under_review');
      expect(r.value.anomaliesCount).toBeGreaterThanOrEqual(1);
    }
  });

  it('event timesheet.tacitly_validated → état tacit', async () => {
    counter = 140;
    const { useCase } = makeCase();
    const r = await useCase.execute({
      agencyId: AGENCY,
      externalTimesheetId: 'mp-ts-140',
      workerId: WORKER,
      clientId: CLIENT,
      entries: [entry({ date: '2026-04-22', start: '08:00', end: '17:00' })],
      hourlyRateRappen: 3200,
      eventType: 'timesheet.tacitly_validated',
      idFactory: fixedId,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.state).toBe('tacit');
  });

  it('entries vide → invalid_payload', async () => {
    counter = 150;
    const { useCase } = makeCase();
    const r = await useCase.execute({
      agencyId: AGENCY,
      externalTimesheetId: 'mp-ts-150',
      workerId: WORKER,
      clientId: CLIENT,
      entries: [],
      hourlyRateRappen: 3200,
      eventType: 'timesheet.ready_for_signature',
      idFactory: fixedId,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('invalid_payload');
  });

  it('hourlyRate < CCT min → anomalie blocker', async () => {
    counter = 160;
    const { useCase } = makeCase();
    const r = await useCase.execute({
      agencyId: AGENCY,
      externalTimesheetId: 'mp-ts-160',
      workerId: WORKER,
      clientId: CLIENT,
      entries: [entry({ date: '2026-04-22', start: '08:00', end: '17:00' })],
      hourlyRateRappen: 2800,
      cctMinimumRateRappen: 3200,
      eventType: 'timesheet.ready_for_signature',
      idFactory: fixedId,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.state).toBe('under_review');
      expect(r.value.anomaliesCount).toBeGreaterThanOrEqual(1);
    }
  });

  it('multi-tenant : autre agencyId pour findByExternalId → pas trouvé, créé nouveau', async () => {
    counter = 170;
    const { useCase, repo } = makeCase();
    await useCase.execute({
      agencyId: AGENCY,
      externalTimesheetId: 'mp-shared-id',
      workerId: WORKER,
      clientId: CLIENT,
      entries: [entry({ date: '2026-04-22', start: '08:00', end: '17:00' })],
      hourlyRateRappen: 3200,
      eventType: 'timesheet.draft',
      idFactory: fixedId,
    });
    const r = await useCase.execute({
      agencyId: asAgencyId('agency-b'),
      externalTimesheetId: 'mp-shared-id',
      workerId: WORKER,
      clientId: CLIENT,
      entries: [entry({ date: '2026-04-22', start: '08:00', end: '17:00' })],
      hourlyRateRappen: 3200,
      eventType: 'timesheet.draft',
      idFactory: fixedId,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.alreadyExisted).toBe(false);
    expect(repo.size()).toBe(2);
  });
});
