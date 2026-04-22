import {
  DEFAULT_THRESHOLDS,
  type TimesheetAnomaly,
  type TimesheetAnomalyKind,
  type TimesheetThresholds,
} from './anomaly.js';
import type { TimesheetEntry } from './timesheet.js';

/**
 * Détecte les anomalies LTr/CCT dans une liste d'entries d'un timesheet.
 *
 * Pure : aucun effet de bord, déterministe. Idéal pour réutilisation
 * dans tests et UI (preview avant import).
 *
 * Note : `cumulPriorWeekMinutes` permet d'ajouter le cumul des autres
 * timesheets de la même semaine ISO pour détecter le dépassement
 * hebdo (un timesheet par mission, plusieurs missions/semaine).
 */
export interface DetectAnomaliesInput {
  readonly entries: readonly TimesheetEntry[];
  readonly hourlyRateRappen: number;
  /** Taux minimum CCT applicable (rappen). Si null, check skippé. */
  readonly cctMinimumRateRappen?: number;
  /** Cumul minutes déjà travaillées sur la même semaine ISO (autres timesheets). */
  readonly cumulPriorWeekMinutes?: number;
  readonly thresholds?: TimesheetThresholds;
}

export function detectTimesheetAnomalies(input: DetectAnomaliesInput): readonly TimesheetAnomaly[] {
  const t = input.thresholds ?? DEFAULT_THRESHOLDS;
  const out: TimesheetAnomaly[] = [];

  // Sort entries by date for daily-rest checks
  const sorted = [...input.entries].sort(
    (a, b) => a.actualStart.getTime() - b.actualStart.getTime(),
  );

  let cumulMinutes = input.cumulPriorWeekMinutes ?? 0;

  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i];
    if (!e) continue;
    const workedMinutes =
      Math.max(0, (e.actualEnd.getTime() - e.actualStart.getTime()) / 60_000) - e.breakMinutes;

    // Pause manquante sur journée longue
    if (workedMinutes > t.longDayMinutes && e.breakMinutes < t.minBreakIfLongDayMinutes) {
      out.push(
        anomaly('missing_break', 'warning', 'Pause < 30min sur journée > 7h (LTr art. 15)', {
          workedMinutes,
          breakMinutes: e.breakMinutes,
        }),
      );
    }

    // Repos quotidien insuffisant
    const prev = sorted[i - 1];
    if (prev) {
      const restMinutes = (e.actualStart.getTime() - prev.actualEnd.getTime()) / 60_000;
      if (restMinutes < t.minDailyRestMinutes) {
        out.push(
          anomaly(
            'daily_rest_insufficient',
            'blocker',
            'Repos < 11h entre 2 journées (LTr art. 15a)',
            { restMinutes: Math.round(restMinutes) },
          ),
        );
      }
    }

    // Écart planifié/réel
    const startDivergenceMin = Math.abs(
      (e.actualStart.getTime() - e.plannedStart.getTime()) / 60_000,
    );
    const endDivergenceMin = Math.abs((e.actualEnd.getTime() - e.plannedEnd.getTime()) / 60_000);
    const maxDivergence = Math.max(startDivergenceMin, endDivergenceMin);
    if (maxDivergence > t.maxPlannedActualDivergenceMinutes) {
      out.push(
        anomaly(
          'planned_actual_divergence',
          'warning',
          `Écart planifié/réel ${String(Math.round(maxDivergence))}min > 30min`,
          {
            startDivergenceMin: Math.round(startDivergenceMin),
            endDivergenceMin: Math.round(endDivergenceMin),
          },
        ),
      );
    }

    // Travail de nuit non déclaré : work range overlaps [23h, 06h next day]
    const startHourUtc = e.actualStart.getUTCHours();
    const endHourUtc = e.actualEnd.getUTCHours();
    const startMin = e.actualStart.getUTCMinutes();
    const endMin = e.actualEnd.getUTCMinutes();
    const startTotalMin = startHourUtc * 60 + startMin;
    const endTotalMin = endHourUtc * 60 + endMin;
    const nightStartTotalMin = t.nightStartHour * 60;
    const nightEndTotalMin = t.nightEndHour * 60;
    const crossesMidnight = endTotalMin <= startTotalMin;
    const isNight =
      startTotalMin >= nightStartTotalMin || // commence après 23h
      startTotalMin < nightEndTotalMin || // commence avant 06h
      endTotalMin > nightStartTotalMin || // termine après 23h
      crossesMidnight; // déborde sur le lendemain
    if (isNight) {
      out.push(
        anomaly('night_work_undeclared', 'warning', 'Heures nuit (23h-06h) — vérifier majoration', {
          startHourUtc,
          endHourUtc,
        }),
      );
    }

    // Travail dimanche (UTC 0 = dimanche)
    if (e.actualStart.getUTCDay() === 0 || e.actualEnd.getUTCDay() === 0) {
      out.push(
        anomaly(
          'sunday_work_undeclared',
          'warning',
          'Heures dimanche — vérifier majoration 50% (LTr art. 19)',
          {},
        ),
      );
    }

    cumulMinutes += workedMinutes;
  }

  // Cumul hebdo
  if (cumulMinutes > t.maxWeeklyMinutes) {
    out.push(
      anomaly(
        'weekly_limit_exceeded',
        'blocker',
        `Cumul ${(cumulMinutes / 60).toFixed(1)}h > 50h (LTr art. 9 al. 1)`,
        {
          cumulMinutes: Math.round(cumulMinutes),
        },
      ),
    );
  }

  // Taux horaire sous CCT
  if (
    input.cctMinimumRateRappen !== undefined &&
    input.hourlyRateRappen < input.cctMinimumRateRappen
  ) {
    out.push(
      anomaly(
        'hourly_rate_below_cct',
        'blocker',
        `Taux ${centsToChf(input.hourlyRateRappen)} < CCT ${centsToChf(input.cctMinimumRateRappen)}`,
        {
          hourlyRateRappen: input.hourlyRateRappen,
          cctMinimumRateRappen: input.cctMinimumRateRappen,
        },
      ),
    );
  }

  return out;
}

function anomaly(
  kind: TimesheetAnomalyKind,
  severity: 'warning' | 'blocker',
  message: string,
  context: Readonly<Record<string, string | number>>,
): TimesheetAnomaly {
  return { kind, severity, message, context };
}

function centsToChf(rappen: number): string {
  return `CHF ${(rappen / 100).toFixed(2)}`;
}
