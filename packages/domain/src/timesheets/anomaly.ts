/**
 * Anomalies détectées à l'import d'un timesheet (LTr + CCT).
 *
 * - `missing_break`              : pause < 30 min sur journée > 7h (LTr art. 15)
 * - `weekly_limit_exceeded`      : cumul semaine > 50h (LTr art. 9 al. 1, bâtiment)
 * - `daily_rest_insufficient`    : < 11h de repos entre 2 journées (LTr art. 15a)
 * - `planned_actual_divergence`  : écart |actual - planned| > 30 min → controle manuel
 * - `night_work_undeclared`      : heures 23h-06h sans majoration explicite (LTr art. 17b)
 * - `sunday_work_undeclared`     : heures dimanche sans majoration 50% (LTr art. 19)
 * - `hourly_rate_below_cct`      : taux horaire sous CCT (A4.1 déjà géré côté
 *                                  contrat, mais re-checké ici si writer MP l'a modifié)
 *
 * Chaque anomalie ne bloque PAS l'import (le timesheet est créé), mais
 * lève `state=under_review` si au moins une anomalie est présente →
 * dispatcher doit revoir.
 */
export const TIMESHEET_ANOMALY_KINDS = [
  'missing_break',
  'weekly_limit_exceeded',
  'daily_rest_insufficient',
  'planned_actual_divergence',
  'night_work_undeclared',
  'sunday_work_undeclared',
  'hourly_rate_below_cct',
] as const;
export type TimesheetAnomalyKind = (typeof TIMESHEET_ANOMALY_KINDS)[number];

export interface TimesheetAnomaly {
  readonly kind: TimesheetAnomalyKind;
  /** Message FR lisible par le dispatcher. */
  readonly message: string;
  /** Données contextuelles (ex. `{ cumulMinutes: 3060 }` = 51h). */
  readonly context: Readonly<Record<string, string | number>>;
  /** Sévérité : `warning` (log + dashboard) ou `blocker` (refuser signature). */
  readonly severity: 'warning' | 'blocker';
}

/**
 * Seuils LTr normalisés (minutes). Surchargés côté use case via options
 * CCT-specifiques (ex. bâtiment 50h, logistique 45h).
 */
export const DEFAULT_THRESHOLDS = {
  /** Minutes de pause minimum si journée > 7h. */
  minBreakIfLongDayMinutes: 30,
  /** Longueur journée déclenchant l'obligation de pause. */
  longDayMinutes: 7 * 60,
  /** Cumul hebdo max (LTr bâtiment). */
  maxWeeklyMinutes: 50 * 60,
  /** Repos minimum entre 2 journées (minutes). */
  minDailyRestMinutes: 11 * 60,
  /** Écart max planifié/réel avant review. */
  maxPlannedActualDivergenceMinutes: 30,
  /** Heures considérées "nuit" (exclusivité stricte : start ≥ 23h ou end ≤ 06h). */
  nightStartHour: 23,
  nightEndHour: 6,
} as const;

export type TimesheetThresholds = Readonly<typeof DEFAULT_THRESHOLDS>;
