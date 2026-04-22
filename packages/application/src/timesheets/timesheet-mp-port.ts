import type { Result } from '@interim/shared';

/**
 * Port outbound pour notifier MovePlanner de la décision agence sur
 * un timesheet (sign / dispute). Adapter HTTP en A2.4 :
 * `apps/api/src/infrastructure/moveplanner/adapters/timesheet.adapter.ts`.
 *
 * MP endpoints (cf. docs/02-partners-specification.md §7.2) :
 *   POST /api/v1/partners/:partnerId/timesheets/:timesheetId/sign
 *   POST /api/v1/partners/:partnerId/timesheets/:timesheetId/dispute
 *
 * Idempotency : header `Idempotency-Key` requis (UUID v4 dérivé du
 * timesheetId interne, voir `idempotencyFromTimesheetId`).
 *
 * Tolérance : 200 = succès, 409 = déjà signé/disputé côté MP (idempotent
 * succès), 5xx = transient (rejeu BullMQ), 4xx hors 409 = permanent.
 */

export type TimesheetMpErrorKind = 'transient' | 'permanent';

export class TimesheetMpError extends Error {
  constructor(
    public readonly kind: TimesheetMpErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'TimesheetMpError';
  }
}

export interface TimesheetMpPort {
  /**
   * Notifie MP que l'agence a signé le timesheet. `approvedBy` est
   * l'userId agence (audit MP). `notes` optionnel.
   */
  notifySigned(input: {
    readonly externalTimesheetId: string;
    readonly idempotencyKey: string;
    readonly approvedBy: string;
    readonly approvedAt: Date;
    readonly notes?: string;
  }): Promise<Result<{ readonly signed: true; readonly signedAt: Date }, TimesheetMpError>>;

  /**
   * Notifie MP que l'agence conteste le timesheet. `reason` obligatoire
   * (texte libre 10-500 chars).
   */
  notifyDisputed(input: {
    readonly externalTimesheetId: string;
    readonly idempotencyKey: string;
    readonly disputedBy: string;
    readonly disputedAt: Date;
    readonly reason: string;
  }): Promise<Result<{ readonly disputed: true }, TimesheetMpError>>;
}

/**
 * Idempotency key déterministe pour push MP. Évite les doublons côté
 * MP si on rejoue (BullMQ retry, double-click UI, etc.). On préfixe
 * par `sign` ou `dispute` pour permettre les 2 actions (rare mais
 * possible) avec deux clés distinctes.
 */
export function idempotencyFromTimesheetId(
  action: 'sign' | 'dispute',
  timesheetId: string,
): string {
  return `ts-${action}-${timesheetId}`;
}
