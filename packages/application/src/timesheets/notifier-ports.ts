import type { TimesheetAnomaly } from '@interim/domain';

/**
 * Ports de notification dispatcher quand un timesheet contient des
 * anomalies bloquantes (closes DETTE-052).
 *
 * Implementations cibles :
 *   - `EmailNotifier` : SendGrid / Postmark / Infomaniak Mail (européen).
 *   - `DashboardNotifier` : push WebSocket / SSE vers le dashboard
 *     dispatcher pour notification temps réel.
 *
 * En tests / dev : `InMemoryEmailNotifier` + `InMemoryDashboardNotifier`
 * (cf. `test-helpers.ts`).
 */

export interface TimesheetAnomalyNotification {
  readonly agencyId: string;
  readonly timesheetId: string;
  readonly externalTimesheetId: string;
  readonly workerName: string;
  readonly clientName: string;
  readonly anomalies: readonly TimesheetAnomaly[];
  readonly receivedAt: Date;
}

/**
 * Notifie par email les dispatchers d'une anomalie blocker. Idempotent
 * sur `(agencyId, timesheetId)` côté implémentation (pas de spam si
 * webhook rejoué).
 */
export interface EmailNotifier {
  notifyTimesheetAnomalies(input: TimesheetAnomalyNotification): Promise<void>;
}

/**
 * Push une notification temps réel au dashboard agence (SSE / WS).
 * En dev/test, juste collecte en mémoire pour assertions.
 */
export interface DashboardNotifier {
  pushTimesheetAlert(input: TimesheetAnomalyNotification): Promise<void>;
}
