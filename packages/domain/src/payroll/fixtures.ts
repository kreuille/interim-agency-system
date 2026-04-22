import { WeekIso } from '@interim/shared';
import { asAgencyId, type AgencyId, asStaffId, type StaffId } from '../shared/ids.js';
import { asClientId, type ClientId } from '../clients/client.js';
import { asTimesheetId, Timesheet, type TimesheetEntry } from '../timesheets/timesheet.js';
import type { TimesheetAnomaly } from '../timesheets/anomaly.js';

/**
 * Fixtures partagées pour la test-suite du `PayrollEngine`. Chaque test
 * construit un scénario en assemblant ces briques.
 */

export const AGENCY: AgencyId = asAgencyId('agency-a');
export const WORKER: StaffId = asStaffId('worker-1');
export const CLIENT_A: ClientId = asClientId('client-a');
export const CLIENT_B: ClientId = asClientId('client-b');

export const WEEK_2026_W17 = WeekIso.of(2026, 17); // lundi 2026-04-20
export const WEEK_2026_W31 = WeekIso.of(2026, 31); // 1er août (2026-08-01) est samedi

export function entryOn(opts: {
  dateIso: string; // YYYY-MM-DD
  start: string; // HH:MM
  end: string;
  breakMinutes?: number;
  plannedStart?: string;
  plannedEnd?: string;
}): TimesheetEntry {
  const workDate = new Date(`${opts.dateIso}T00:00:00Z`);
  const [sh, sm] = opts.start.split(':').map(Number);
  const [eh, em] = opts.end.split(':').map(Number);
  const startHour = sh ?? 0;
  const startMin = sm ?? 0;
  const endHour = eh ?? 0;
  const endMin = em ?? 0;
  const actualStart = new Date(`${opts.dateIso}T${opts.start}:00Z`);
  // Si end <= start (passage minuit), considérer +1 jour
  let actualEnd: Date;
  if (endHour < startHour || (endHour === startHour && endMin <= startMin)) {
    const next = new Date(workDate.getTime() + 86400_000);
    const isoNext = next.toISOString().slice(0, 10);
    actualEnd = new Date(`${isoNext}T${opts.end}:00Z`);
  } else {
    actualEnd = new Date(`${opts.dateIso}T${opts.end}:00Z`);
  }
  const plannedStart = new Date(`${opts.dateIso}T${opts.plannedStart ?? opts.start}:00Z`);
  const plannedEnd =
    opts.plannedEnd !== undefined ? new Date(`${opts.dateIso}T${opts.plannedEnd}:00Z`) : actualEnd;
  return {
    workDate,
    plannedStart,
    plannedEnd,
    actualStart,
    actualEnd,
    breakMinutes: opts.breakMinutes ?? 0,
  };
}

export function timesheetFor(opts: {
  id: string;
  state: 'signed' | 'tacit' | 'received' | 'under_review' | 'disputed';
  entries: readonly TimesheetEntry[];
  clientId?: ClientId;
  hourlyRateRappen?: number;
  receivedAt?: Date;
  anomalies?: readonly TimesheetAnomaly[];
}): Timesheet {
  const ts = Timesheet.create({
    id: asTimesheetId(opts.id),
    agencyId: AGENCY,
    externalTimesheetId: `ext-${opts.id}`,
    workerId: WORKER,
    clientId: opts.clientId ?? CLIENT_A,
    entries: opts.entries,
    hourlyRateRappen: opts.hourlyRateRappen ?? 3200,
    anomalies: opts.anomalies ?? [],
    receivedAt: opts.receivedAt ?? new Date('2026-04-27T08:00:00Z'),
  });
  // Force l'état : on utilise le clock partagé des tests via require
  const clock = { now: () => new Date('2026-04-28T00:00:00Z') };
  if (opts.state === 'signed') ts.sign('reviewer-1', clock);
  if (opts.state === 'tacit') ts.markTacit(clock);
  if (opts.state === 'disputed') ts.dispute('reviewer-1', clock);
  if (opts.state === 'under_review') ts.beginReview('reviewer-1', clock);
  // 'received' → no transition
  return ts;
}
