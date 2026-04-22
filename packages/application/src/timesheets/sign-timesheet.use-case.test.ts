import { describe, expect, it } from 'vitest';
import { FixedClock } from '@interim/shared';
import {
  asAgencyId,
  asClientId,
  asStaffId,
  asTimesheetId,
  Timesheet,
  type TimesheetAnomaly,
  type TimesheetEntry,
} from '@interim/domain';
import { SignTimesheetUseCase } from './sign-timesheet.use-case.js';
import { InMemoryTimesheetRepository, StubTimesheetMpPort } from './test-helpers.js';

const NOW = new Date('2026-04-22T08:00:00Z');
const clock = new FixedClock(NOW);
const AGENCY = asAgencyId('agency-a');
const WORKER = asStaffId('worker-1');
const CLIENT = asClientId('client-1');

function entry(): TimesheetEntry {
  return {
    workDate: new Date('2026-04-22T00:00:00Z'),
    plannedStart: new Date('2026-04-22T08:00:00Z'),
    plannedEnd: new Date('2026-04-22T17:00:00Z'),
    actualStart: new Date('2026-04-22T08:00:00Z'),
    actualEnd: new Date('2026-04-22T17:00:00Z'),
    breakMinutes: 60,
  };
}

function blocker(): TimesheetAnomaly {
  return {
    kind: 'weekly_limit_exceeded',
    severity: 'blocker',
    message: 'cumul > 50h',
    context: {},
  };
}

async function setupTimesheet(opts: { anomalies?: TimesheetAnomaly[] } = {}): Promise<{
  repo: InMemoryTimesheetRepository;
  mp: StubTimesheetMpPort;
  useCase: SignTimesheetUseCase;
}> {
  const repo = new InMemoryTimesheetRepository();
  const mp = new StubTimesheetMpPort();
  const useCase = new SignTimesheetUseCase(repo, mp, clock);
  const ts = Timesheet.create({
    id: asTimesheetId('ts-1'),
    agencyId: AGENCY,
    externalTimesheetId: 'mp-ts-1',
    workerId: WORKER,
    clientId: CLIENT,
    entries: [entry()],
    hourlyRateRappen: 3200,
    anomalies: opts.anomalies ?? [],
    receivedAt: NOW,
  });
  await repo.save(ts);
  return { repo, mp, useCase };
}

describe('SignTimesheetUseCase', () => {
  it('happy path : push MP + state=signed', async () => {
    const { useCase, repo, mp } = await setupTimesheet();
    const r = await useCase.execute({
      agencyId: AGENCY,
      timesheetId: 'ts-1',
      reviewerUserId: 'u-disp-1',
      notes: 'OK conforme',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.state).toBe('signed');
      expect(r.value.alreadyExisted).toBe(false);
    }
    expect(mp.signCalls).toHaveLength(1);
    expect(mp.signCalls[0]?.idempotencyKey).toBe('ts-sign-ts-1');
    const loaded = await repo.findById(AGENCY, asTimesheetId('ts-1'));
    expect(loaded?.currentState).toBe('signed');
  });

  it('idempotent : déjà signed → alreadyExisted, pas de re-push MP', async () => {
    const { useCase, mp } = await setupTimesheet();
    const r1 = await useCase.execute({
      agencyId: AGENCY,
      timesheetId: 'ts-1',
      reviewerUserId: 'u-1',
    });
    const r2 = await useCase.execute({
      agencyId: AGENCY,
      timesheetId: 'ts-1',
      reviewerUserId: 'u-1',
    });
    expect(r1.ok && r2.ok).toBe(true);
    if (r2.ok) expect(r2.value.alreadyExisted).toBe(true);
    expect(mp.signCalls).toHaveLength(1); // pas de doublon
  });

  it('anomalie blocker → has_blocker_anomaly, pas de push MP', async () => {
    const { useCase, mp } = await setupTimesheet({ anomalies: [blocker()] });
    const r = await useCase.execute({
      agencyId: AGENCY,
      timesheetId: 'ts-1',
      reviewerUserId: 'u-1',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('has_blocker_anomaly');
    expect(mp.signCalls).toHaveLength(0);
  });

  it('timesheet introuvable → timesheet_not_found', async () => {
    const { useCase } = await setupTimesheet();
    const r = await useCase.execute({
      agencyId: AGENCY,
      timesheetId: 'unknown',
      reviewerUserId: 'u-1',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('timesheet_not_found');
  });

  it('multi-tenant : autre agencyId → not_found', async () => {
    const { useCase } = await setupTimesheet();
    const r = await useCase.execute({
      agencyId: asAgencyId('agency-b'),
      timesheetId: 'ts-1',
      reviewerUserId: 'u-1',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('timesheet_not_found');
  });

  it('MP transient error → mp_transient, état domain inchangé', async () => {
    const { useCase, repo, mp } = await setupTimesheet();
    mp.failNextSign = 'transient';
    const r = await useCase.execute({
      agencyId: AGENCY,
      timesheetId: 'ts-1',
      reviewerUserId: 'u-1',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('mp_transient');
    const loaded = await repo.findById(AGENCY, asTimesheetId('ts-1'));
    expect(loaded?.currentState).toBe('received'); // pas de commit
  });

  it('MP permanent error → mp_permanent', async () => {
    const { useCase, mp } = await setupTimesheet();
    mp.failNextSign = 'permanent';
    const r = await useCase.execute({
      agencyId: AGENCY,
      timesheetId: 'ts-1',
      reviewerUserId: 'u-1',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('mp_permanent');
  });

  it('refuse de signer un timesheet en état tacit', async () => {
    const repo = new InMemoryTimesheetRepository();
    const mp = new StubTimesheetMpPort();
    const useCase = new SignTimesheetUseCase(repo, mp, clock);
    const ts = Timesheet.create({
      id: asTimesheetId('ts-tacit'),
      agencyId: AGENCY,
      externalTimesheetId: 'mp-tacit',
      workerId: WORKER,
      clientId: CLIENT,
      entries: [entry()],
      hourlyRateRappen: 3200,
      anomalies: [],
      receivedAt: NOW,
    });
    ts.markTacit(clock);
    await repo.save(ts);
    const r = await useCase.execute({
      agencyId: AGENCY,
      timesheetId: 'ts-tacit',
      reviewerUserId: 'u-1',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('timesheet_wrong_state');
  });
});
