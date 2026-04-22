import { asTimesheetId, type AgencyId, type TimesheetRepository } from '@interim/domain';
import type { Clock, Result } from '@interim/shared';
import { idempotencyFromTimesheetId, type TimesheetMpPort } from './timesheet-mp-port.js';

/**
 * Use case : agence conteste un timesheet et notifie MP avec motif.
 *
 * Validations :
 *   - `reason` 10-500 chars (validation 422 côté controller).
 *   - Refuse si état terminal (signed, disputed, tacit) — sauf dispute
 *     déjà fait (idempotent succès).
 *
 * Flux MP/domain identique à `SignTimesheetUseCase` : push MP avant
 * commit domain, idempotency déterministe, transient = no commit.
 */

export type DisputeTimesheetErrorKind =
  | 'timesheet_not_found'
  | 'timesheet_wrong_state'
  | 'invalid_reason'
  | 'mp_transient'
  | 'mp_permanent';

export class DisputeTimesheetError extends Error {
  constructor(
    public readonly kind: DisputeTimesheetErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'DisputeTimesheetError';
  }
}

export interface DisputeTimesheetInput {
  readonly agencyId: AgencyId;
  readonly timesheetId: string;
  readonly reviewerUserId: string;
  readonly reason: string;
}

export interface DisputeTimesheetOutput {
  readonly timesheetId: string;
  readonly state: 'disputed';
  readonly disputedAt: Date;
  readonly alreadyExisted: boolean;
}

const REASON_MIN = 10;
const REASON_MAX = 500;

export class DisputeTimesheetUseCase {
  constructor(
    private readonly repo: TimesheetRepository,
    private readonly mp: TimesheetMpPort,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: DisputeTimesheetInput,
  ): Promise<Result<DisputeTimesheetOutput, DisputeTimesheetError>> {
    const trimmed = input.reason.trim();
    if (trimmed.length < REASON_MIN || trimmed.length > REASON_MAX) {
      return failure(
        'invalid_reason',
        `Motif requis (${String(REASON_MIN)}-${String(REASON_MAX)} chars)`,
      );
    }

    const ts = await this.repo.findById(input.agencyId, asTimesheetId(input.timesheetId));
    if (!ts) {
      return failure('timesheet_not_found', `Timesheet ${input.timesheetId} introuvable`);
    }

    if (ts.currentState === 'disputed') {
      const snap = ts.toSnapshot();
      return {
        ok: true,
        value: {
          timesheetId: ts.id,
          state: 'disputed',
          disputedAt: snap.stateChangedAt,
          alreadyExisted: true,
        },
      };
    }

    if (ts.currentState === 'signed' || ts.currentState === 'tacit') {
      return failure(
        'timesheet_wrong_state',
        `Impossible de contester un timesheet en état ${ts.currentState}`,
      );
    }

    const externalId = ts.toSnapshot().externalTimesheetId;
    const idempotencyKey = idempotencyFromTimesheetId('dispute', ts.id);
    const now = this.clock.now();

    const mpResult = await this.mp.notifyDisputed({
      externalTimesheetId: externalId,
      idempotencyKey,
      disputedBy: input.reviewerUserId,
      disputedAt: now,
      reason: trimmed,
    });

    if (!mpResult.ok) {
      const kind: DisputeTimesheetErrorKind =
        mpResult.error.kind === 'transient' ? 'mp_transient' : 'mp_permanent';
      return failure(kind, `Push MP échoué: ${mpResult.error.message}`);
    }

    ts.dispute(input.reviewerUserId, this.clock);
    await this.repo.save(ts);

    return {
      ok: true,
      value: {
        timesheetId: ts.id,
        state: 'disputed',
        disputedAt: now,
        alreadyExisted: false,
      },
    };
  }
}

function failure(
  kind: DisputeTimesheetErrorKind,
  message: string,
): { readonly ok: false; readonly error: DisputeTimesheetError } {
  return { ok: false, error: new DisputeTimesheetError(kind, message) };
}
