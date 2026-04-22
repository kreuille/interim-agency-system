import { WeekIso } from '@interim/shared';
import type { AgencyId, StaffId } from '../shared/ids.js';
import type { Timesheet, TimesheetEntry } from '../timesheets/timesheet.js';
import type { CantonHolidaysPort } from './canton-holidays.js';
import { computeLineTotalRappen, type PayrollLine } from './payroll-line.js';
import {
  combinedSurchargeBp,
  type PayrollSurchargeKind,
  type PayrollSurchargeRules,
} from './surcharge-rules.js';
import {
  InvalidPayrollInput,
  MismatchedWeek,
  NoSignedTimesheets,
  WeeklyLimitExceededInPayroll,
} from './payroll-errors.js';

/**
 * Moteur de paie hebdomadaire — sprint A5.1.
 *
 * Périmètre :
 *   - Aggrège les timesheets `signed` ou `tacit` d'un worker pour une
 *     semaine ISO donnée (les `disputed`, `under_review`, `received`
 *     sont exclus — preuve juridique non actée).
 *   - Découpe chaque entry en segments (jour / nuit / dimanche / férié)
 *     en appliquant les frontières temporelles (23h, 06h, minuit dim,
 *     minuit férié).
 *   - Multiplie heures × taux × (1 + majo) en arithmétique entière
 *     bigint avec arrondi banker au rappen.
 *   - Refuse si cumul hebdo > seuil LTr (50h bâtiment, 45h logistique
 *     selon `rules.overtimeThresholdMinutes` × 1.22 — pas de calcul,
 *     erreur explicite).
 *   - **Pas** de déductions sociales (A5.3), pas de 13e (A5.7), pas
 *     d'ELM (A5.5). Sortie = brut avant retenues.
 *
 * Reproductibilité : `computationContext` capture les paramètres
 * utilisés (taux, règles, version moteur) pour qu'un audit puisse
 * recalculer à l'identique 10 ans plus tard.
 */

export const PAYROLL_ENGINE_VERSION = '1.0.0';

export interface PayrollWorkerSnapshot {
  readonly workerId: StaffId;
  readonly canton: string;
  /** Si workers < 20 ans : taux CCT spécifique (cf. `findApplicableMinimum`). */
  readonly ageBracket?: 'under_20' | 'twenty_plus' | 'fifty_plus';
}

export interface PayrollClientSnapshot {
  readonly clientId: string;
  readonly branch: string;
  readonly canton: string;
}

export interface ComputeWeekInput {
  readonly agencyId: AgencyId;
  readonly worker: PayrollWorkerSnapshot;
  /**
   * Tous les timesheets candidats. Le moteur filtre `signed`/`tacit` et
   * vérifie qu'ils sont bien dans la semaine demandée.
   */
  readonly timesheets: readonly Timesheet[];
  readonly isoWeek: WeekIso;
  /**
   * Lookup client par clientId — chaque entry peut référencer un client
   * distinct (worker peut intervenir chez plusieurs clients dans la
   * même semaine).
   */
  readonly clients: ReadonlyMap<string, PayrollClientSnapshot>;
  /**
   * Taux horaires par `(branch, canton, ageBracket)` à la date de
   * l'entry. La résolution est faite en amont — ici on attend la map
   * directement par clientId (taux applicable pour ce client × ce worker).
   *
   * Si une entry référence un clientId absent → erreur explicite.
   */
  readonly hourlyRatesRappenByClient: ReadonlyMap<string, bigint>;
  readonly surchargeRules: PayrollSurchargeRules;
  readonly holidays: CantonHolidaysPort;
}

export interface PayrollComputationContext {
  readonly engineVersion: string;
  readonly computedAt: string; // ISO
  readonly isoWeek: string;
  readonly clientsSnapshot: readonly PayrollClientSnapshot[];
  readonly hourlyRatesByClient: Readonly<Record<string, string>>; // bigint stringified
  readonly surchargeRules: PayrollSurchargeRules;
  readonly cantonHolidaysApplied: readonly { canton: string; date: string; label: string }[];
}

export interface PayrollBreakdown {
  readonly agencyId: AgencyId;
  readonly workerId: StaffId;
  readonly isoWeek: string;
  readonly lines: readonly PayrollLine[];
  readonly grossBaseRappen: bigint;
  readonly surchargesRappen: bigint;
  readonly grossTotalBeforeSocialRappen: bigint;
  readonly totalMinutes: number;
  readonly minutesByKind: Readonly<Record<PayrollSurchargeKind, number>>;
  readonly computationContext: PayrollComputationContext;
}

export class PayrollEngine {
  computeWeek(input: ComputeWeekInput): PayrollBreakdown {
    const isoWeekStr = input.isoWeek.toString();
    const eligible = input.timesheets.filter(
      (t) => t.currentState === 'signed' || t.currentState === 'tacit',
    );
    if (eligible.length === 0) {
      throw new NoSignedTimesheets(input.worker.workerId, isoWeekStr);
    }

    // Vérifier que chaque eligible est bien dans la semaine demandée
    for (const t of eligible) {
      const snap = t.toSnapshot();
      const firstEntry = snap.entries[0];
      if (!firstEntry) {
        throw new InvalidPayrollInput(`Timesheet ${t.id} sans entry`);
      }
      const week = WeekIso.fromDate(firstEntry.workDate);
      if (!week.equals(input.isoWeek)) {
        throw new MismatchedWeek(t.id, isoWeekStr, week.toString());
      }
    }

    // Cumul minutes total pour vérifier seuil hebdo (LTr)
    const totalMinutes = eligible.reduce((sum, t) => sum + t.totalMinutes, 0);
    const ltrLimitMinutes = input.surchargeRules.overtimeThresholdMinutes + 9 * 60; // +9h marge sup avant blocker
    if (totalMinutes > ltrLimitMinutes) {
      throw new WeeklyLimitExceededInPayroll(input.worker.workerId, totalMinutes, ltrLimitMinutes);
    }

    const lines: PayrollLine[] = [];
    const minutesByKind: Record<PayrollSurchargeKind, number> = {
      normal: 0,
      night: 0,
      sunday: 0,
      holiday: 0,
      overtime: 0,
    };
    const holidaysApplied = new Map<string, { canton: string; date: string; label: string }>();

    let cumulMinutes = 0;
    for (const t of eligible) {
      const snap = t.toSnapshot();
      const client = input.clients.get(snap.clientId);
      if (!client) {
        throw new InvalidPayrollInput(`Client ${snap.clientId} absent du snapshot`);
      }
      const baseHourly = input.hourlyRatesRappenByClient.get(snap.clientId);
      if (baseHourly === undefined) {
        throw new InvalidPayrollInput(`Pas de taux horaire pour client ${snap.clientId}`);
      }

      // Pause répartie au prorata des minutes brutes par entry (simplification MVP)
      const totalBrutMinutes = snap.entries.reduce(
        (sum, e) => sum + Math.max(0, (e.actualEnd.getTime() - e.actualStart.getTime()) / 60_000),
        0,
      );
      // Pause uniformément déduite côté Timesheet.totalMinutes — on
      // recalcule par entry pour les segments. La pause est imputée
      // sur le segment "normal" en priorité (politique défensive : la
      // pause c'est du jour normal non rémunéré).

      for (const entry of snap.entries) {
        const segments = segmentEntry(entry, client.canton, input.holidays);

        // Logger les fériés rencontrés (audit context)
        for (const seg of segments) {
          if (seg.kinds.includes('holiday')) {
            const dateStr = isoDate(seg.fromUtc);
            const key = `${client.canton}:${dateStr}`;
            if (!holidaysApplied.has(key)) {
              holidaysApplied.set(key, {
                canton: client.canton,
                date: dateStr,
                label: 'férié appliqué',
              });
            }
          }
        }

        // Imputer la pause au prorata sur les segments "normal" en priorité
        const breakMinutesForEntry = entry.breakMinutes;
        const allocated = allocateBreakMinutes(segments, breakMinutesForEntry);

        for (const seg of allocated) {
          if (seg.minutes <= 0) continue;
          let kindsForLine: PayrollSurchargeKind[] = [...seg.kinds];

          // Heures sup : si cumul après ce segment dépasse le seuil → marquer overtime
          const cumulAfter = cumulMinutes + seg.minutes;
          if (cumulAfter > input.surchargeRules.overtimeThresholdMinutes) {
            // Découpe le segment : la partie qui dépasse → +overtime
            const overtimeMinutes = Math.min(
              seg.minutes,
              cumulAfter - input.surchargeRules.overtimeThresholdMinutes,
            );
            const normalMinutes = seg.minutes - overtimeMinutes;
            if (normalMinutes > 0) {
              const bp = combinedSurchargeBp(kindsForLine, input.surchargeRules);
              const total = computeLineTotalRappen({
                baseHourlyRappen: baseHourly,
                minutes: normalMinutes,
                surchargeBp: bp,
              });
              lines.push({
                date: isoDate(seg.fromUtc),
                minutes: normalMinutes,
                kinds: kindsForLine,
                baseHourlyRappen: baseHourly,
                surchargeBp: bp,
                totalRappen: total,
                sourceTimesheetId: t.id,
                sourceClientId: snap.clientId,
              });
              for (const k of kindsForLine) minutesByKind[k] += normalMinutes;
              if (kindsForLine.length === 0) minutesByKind.normal += normalMinutes;
              cumulMinutes += normalMinutes;
            }
            kindsForLine = [...kindsForLine, 'overtime'];
            const bpOt = combinedSurchargeBp(kindsForLine, input.surchargeRules);
            const totalOt = computeLineTotalRappen({
              baseHourlyRappen: baseHourly,
              minutes: overtimeMinutes,
              surchargeBp: bpOt,
            });
            lines.push({
              date: isoDate(seg.fromUtc),
              minutes: overtimeMinutes,
              kinds: kindsForLine,
              baseHourlyRappen: baseHourly,
              surchargeBp: bpOt,
              totalRappen: totalOt,
              sourceTimesheetId: t.id,
              sourceClientId: snap.clientId,
            });
            for (const k of kindsForLine) minutesByKind[k] += overtimeMinutes;
            cumulMinutes += overtimeMinutes;
          } else {
            const bp = combinedSurchargeBp(kindsForLine, input.surchargeRules);
            const total = computeLineTotalRappen({
              baseHourlyRappen: baseHourly,
              minutes: seg.minutes,
              surchargeBp: bp,
            });
            lines.push({
              date: isoDate(seg.fromUtc),
              minutes: seg.minutes,
              kinds: kindsForLine.length === 0 ? ['normal'] : kindsForLine,
              baseHourlyRappen: baseHourly,
              surchargeBp: bp,
              totalRappen: total,
              sourceTimesheetId: t.id,
              sourceClientId: snap.clientId,
            });
            const tracked = kindsForLine.length === 0 ? ['normal' as const] : kindsForLine;
            for (const k of tracked) minutesByKind[k] += seg.minutes;
            cumulMinutes += seg.minutes;
          }
        }
      }
      void totalBrutMinutes; // utilisé pour debugging futur
    }

    // Agrégats financiers
    let grossBase = 0n;
    let surcharges = 0n;
    for (const l of lines) {
      const baseOnly = computeLineTotalRappen({
        baseHourlyRappen: l.baseHourlyRappen,
        minutes: l.minutes,
        surchargeBp: 0,
      });
      grossBase += baseOnly;
      surcharges += l.totalRappen - baseOnly;
    }

    const computationContext: PayrollComputationContext = {
      engineVersion: PAYROLL_ENGINE_VERSION,
      computedAt: new Date().toISOString(),
      isoWeek: isoWeekStr,
      clientsSnapshot: [...input.clients.values()],
      hourlyRatesByClient: Object.fromEntries(
        [...input.hourlyRatesRappenByClient.entries()].map(([k, v]) => [k, v.toString()]),
      ),
      surchargeRules: input.surchargeRules,
      cantonHolidaysApplied: [...holidaysApplied.values()],
    };

    return {
      agencyId: input.agencyId,
      workerId: input.worker.workerId,
      isoWeek: isoWeekStr,
      lines,
      grossBaseRappen: grossBase,
      surchargesRappen: surcharges,
      grossTotalBeforeSocialRappen: grossBase + surcharges,
      totalMinutes: cumulMinutes,
      minutesByKind,
      computationContext,
    };
  }
}

interface RawSegment {
  readonly fromUtc: Date;
  readonly toUtc: Date;
  readonly minutes: number;
  readonly kinds: readonly PayrollSurchargeKind[];
}

/**
 * Découpe un entry en sous-segments aux frontières temporelles (23h, 06h,
 * minuit dim, minuit férié) et tag chaque segment avec ses catégories.
 */
function segmentEntry(
  entry: TimesheetEntry,
  canton: string,
  holidays: CantonHolidaysPort,
): readonly RawSegment[] {
  const start = entry.actualStart;
  const end = entry.actualEnd;
  if (end.getTime() <= start.getTime()) return [];

  // Génère toutes les frontières candidates dans [start, end]
  const boundaries = new Set<number>();
  boundaries.add(start.getTime());
  boundaries.add(end.getTime());
  // Pour chaque jour traversé, ajouter 00h00, 06h00, 23h00
  const cursor = new Date(start.getTime());
  cursor.setUTCHours(0, 0, 0, 0);
  while (cursor.getTime() < end.getTime()) {
    for (const h of [0, 6, 23]) {
      const d = new Date(cursor.getTime());
      d.setUTCHours(h, 0, 0, 0);
      const t = d.getTime();
      if (t >= start.getTime() && t <= end.getTime()) boundaries.add(t);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const sortedBoundaries = [...boundaries].sort((a, b) => a - b);
  const segments: RawSegment[] = [];
  for (let i = 0; i < sortedBoundaries.length - 1; i++) {
    const fromTs = sortedBoundaries[i];
    const toTs = sortedBoundaries[i + 1];
    if (fromTs === undefined || toTs === undefined || toTs <= fromTs) continue;
    const from = new Date(fromTs);
    const to = new Date(toTs);
    const minutes = Math.round((toTs - fromTs) / 60_000);
    if (minutes <= 0) continue;
    const kinds = classifySegment(from, to, canton, holidays);
    segments.push({ fromUtc: from, toUtc: to, minutes, kinds });
  }
  return segments;
}

function classifySegment(
  from: Date,
  to: Date,
  canton: string,
  holidays: CantonHolidaysPort,
): readonly PayrollSurchargeKind[] {
  const kinds: PayrollSurchargeKind[] = [];
  // Considère le milieu du segment pour classification (homogène par construction)
  const mid = new Date((from.getTime() + to.getTime()) / 2);
  const hour = mid.getUTCHours();
  const day = mid.getUTCDay(); // 0 = dim
  if (hour >= 23 || hour < 6) kinds.push('night');
  if (day === 0) kinds.push('sunday');
  if (holidays.isHoliday(canton, mid)) kinds.push('holiday');
  return kinds;
}

/**
 * Impute les minutes de pause d'abord sur les segments `normal` (kinds vide
 * ou ['normal']), puis sur 'night', puis 'sunday'/'holiday'. Politique
 * défensive : la pause n'est pas du temps payé.
 */
function allocateBreakMinutes(segments: readonly RawSegment[], breakMinutes: number): RawSegment[] {
  if (breakMinutes <= 0) return [...segments];
  const remaining = { value: breakMinutes };
  // Priorité : segments avec kinds vide en premier (= normal),
  // puis night, puis sunday, puis holiday.
  const priority = (s: RawSegment): number => {
    if (s.kinds.length === 0) return 0;
    if (s.kinds.includes('night') && !s.kinds.includes('sunday') && !s.kinds.includes('holiday')) {
      return 1;
    }
    if (s.kinds.includes('sunday') && !s.kinds.includes('holiday')) return 2;
    return 3;
  };
  const indexed = segments.map((s, i) => ({ s, i }));
  indexed.sort((a, b) => priority(a.s) - priority(b.s));
  const adjusted = new Map<number, number>(); // index → new minutes
  for (const { s, i } of indexed) {
    if (remaining.value <= 0) break;
    const take = Math.min(s.minutes, remaining.value);
    adjusted.set(i, s.minutes - take);
    remaining.value -= take;
  }
  return segments.map((s, i) => {
    const newMinutes = adjusted.get(i);
    if (newMinutes === undefined) return s;
    return { ...s, minutes: newMinutes };
  });
}

function isoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${String(y)}-${m}-${dd}`;
}
