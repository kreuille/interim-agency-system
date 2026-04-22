import { asAgencyId, type TimesheetRepository } from '@interim/domain';
import type {
  InboundWebhookContext,
  InboundWebhookHandler,
} from '../webhooks/webhook-event-dispatcher.js';

/**
 * Handler webhook MP `timesheet.signed_by_partner` — MP confirme que
 * la signature a été enregistrée côté plateforme (post-`SignTimesheetUseCase`).
 *
 * En pratique : agency a déjà signé localement (state=signed), MP nous
 * renvoie l'event en confirmation. Ce handler vérifie la cohérence et
 * log un audit, sans changer l'état (déjà signed). Si le timesheet
 * n'est pas en state=signed (race / désync), log warning.
 *
 * Idempotent : rejouer = no-op (lit state, pas d'écriture sauf premier
 * cas de "réconciliation" si MP confirme un signed sur un état différent).
 *
 * Le caller (inbound webhook controller) résout déjà multi-tenant via
 * URL ou payload.agencyId.
 */

export class InvalidConfirmationPayload extends Error {
  constructor(reason: string) {
    super(`Invalid timesheet confirmation payload: ${reason}`);
    this.name = 'InvalidConfirmationPayload';
  }
}

export interface TimesheetConfirmationHandlerDeps {
  readonly repo: TimesheetRepository;
  readonly agencyIdOverride?: string;
  /** Logger optionnel — défaut: console.warn pour les écarts. */
  readonly onMismatch?: (info: {
    readonly externalTimesheetId: string;
    readonly observedState: string;
    readonly expectedState: 'signed';
  }) => void;
}

interface MpConfirmationPayload {
  readonly agencyId?: string;
  readonly timesheetId: string;
  readonly signedAt: string;
  readonly signedBy?: string;
}

export class TimesheetConfirmationHandler implements InboundWebhookHandler {
  constructor(private readonly deps: TimesheetConfirmationHandlerDeps) {}

  async handle(ctx: InboundWebhookContext): Promise<void> {
    if (ctx.eventType !== 'timesheet.signed_by_partner') {
      throw new InvalidConfirmationPayload(`event-type non géré: ${ctx.eventType}`);
    }
    const payload = parsePayload(ctx.payload);
    const agencyIdRaw = this.deps.agencyIdOverride ?? payload.agencyId;
    if (!agencyIdRaw) {
      throw new InvalidConfirmationPayload('agencyId requis');
    }
    const agencyId = asAgencyId(agencyIdRaw);

    const ts = await this.deps.repo.findByExternalId(agencyId, payload.timesheetId);
    if (!ts) {
      // Timesheet inconnu : MP a poussé sans nous l'avoir notifié au
      // préalable. Skip silencieusement (l'inbound handler créera plus
      // tard sur réception du timesheet.draft).
      return;
    }

    if (ts.currentState !== 'signed') {
      const onMismatch = this.deps.onMismatch ?? defaultOnMismatch;
      onMismatch({
        externalTimesheetId: payload.timesheetId,
        observedState: ts.currentState,
        expectedState: 'signed',
      });
    }
    // No-op si state=signed (idempotent), mismatch logué sinon.
  }
}

function parsePayload(raw: unknown): MpConfirmationPayload {
  if (!raw || typeof raw !== 'object') {
    throw new InvalidConfirmationPayload('payload doit être un objet');
  }
  const p = raw as Record<string, unknown>;
  if (typeof p.timesheetId !== 'string') {
    throw new InvalidConfirmationPayload('timesheetId manquant');
  }
  if (typeof p.signedAt !== 'string') {
    throw new InvalidConfirmationPayload('signedAt manquant');
  }
  return p as unknown as MpConfirmationPayload;
}

function defaultOnMismatch(info: {
  readonly externalTimesheetId: string;
  readonly observedState: string;
  readonly expectedState: 'signed';
}): void {
  console.warn(
    `[timesheet-confirmation] Mismatch externalId=${info.externalTimesheetId} observed=${info.observedState} expected=${info.expectedState}`,
  );
}
