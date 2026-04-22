import { describe, expect, it, vi } from 'vitest';
import { FixedClock } from '@interim/shared';
import {
  InboundTimesheetHandler,
  InvalidTimesheetWebhookPayload,
} from './inbound-timesheet.handler.js';
import { RecordInboundTimesheetUseCase } from './record-inbound-timesheet.use-case.js';
import { InMemoryTimesheetRepository } from './test-helpers.js';

const NOW = new Date('2026-04-22T08:00:00Z');

function build(opts: { agencyIdOverride?: string; cctMin?: number } = {}) {
  const repo = new InMemoryTimesheetRepository();
  const useCase = new RecordInboundTimesheetUseCase(repo, new FixedClock(NOW));
  const handler = new InboundTimesheetHandler({
    recordUseCase: useCase,
    ...(opts.agencyIdOverride ? { agencyIdOverride: opts.agencyIdOverride } : {}),
    ...(opts.cctMin !== undefined
      ? { cctMinimumLookup: vi.fn().mockResolvedValue(opts.cctMin) }
      : {}),
  });
  return { repo, handler };
}

function payload(overrides: Record<string, unknown> = {}): unknown {
  return {
    agencyId: 'agency-a',
    timesheetId: 'mp-ts-1',
    workerId: 'worker-1',
    clientId: 'client-1',
    canton: 'GE',
    branch: 'btp_gros_oeuvre',
    hourlyRateRappen: 3200,
    entries: [
      {
        workDate: '2026-04-22T00:00:00Z',
        plannedStart: '2026-04-22T08:00:00Z',
        plannedEnd: '2026-04-22T17:00:00Z',
        actualStart: '2026-04-22T08:00:00Z',
        actualEnd: '2026-04-22T17:00:00Z',
        breakMinutes: 60,
      },
    ],
    ...overrides,
  };
}

describe('InboundTimesheetHandler', () => {
  it('webhook timesheet.ready_for_signature → save timesheet', async () => {
    const { repo, handler } = build();
    await handler.handle({
      eventId: 'evt-1',
      eventType: 'timesheet.ready_for_signature',
      timestamp: NOW.toISOString(),
      payload: payload(),
    });
    expect(repo.size()).toBe(1);
  });

  it('event-type non géré → throw InvalidTimesheetWebhookPayload', async () => {
    const { handler } = build();
    await expect(
      handler.handle({
        eventId: 'evt-x',
        eventType: 'timesheet.unknown',
        timestamp: NOW.toISOString(),
        payload: payload(),
      }),
    ).rejects.toThrow(InvalidTimesheetWebhookPayload);
  });

  it('payload sans timesheetId → throw', async () => {
    const { handler } = build();
    await expect(
      handler.handle({
        eventId: 'evt-bad',
        eventType: 'timesheet.draft',
        timestamp: NOW.toISOString(),
        payload: payload({ timesheetId: undefined }),
      }),
    ).rejects.toThrow(/timesheetId/);
  });

  it('agencyIdOverride (URL multi-tenant) prend le pas sur payload', async () => {
    const { repo, handler } = build({ agencyIdOverride: 'agency-from-url' });
    await handler.handle({
      eventId: 'evt-mt',
      eventType: 'timesheet.draft',
      timestamp: NOW.toISOString(),
      payload: payload({ agencyId: 'agency-in-payload' }),
    });
    // Si on cherche par agencyIdOverride, on doit trouver
    const found = await repo.findByExternalId('agency-from-url' as never, 'mp-ts-1');
    expect(found).toBeDefined();
  });

  it('payload sans agencyId ni override → throw', async () => {
    const { handler } = build();
    await expect(
      handler.handle({
        eventId: 'evt-no-agency',
        eventType: 'timesheet.draft',
        timestamp: NOW.toISOString(),
        payload: payload({ agencyId: undefined }),
      }),
    ).rejects.toThrow(/agencyId/);
  });

  it('cctMinimumLookup appelée et résultat propagé', async () => {
    const lookupSpy = vi.fn().mockResolvedValue(3500);
    const repo = new InMemoryTimesheetRepository();
    const useCase = new RecordInboundTimesheetUseCase(repo, new FixedClock(NOW));
    const handler = new InboundTimesheetHandler({
      recordUseCase: useCase,
      cctMinimumLookup: lookupSpy,
    });
    await handler.handle({
      eventId: 'evt-cct',
      eventType: 'timesheet.ready_for_signature',
      timestamp: NOW.toISOString(),
      payload: payload({ hourlyRateRappen: 3000 }), // < 3500 → blocker
    });
    expect(lookupSpy).toHaveBeenCalledWith({ canton: 'GE', branch: 'btp_gros_oeuvre' });
    const found = await repo.findByExternalId('agency-a' as never, 'mp-ts-1');
    expect(found?.toSnapshot().state).toBe('under_review');
  });

  it('event timesheet.tacitly_validated → état tacit', async () => {
    const { repo, handler } = build();
    await handler.handle({
      eventId: 'evt-tacit',
      eventType: 'timesheet.tacitly_validated',
      timestamp: NOW.toISOString(),
      payload: payload({ timesheetId: 'mp-ts-tacit' }),
    });
    const found = await repo.findByExternalId('agency-a' as never, 'mp-ts-tacit');
    expect(found?.toSnapshot().state).toBe('tacit');
  });

  it('date invalide dans entries → throw', async () => {
    const { handler } = build();
    await expect(
      handler.handle({
        eventId: 'evt-bad-date',
        eventType: 'timesheet.draft',
        timestamp: NOW.toISOString(),
        payload: payload({
          entries: [
            {
              workDate: 'not-a-date',
              plannedStart: '2026-04-22T08:00:00Z',
              plannedEnd: '2026-04-22T17:00:00Z',
              actualStart: '2026-04-22T08:00:00Z',
              actualEnd: '2026-04-22T17:00:00Z',
              breakMinutes: 60,
            },
          ],
        }),
      }),
    ).rejects.toThrow(/date invalide/);
  });
});
