import { describe, expect, it, vi } from 'vitest';
import { FixedClock } from '@interim/shared';
import {
  asAgencyId,
  asClientId,
  asStaffId,
  asTimesheetId,
  Timesheet,
  type TimesheetEntry,
} from '@interim/domain';
import {
  InvalidConfirmationPayload,
  TimesheetConfirmationHandler,
} from './timesheet-confirmation.handler.js';
import { InMemoryTimesheetRepository } from './test-helpers.js';

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

async function build(opts: { state?: 'received' | 'signed' } = {}): Promise<{
  repo: InMemoryTimesheetRepository;
  handler: TimesheetConfirmationHandler;
  onMismatch: ReturnType<typeof vi.fn>;
}> {
  const repo = new InMemoryTimesheetRepository();
  const ts = Timesheet.create({
    id: asTimesheetId('ts-c'),
    agencyId: AGENCY,
    externalTimesheetId: 'mp-ts-c',
    workerId: WORKER,
    clientId: CLIENT,
    entries: [entry()],
    hourlyRateRappen: 3200,
    anomalies: [],
    receivedAt: NOW,
  });
  if (opts.state === 'signed') ts.sign('u-1', clock);
  await repo.save(ts);
  const onMismatch = vi.fn();
  const handler = new TimesheetConfirmationHandler({ repo, onMismatch });
  return { repo, handler, onMismatch };
}

describe('TimesheetConfirmationHandler', () => {
  it('confirmation sur timesheet déjà signed → no-op, pas de mismatch', async () => {
    const { handler, onMismatch } = await build({ state: 'signed' });
    await handler.handle({
      eventId: 'evt-c1',
      eventType: 'timesheet.signed_by_partner',
      timestamp: NOW.toISOString(),
      payload: {
        agencyId: 'agency-a',
        timesheetId: 'mp-ts-c',
        signedAt: NOW.toISOString(),
        signedBy: 'mp-user-1',
      },
    });
    expect(onMismatch).not.toHaveBeenCalled();
  });

  it('confirmation sur timesheet en état received → onMismatch appelé', async () => {
    const { handler, onMismatch } = await build({ state: 'received' });
    await handler.handle({
      eventId: 'evt-c2',
      eventType: 'timesheet.signed_by_partner',
      timestamp: NOW.toISOString(),
      payload: {
        agencyId: 'agency-a',
        timesheetId: 'mp-ts-c',
        signedAt: NOW.toISOString(),
      },
    });
    expect(onMismatch).toHaveBeenCalledWith(
      expect.objectContaining({
        externalTimesheetId: 'mp-ts-c',
        observedState: 'received',
        expectedState: 'signed',
      }),
    );
  });

  it('event-type non géré → throw', async () => {
    const { handler } = await build();
    await expect(
      handler.handle({
        eventId: 'evt-bad',
        eventType: 'timesheet.unknown',
        timestamp: NOW.toISOString(),
        payload: { timesheetId: 'mp-ts-c', signedAt: NOW.toISOString() },
      }),
    ).rejects.toThrow(InvalidConfirmationPayload);
  });

  it('payload sans timesheetId → throw', async () => {
    const { handler } = await build();
    await expect(
      handler.handle({
        eventId: 'evt-bad-ts',
        eventType: 'timesheet.signed_by_partner',
        timestamp: NOW.toISOString(),
        payload: { agencyId: 'agency-a', signedAt: NOW.toISOString() },
      }),
    ).rejects.toThrow(/timesheetId/);
  });

  it("timesheet inconnu → no-op silencieux (pas d'erreur)", async () => {
    const { handler, onMismatch } = await build();
    await handler.handle({
      eventId: 'evt-unk',
      eventType: 'timesheet.signed_by_partner',
      timestamp: NOW.toISOString(),
      payload: {
        agencyId: 'agency-a',
        timesheetId: 'mp-unknown',
        signedAt: NOW.toISOString(),
      },
    });
    expect(onMismatch).not.toHaveBeenCalled();
  });

  it('agencyIdOverride utilisé si payload.agencyId absent', async () => {
    const repo = new InMemoryTimesheetRepository();
    const ts = Timesheet.create({
      id: asTimesheetId('ts-mt'),
      agencyId: AGENCY,
      externalTimesheetId: 'mp-ts-mt',
      workerId: WORKER,
      clientId: CLIENT,
      entries: [entry()],
      hourlyRateRappen: 3200,
      anomalies: [],
      receivedAt: NOW,
    });
    ts.sign('u-1', clock);
    await repo.save(ts);
    const onMismatch = vi.fn();
    const handler = new TimesheetConfirmationHandler({
      repo,
      agencyIdOverride: 'agency-a',
      onMismatch,
    });
    await handler.handle({
      eventId: 'evt-mt',
      eventType: 'timesheet.signed_by_partner',
      timestamp: NOW.toISOString(),
      payload: { timesheetId: 'mp-ts-mt', signedAt: NOW.toISOString() },
    });
    expect(onMismatch).not.toHaveBeenCalled();
  });
});
