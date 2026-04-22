import { randomUUID } from 'node:crypto';
import {
  asTimesheetId,
  detectTimesheetAnomalies,
  Timesheet,
  type AgencyId,
  type ClientId,
  type MissionContractId,
  type StaffId,
  type TimesheetEntry,
  type TimesheetRepository,
  type TimesheetThresholds,
} from '@interim/domain';
import type { Clock, Result } from '@interim/shared';

/**
 * Use case d'enregistrement d'un timesheet reçu via webhook MP
 * (event-types : `timesheet.draft`, `timesheet.ready_for_signature`,
 * `timesheet.tacitly_validated`).
 *
 * Comportement :
 *   - Idempotent sur `externalTimesheetId` : 2e webhook même ID =
 *     no-op (renvoie le timesheet existant).
 *   - Anomalies LTr/CCT calculées via `detectTimesheetAnomalies`
 *     avec cumul hebdo lookup (autres timesheets même worker même
 *     semaine ISO).
 *   - État initial selon eventType :
 *     - `timesheet.tacitly_validated` → `tacit` directement
 *     - autres → `received` ou `under_review` (via Timesheet.create)
 *
 * Le caller (handler webhook) est responsable de mapper le payload MP
 * brut vers `RecordInboundTimesheetInput` (pré-validation Zod).
 */

export type RecordInboundTimesheetErrorKind = 'invalid_payload' | 'create_failed';

export class RecordInboundTimesheetError extends Error {
  constructor(
    public readonly kind: RecordInboundTimesheetErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'RecordInboundTimesheetError';
  }
}

export type InboundTimesheetEventType =
  | 'timesheet.draft'
  | 'timesheet.ready_for_signature'
  | 'timesheet.tacitly_validated';

export interface RecordInboundTimesheetInput {
  readonly agencyId: AgencyId;
  readonly externalTimesheetId: string;
  readonly workerId: StaffId;
  readonly clientId: ClientId;
  readonly missionContractId?: MissionContractId;
  readonly entries: readonly TimesheetEntry[];
  readonly hourlyRateRappen: number;
  readonly cctMinimumRateRappen?: number;
  readonly eventType: InboundTimesheetEventType;
  readonly thresholds?: TimesheetThresholds;
  readonly idFactory?: () => string;
}

export interface RecordInboundTimesheetOutput {
  readonly timesheetId: string;
  readonly state: string;
  readonly anomaliesCount: number;
  readonly alreadyExisted: boolean;
}

export class RecordInboundTimesheetUseCase {
  constructor(
    private readonly repo: TimesheetRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: RecordInboundTimesheetInput,
  ): Promise<Result<RecordInboundTimesheetOutput, RecordInboundTimesheetError>> {
    if (input.entries.length === 0) {
      return failure('invalid_payload', 'entries vide');
    }

    // Idempotency : externalTimesheetId déjà connu → renvoie l'existant.
    const existing = await this.repo.findByExternalId(input.agencyId, input.externalTimesheetId);
    if (existing) {
      const s = existing.toSnapshot();
      return {
        ok: true,
        value: {
          timesheetId: existing.id,
          state: s.state,
          anomaliesCount: s.anomalies.length,
          alreadyExisted: true,
        },
      };
    }

    // Cumul prior week : look up other timesheets pour le même worker
    // sur la même semaine ISO (basé sur le 1er entry).
    const firstEntry = input.entries[0];
    if (!firstEntry) return failure('invalid_payload', 'entries[0] missing');
    const { weekStart, weekEnd } = isoWeekRange(firstEntry.workDate);
    const weekTimesheets = await this.repo.findByWorkerInRange(
      input.agencyId,
      input.workerId,
      weekStart,
      weekEnd,
    );
    const cumulPriorWeekMinutes = weekTimesheets.reduce((sum, t) => sum + t.totalMinutes, 0);

    const anomalies = detectTimesheetAnomalies({
      entries: input.entries,
      hourlyRateRappen: input.hourlyRateRappen,
      ...(input.cctMinimumRateRappen !== undefined
        ? { cctMinimumRateRappen: input.cctMinimumRateRappen }
        : {}),
      cumulPriorWeekMinutes,
      ...(input.thresholds ? { thresholds: input.thresholds } : {}),
    });

    const id = (input.idFactory ?? randomUUID)();
    let timesheet: Timesheet;
    try {
      timesheet = Timesheet.create({
        id: asTimesheetId(id),
        agencyId: input.agencyId,
        externalTimesheetId: input.externalTimesheetId,
        workerId: input.workerId,
        clientId: input.clientId,
        ...(input.missionContractId ? { missionContractId: input.missionContractId } : {}),
        entries: input.entries,
        hourlyRateRappen: input.hourlyRateRappen,
        anomalies,
        receivedAt: this.clock.now(),
      });
    } catch (err) {
      return failure('create_failed', err instanceof Error ? err.message : 'unknown');
    }

    // Si event = tacitly_validated, on bascule directement en tacit.
    if (input.eventType === 'timesheet.tacitly_validated') {
      timesheet.markTacit(this.clock);
    }

    await this.repo.save(timesheet);

    return {
      ok: true,
      value: {
        timesheetId: timesheet.id,
        state: timesheet.toSnapshot().state,
        anomaliesCount: anomalies.length,
        alreadyExisted: false,
      },
    };
  }
}

function failure(
  kind: RecordInboundTimesheetErrorKind,
  message: string,
): { readonly ok: false; readonly error: RecordInboundTimesheetError } {
  return { ok: false, error: new RecordInboundTimesheetError(kind, message) };
}

/**
 * Renvoie le lundi 00:00 UTC et le dimanche 23:59:59 UTC de la semaine
 * ISO contenant `date`. Utilisé pour bornes du cumul hebdo.
 */
function isoWeekRange(date: Date): { weekStart: Date; weekEnd: Date } {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0),
  );
  const dayOfWeek = (d.getUTCDay() + 6) % 7; // monday = 0
  const monday = new Date(d.getTime() - dayOfWeek * 86400_000);
  const sunday = new Date(monday.getTime() + 6 * 86400_000 + 86399_999);
  return { weekStart: monday, weekEnd: sunday };
}
