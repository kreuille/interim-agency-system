import { describe, expect, it } from 'vitest';
import { detectTimesheetAnomalies } from './anomaly-detector.js';
import type { TimesheetEntry } from './timesheet.js';

function entry(opts: {
  date: string;
  start: string;
  end: string;
  breakMin: number;
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
    breakMinutes: opts.breakMin,
  };
}

describe('detectTimesheetAnomalies', () => {
  it('aucune anomalie sur journée 7h avec pause 30min', () => {
    const out = detectTimesheetAnomalies({
      entries: [entry({ date: '2026-04-22', start: '08:00', end: '15:00', breakMin: 0 })],
      hourlyRateRappen: 3200,
    });
    // Journée pile 7h → pas d'obligation de pause
    expect(out.find((a) => a.kind === 'missing_break')).toBeUndefined();
  });

  it('pause 0 sur journée 8h → missing_break warning', () => {
    const out = detectTimesheetAnomalies({
      entries: [entry({ date: '2026-04-22', start: '08:00', end: '17:00', breakMin: 0 })],
      hourlyRateRappen: 3200,
    });
    const a = out.find((x) => x.kind === 'missing_break');
    expect(a).toBeDefined();
    expect(a?.severity).toBe('warning');
  });

  it('51h cumul hebdo → weekly_limit_exceeded blocker', () => {
    const out = detectTimesheetAnomalies({
      entries: [entry({ date: '2026-04-22', start: '08:00', end: '17:30', breakMin: 30 })],
      hourlyRateRappen: 3200,
      cumulPriorWeekMinutes: 42 * 60, // déjà 42h, +9h = 51h
    });
    const a = out.find((x) => x.kind === 'weekly_limit_exceeded');
    expect(a).toBeDefined();
    expect(a?.severity).toBe('blocker');
    expect(a?.context.cumulMinutes).toBeGreaterThanOrEqual(50 * 60);
  });

  it('repos 8h entre 2 journées → daily_rest_insufficient blocker', () => {
    const out = detectTimesheetAnomalies({
      entries: [
        entry({ date: '2026-04-22', start: '14:00', end: '23:00', breakMin: 30 }),
        entry({ date: '2026-04-23', start: '06:00', end: '14:00', breakMin: 30 }),
      ],
      hourlyRateRappen: 3200,
    });
    const a = out.find((x) => x.kind === 'daily_rest_insufficient');
    expect(a).toBeDefined();
    expect(a?.severity).toBe('blocker');
  });

  it('écart planifié/réel > 30 min → planned_actual_divergence', () => {
    const out = detectTimesheetAnomalies({
      entries: [
        entry({
          date: '2026-04-22',
          start: '08:45',
          end: '17:00',
          breakMin: 30,
          plannedStart: '08:00',
          plannedEnd: '17:00',
        }),
      ],
      hourlyRateRappen: 3200,
    });
    expect(out.find((x) => x.kind === 'planned_actual_divergence')).toBeDefined();
  });

  it('travail nuit (heures > 23h) → night_work_undeclared warning', () => {
    const out = detectTimesheetAnomalies({
      entries: [entry({ date: '2026-04-22', start: '22:00', end: '23:30', breakMin: 0 })],
      hourlyRateRappen: 3200,
    });
    expect(out.find((x) => x.kind === 'night_work_undeclared')).toBeDefined();
  });

  it('travail dimanche (UTC day=0) → sunday_work_undeclared warning', () => {
    // 2026-04-26 = dimanche
    const out = detectTimesheetAnomalies({
      entries: [entry({ date: '2026-04-26', start: '08:00', end: '12:00', breakMin: 0 })],
      hourlyRateRappen: 3200,
    });
    expect(out.find((x) => x.kind === 'sunday_work_undeclared')).toBeDefined();
  });

  it('taux < CCT → hourly_rate_below_cct blocker', () => {
    const out = detectTimesheetAnomalies({
      entries: [entry({ date: '2026-04-22', start: '08:00', end: '12:00', breakMin: 0 })],
      hourlyRateRappen: 2800,
      cctMinimumRateRappen: 3200,
    });
    const a = out.find((x) => x.kind === 'hourly_rate_below_cct');
    expect(a).toBeDefined();
    expect(a?.severity).toBe('blocker');
  });

  it("taux >= CCT → pas d'anomalie hourly_rate_below_cct", () => {
    const out = detectTimesheetAnomalies({
      entries: [entry({ date: '2026-04-22', start: '08:00', end: '12:00', breakMin: 0 })],
      hourlyRateRappen: 3200,
      cctMinimumRateRappen: 3200,
    });
    expect(out.find((x) => x.kind === 'hourly_rate_below_cct')).toBeUndefined();
  });

  it('thresholds custom : maxWeekly 45h', () => {
    const out = detectTimesheetAnomalies({
      entries: [entry({ date: '2026-04-22', start: '08:00', end: '17:00', breakMin: 30 })],
      hourlyRateRappen: 3200,
      cumulPriorWeekMinutes: 38 * 60, // +8.5h = 46.5h, > 45
      thresholds: {
        minBreakIfLongDayMinutes: 30,
        longDayMinutes: 7 * 60,
        maxWeeklyMinutes: 45 * 60,
        minDailyRestMinutes: 11 * 60,
        maxPlannedActualDivergenceMinutes: 30,
        nightStartHour: 23,
        nightEndHour: 6,
      },
    });
    expect(out.find((x) => x.kind === 'weekly_limit_exceeded')).toBeDefined();
  });
});
