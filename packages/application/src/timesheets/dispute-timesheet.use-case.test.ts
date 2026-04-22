import { describe, expect, it } from 'vitest';
import { FixedClock } from '@interim/shared';
import {
  asAgencyId,
  asClientId,
  asStaffId,
  asTimesheetId,
  Timesheet,
  type TimesheetEntry,
} from '@interim/domain';
import { DisputeTimesheetUseCase } from './dispute-timesheet.use-case.js';
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

async function setup(): Promise<{
  repo: InMemoryTimesheetRepository;
  mp: StubTimesheetMpPort;
  useCase: DisputeTimesheetUseCase;
}> {
  const repo = new InMemoryTimesheetRepository();
  const mp = new StubTimesheetMpPort();
  const useCase = new DisputeTimesheetUseCase(repo, mp, clock);
  const ts = Timesheet.create({
    id: asTimesheetId('ts-2'),
    agencyId: AGENCY,
    externalTimesheetId: 'mp-ts-2',
    workerId: WORKER,
    clientId: CLIENT,
    entries: [entry()],
    hourlyRateRappen: 3200,
    anomalies: [],
    receivedAt: NOW,
  });
  await repo.save(ts);
  return { repo, mp, useCase };
}

describe('DisputeTimesheetUseCase', () => {
  it('happy path : push MP + state=disputed', async () => {
    const { useCase, repo, mp } = await setup();
    const r = await useCase.execute({
      agencyId: AGENCY,
      timesheetId: 'ts-2',
      reviewerUserId: 'u-disp-1',
      reason: 'Heures supplémentaires non autorisées par le client',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.state).toBe('disputed');
    expect(mp.disputeCalls).toHaveLength(1);
    expect(mp.disputeCalls[0]?.idempotencyKey).toBe('ts-dispute-ts-2');
    const loaded = await repo.findById(AGENCY, asTimesheetId('ts-2'));
    expect(loaded?.currentState).toBe('disputed');
  });

  it('rejette motif < 10 chars → invalid_reason', async () => {
    const { useCase, mp } = await setup();
    const r = await useCase.execute({
      agencyId: AGENCY,
      timesheetId: 'ts-2',
      reviewerUserId: 'u-1',
      reason: 'court',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('invalid_reason');
    expect(mp.disputeCalls).toHaveLength(0);
  });

  it('rejette motif > 500 chars', async () => {
    const { useCase } = await setup();
    const r = await useCase.execute({
      agencyId: AGENCY,
      timesheetId: 'ts-2',
      reviewerUserId: 'u-1',
      reason: 'x'.repeat(501),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('invalid_reason');
  });

  it('idempotent : déjà disputed → alreadyExisted, pas de re-push', async () => {
    const { useCase, mp } = await setup();
    await useCase.execute({
      agencyId: AGENCY,
      timesheetId: 'ts-2',
      reviewerUserId: 'u-1',
      reason: 'Premier motif détaillé OK',
    });
    const r2 = await useCase.execute({
      agencyId: AGENCY,
      timesheetId: 'ts-2',
      reviewerUserId: 'u-1',
      reason: 'Premier motif détaillé OK',
    });
    if (r2.ok) expect(r2.value.alreadyExisted).toBe(true);
    expect(mp.disputeCalls).toHaveLength(1);
  });

  it('refuse de contester un timesheet déjà signed', async () => {
    const { useCase, repo } = await setup();
    const ts = await repo.findById(AGENCY, asTimesheetId('ts-2'));
    ts!.sign('u-other', clock);
    await repo.save(ts!);
    const r = await useCase.execute({
      agencyId: AGENCY,
      timesheetId: 'ts-2',
      reviewerUserId: 'u-1',
      reason: 'Trop tard, déjà signé... motif détaillé',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('timesheet_wrong_state');
  });

  it('MP transient → mp_transient, état domain inchangé', async () => {
    const { useCase, repo, mp } = await setup();
    mp.failNextDispute = 'transient';
    const r = await useCase.execute({
      agencyId: AGENCY,
      timesheetId: 'ts-2',
      reviewerUserId: 'u-1',
      reason: 'Motif détaillé suffisant pour la validation',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('mp_transient');
    const loaded = await repo.findById(AGENCY, asTimesheetId('ts-2'));
    expect(loaded?.currentState).toBe('received');
  });

  it('multi-tenant : autre agencyId → not_found', async () => {
    const { useCase } = await setup();
    const r = await useCase.execute({
      agencyId: asAgencyId('agency-b'),
      timesheetId: 'ts-2',
      reviewerUserId: 'u-1',
      reason: 'Motif détaillé suffisant',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('timesheet_not_found');
  });

  it('motif trim : whitespace ne compte pas', async () => {
    const { useCase, mp } = await setup();
    const r = await useCase.execute({
      agencyId: AGENCY,
      timesheetId: 'ts-2',
      reviewerUserId: 'u-1',
      reason: '   short    ', // 5 chars trimmed
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('invalid_reason');
    expect(mp.disputeCalls).toHaveLength(0);
  });
});
