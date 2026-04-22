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
import { GenerateInvoiceUseCase } from './generate-invoice.use-case.js';
import { InMemoryInvoiceRepository } from './test-helpers.js';

const NOW = new Date('2026-04-27T08:00:00Z');
const clock = new FixedClock(NOW);
const AGENCY = asAgencyId('agency-a');
const CLIENT = asClientId('client-1');
const WORKER = asStaffId('worker-1');

function entry(opts: {
  date: string;
  start: string;
  end: string;
  breakMin?: number;
}): TimesheetEntry {
  return {
    workDate: new Date(`${opts.date}T00:00:00Z`),
    plannedStart: new Date(`${opts.date}T${opts.start}:00Z`),
    plannedEnd: new Date(`${opts.date}T${opts.end}:00Z`),
    actualStart: new Date(`${opts.date}T${opts.start}:00Z`),
    actualEnd: new Date(`${opts.date}T${opts.end}:00Z`),
    breakMinutes: opts.breakMin ?? 0,
  };
}

function timesheetFor(opts: {
  id: string;
  state: 'signed' | 'tacit' | 'received' | 'disputed';
  clientId?: ReturnType<typeof asClientId>;
  entries?: readonly TimesheetEntry[];
}): Timesheet {
  const ts = Timesheet.create({
    id: asTimesheetId(opts.id),
    agencyId: AGENCY,
    externalTimesheetId: `ext-${opts.id}`,
    workerId: WORKER,
    clientId: opts.clientId ?? CLIENT,
    entries: opts.entries ?? [
      entry({ date: '2026-04-22', start: '08:00', end: '17:00', breakMin: 60 }),
    ],
    hourlyRateRappen: 3200,
    anomalies: [],
    receivedAt: NOW,
  });
  if (opts.state === 'signed') ts.sign('reviewer-1', clock);
  if (opts.state === 'tacit') ts.markTacit(clock);
  if (opts.state === 'disputed') ts.dispute('reviewer-1', clock);
  return ts;
}

describe('GenerateInvoiceUseCase', () => {
  it('happy path : 1 timesheet signed → 1 invoice avec TVA 8.1%', async () => {
    const repo = new InMemoryInvoiceRepository();
    const useCase = new GenerateInvoiceUseCase(repo, clock);
    const ts = timesheetFor({ id: 'ts-1', state: 'signed' });
    const result = await useCase.execute({
      agencyId: AGENCY,
      agencyCode: 'ACME',
      clientId: CLIENT,
      clientCode: '1',
      timesheets: [ts],
      clientHourlyRateRappenByTimesheetId: new Map([[ts.id, 5000n]]),
      periodFromIso: '2026-04-20',
      periodToIso: '2026-04-26',
      vatRateBp: 810,
      issueDate: NOW,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.invoiceNumber).toBe('ACME-2026-0001');
      expect(result.value.qrReference.length).toBe(27);
      // 8h × 5000 rappen = 40_000 rappen HT
      expect(result.value.subtotalHtRappen).toBe(40_000n);
      expect(result.value.vatAmountRappen).toBe(3_240n); // 8.1%
      expect(result.value.totalTtcRappen).toBe(43_240n);
    }
    expect(repo.size()).toBe(1);
  });

  it('agrège 3 timesheets signed → subtotal cohérent', async () => {
    const repo = new InMemoryInvoiceRepository();
    const useCase = new GenerateInvoiceUseCase(repo, clock);
    const ts1 = timesheetFor({ id: 'ts-1', state: 'signed' });
    const ts2 = timesheetFor({ id: 'ts-2', state: 'signed' });
    const ts3 = timesheetFor({ id: 'ts-3', state: 'tacit' });
    const result = await useCase.execute({
      agencyId: AGENCY,
      agencyCode: 'ACME',
      clientId: CLIENT,
      clientCode: '1',
      timesheets: [ts1, ts2, ts3],
      clientHourlyRateRappenByTimesheetId: new Map([
        [ts1.id, 5000n],
        [ts2.id, 5000n],
        [ts3.id, 5000n],
      ]),
      periodFromIso: '2026-04-20',
      periodToIso: '2026-04-26',
      vatRateBp: 810,
      issueDate: NOW,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // 3 × 8h × 5000 = 120_000
      expect(result.value.subtotalHtRappen).toBe(120_000n);
    }
  });

  it('exclut disputed/received', async () => {
    const repo = new InMemoryInvoiceRepository();
    const useCase = new GenerateInvoiceUseCase(repo, clock);
    const ts1 = timesheetFor({ id: 'ts-1', state: 'signed' });
    const ts2 = timesheetFor({ id: 'ts-2', state: 'disputed' });
    const ts3 = timesheetFor({ id: 'ts-3', state: 'received' });
    const result = await useCase.execute({
      agencyId: AGENCY,
      agencyCode: 'ACME',
      clientId: CLIENT,
      clientCode: '1',
      timesheets: [ts1, ts2, ts3],
      clientHourlyRateRappenByTimesheetId: new Map([
        [ts1.id, 5000n],
        [ts2.id, 5000n],
        [ts3.id, 5000n],
      ]),
      periodFromIso: '2026-04-20',
      periodToIso: '2026-04-26',
      vatRateBp: 810,
      issueDate: NOW,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Seul ts1 compté : 8h × 5000 = 40_000
      expect(result.value.subtotalHtRappen).toBe(40_000n);
    }
  });

  it('idempotent : 2e appel même période → alreadyExisted', async () => {
    const repo = new InMemoryInvoiceRepository();
    const useCase = new GenerateInvoiceUseCase(repo, clock);
    const ts = timesheetFor({ id: 'ts-1', state: 'signed' });
    const input = {
      agencyId: AGENCY,
      agencyCode: 'ACME',
      clientId: CLIENT,
      clientCode: '1',
      timesheets: [ts],
      clientHourlyRateRappenByTimesheetId: new Map([[ts.id, 5000n]]),
      periodFromIso: '2026-04-20',
      periodToIso: '2026-04-26',
      vatRateBp: 810,
      issueDate: NOW,
    };
    const r1 = await useCase.execute(input);
    const r2 = await useCase.execute(input);
    expect(r1.ok && r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r1.value.alreadyExisted).toBe(false);
      expect(r2.value.alreadyExisted).toBe(true);
      expect(r2.value.invoiceNumber).toBe(r1.value.invoiceNumber);
    }
    expect(repo.size()).toBe(1);
  });

  it('numérotation séquentielle atomique : 2 factures → NNNN incrémenté', async () => {
    const repo = new InMemoryInvoiceRepository();
    const useCase = new GenerateInvoiceUseCase(repo, clock);
    const ts1 = timesheetFor({ id: 'ts-1', state: 'signed' });
    const ts2 = timesheetFor({ id: 'ts-2', state: 'signed' });
    const r1 = await useCase.execute({
      agencyId: AGENCY,
      agencyCode: 'ACME',
      clientId: CLIENT,
      clientCode: '1',
      timesheets: [ts1],
      clientHourlyRateRappenByTimesheetId: new Map([[ts1.id, 5000n]]),
      periodFromIso: '2026-04-20',
      periodToIso: '2026-04-26',
      vatRateBp: 810,
      issueDate: NOW,
    });
    const r2 = await useCase.execute({
      agencyId: AGENCY,
      agencyCode: 'ACME',
      clientId: asClientId('client-2'),
      clientCode: '2',
      timesheets: [timesheetFor({ id: 'ts-2', state: 'signed', clientId: asClientId('client-2') })],
      clientHourlyRateRappenByTimesheetId: new Map([[ts2.id, 5000n]]),
      periodFromIso: '2026-04-20',
      periodToIso: '2026-04-26',
      vatRateBp: 810,
      issueDate: NOW,
    });
    expect(r1.ok && r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r1.value.invoiceNumber).toBe('ACME-2026-0001');
      expect(r2.value.invoiceNumber).toBe('ACME-2026-0002');
    }
  });

  it('aucun timesheet signed → no_eligible_timesheets', async () => {
    const repo = new InMemoryInvoiceRepository();
    const useCase = new GenerateInvoiceUseCase(repo, clock);
    const ts = timesheetFor({ id: 'ts-1', state: 'disputed' });
    const result = await useCase.execute({
      agencyId: AGENCY,
      agencyCode: 'ACME',
      clientId: CLIENT,
      clientCode: '1',
      timesheets: [ts],
      clientHourlyRateRappenByTimesheetId: new Map([[ts.id, 5000n]]),
      periodFromIso: '2026-04-20',
      periodToIso: '2026-04-26',
      vatRateBp: 810,
      issueDate: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('no_eligible_timesheets');
  });

  it('rate client manquant pour un timesheet → invalid_input', async () => {
    const repo = new InMemoryInvoiceRepository();
    const useCase = new GenerateInvoiceUseCase(repo, clock);
    const ts = timesheetFor({ id: 'ts-1', state: 'signed' });
    const result = await useCase.execute({
      agencyId: AGENCY,
      agencyCode: 'ACME',
      clientId: CLIENT,
      clientCode: '1',
      timesheets: [ts],
      clientHourlyRateRappenByTimesheetId: new Map(), // vide !
      periodFromIso: '2026-04-20',
      periodToIso: '2026-04-26',
      vatRateBp: 810,
      issueDate: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('invalid_input');
  });

  it('multi-tenant : timesheet autre client → filtré', async () => {
    const repo = new InMemoryInvoiceRepository();
    const useCase = new GenerateInvoiceUseCase(repo, clock);
    const tsOther = timesheetFor({
      id: 'ts-other',
      state: 'signed',
      clientId: asClientId('other-client'),
    });
    const result = await useCase.execute({
      agencyId: AGENCY,
      agencyCode: 'ACME',
      clientId: CLIENT,
      clientCode: '1',
      timesheets: [tsOther],
      clientHourlyRateRappenByTimesheetId: new Map([[tsOther.id, 5000n]]),
      periodFromIso: '2026-04-20',
      periodToIso: '2026-04-26',
      vatRateBp: 810,
      issueDate: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('no_eligible_timesheets');
  });
});
