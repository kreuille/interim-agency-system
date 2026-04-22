import { asTimesheetId, type AgencyId, type TimesheetRepository } from '@interim/domain';
import type { Clock, Result } from '@interim/shared';
import { idempotencyFromTimesheetId, type TimesheetMpPort } from './timesheet-mp-port.js';

/**
 * Use case : agence signe un timesheet et notifie MP.
 *
 * Flux :
 *   1. Charge timesheet (must exist, multi-tenant scope).
 *   2. Refuse si état terminal (signed, disputed, tacit) — sauf si
 *      `state=signed` déjà → renvoie `alreadyExisted=true` (idempotent).
 *   3. Refuse si anomalie blocker (Timesheet.sign throw, gérée ici).
 *   4. Push MP via `TimesheetMpPort.notifySigned` avec idempotencyKey
 *      déterministe.
 *   5. Sur succès : marque domain `signed`, save.
 *   6. Sur transient error MP : NE PAS sauvegarder l'état signé →
 *      renvoie erreur, le caller (job BullMQ) rejouera.
 *   7. Sur permanent error MP : log + retourne erreur permanent (alerte
 *      ops, état domain inchangé).
 *
 * Note : la signature électronique du dispatcher (e-signature ZertES
 * pour signer le timesheet PDF) est OUT OF SCOPE ici (DETTE-055).
 */

export type SignTimesheetErrorKind =
  | 'timesheet_not_found'
  | 'timesheet_wrong_state'
  | 'has_blocker_anomaly'
  | 'mp_transient'
  | 'mp_permanent';

export class SignTimesheetError extends Error {
  constructor(
    public readonly kind: SignTimesheetErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'SignTimesheetError';
  }
}

export interface SignTimesheetInput {
  readonly agencyId: AgencyId;
  readonly timesheetId: string;
  readonly reviewerUserId: string;
  readonly notes?: string;
}

export interface SignTimesheetOutput {
  readonly timesheetId: string;
  readonly state: 'signed';
  readonly signedAt: Date;
  readonly alreadyExisted: boolean;
}

export class SignTimesheetUseCase {
  constructor(
    private readonly repo: TimesheetRepository,
    private readonly mp: TimesheetMpPort,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: SignTimesheetInput,
  ): Promise<Result<SignTimesheetOutput, SignTimesheetError>> {
    const ts = await this.repo.findById(input.agencyId, asTimesheetId(input.timesheetId));
    if (!ts) {
      return failure('timesheet_not_found', `Timesheet ${input.timesheetId} introuvable`);
    }

    // Idempotent : déjà signé → succès no-op.
    if (ts.currentState === 'signed') {
      const snap = ts.toSnapshot();
      return {
        ok: true,
        value: {
          timesheetId: ts.id,
          state: 'signed',
          signedAt: snap.stateChangedAt,
          alreadyExisted: true,
        },
      };
    }

    if (ts.currentState === 'disputed' || ts.currentState === 'tacit') {
      return failure(
        'timesheet_wrong_state',
        `Impossible de signer un timesheet en état ${ts.currentState}`,
      );
    }

    if (ts.anomalies.some((a) => a.severity === 'blocker')) {
      return failure(
        'has_blocker_anomaly',
        'Timesheet contient des anomalies bloquantes (LTr/CCT)',
      );
    }

    const externalId = ts.toSnapshot().externalTimesheetId;
    const idempotencyKey = idempotencyFromTimesheetId('sign', ts.id);
    const now = this.clock.now();

    const mpResult = await this.mp.notifySigned({
      externalTimesheetId: externalId,
      idempotencyKey,
      approvedBy: input.reviewerUserId,
      approvedAt: now,
      ...(input.notes ? { notes: input.notes } : {}),
    });

    if (!mpResult.ok) {
      const kind: SignTimesheetErrorKind =
        mpResult.error.kind === 'transient' ? 'mp_transient' : 'mp_permanent';
      return failure(kind, `Push MP échoué: ${mpResult.error.message}`);
    }

    // Push MP OK → on commit côté domain.
    try {
      ts.sign(input.reviewerUserId, this.clock);
    } catch (err) {
      // Race rare : anomalie ajoutée entre les deux checks. Domain refuse.
      return failure(
        'has_blocker_anomaly',
        err instanceof Error ? err.message : 'unknown_domain_error',
      );
    }
    await this.repo.save(ts);

    return {
      ok: true,
      value: {
        timesheetId: ts.id,
        state: 'signed',
        signedAt: now,
        alreadyExisted: false,
      },
    };
  }
}

function failure(
  kind: SignTimesheetErrorKind,
  message: string,
): { readonly ok: false; readonly error: SignTimesheetError } {
  return { ok: false, error: new SignTimesheetError(kind, message) };
}
