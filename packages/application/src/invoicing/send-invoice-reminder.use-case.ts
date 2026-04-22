import { randomUUID } from 'node:crypto';
import {
  asInvoiceId,
  computeReminderDecision,
  type AgencyId,
  type InvoiceRepository,
  type InvoiceReminderRecord,
  type InvoiceReminderRepository,
  type ReminderLevel,
} from '@interim/domain';
import type { Clock, Result } from '@interim/shared';

/**
 * Use case : envoie la relance appropriée pour une facture donnée.
 *
 * Flux :
 *   1. Charge la facture (multi-tenant scope).
 *   2. Charge les relances déjà envoyées.
 *   3. Calcule la décision via `computeReminderDecision` (pure domain).
 *   4. Si action=send :
 *      - Envoie l'email via `EmailReminderSender`
 *      - Notifie les rôles supplémentaires si applicable (commercial/direction)
 *      - Enregistre `InvoiceReminderRecord` (append-only audit)
 *   5. Si action=skip → renvoie skip reason (le caller loggue mais ne
 *      traite pas comme erreur).
 *
 * Idempotent : le calcul repose sur `alreadySent` → un appel concurrent
 * sur la même facture ne renverra pas 2 relances du même niveau
 * (assuming le repo insert est atomique par (invoiceId, level) — unique
 * constraint DB).
 */

export type SendInvoiceReminderErrorKind =
  | 'invoice_not_found'
  | 'email_failed'
  | 'persistence_failed';

export class SendInvoiceReminderError extends Error {
  constructor(
    public readonly kind: SendInvoiceReminderErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'SendInvoiceReminderError';
  }
}

export interface EmailReminderSender {
  send(input: {
    readonly agencyId: string;
    readonly invoiceId: string;
    readonly invoiceNumber: string;
    readonly level: ReminderLevel;
    readonly daysOverdue: number;
    readonly recipientEmail: string;
    readonly totalTtcRappen: bigint;
  }): Promise<{ readonly messageId: string }>;
}

export interface RoleNotifier {
  /** Notifie les rôles internes (commercial, direction) via canal dédié. */
  notifyRoles(input: {
    readonly agencyId: string;
    readonly invoiceId: string;
    readonly level: ReminderLevel;
    readonly roles: readonly string[];
  }): Promise<void>;
}

export interface SendInvoiceReminderInput {
  readonly agencyId: AgencyId;
  readonly invoiceId: string;
  readonly recipientEmail: string;
  readonly idFactory?: () => string;
}

export type SendInvoiceReminderOutput =
  | { readonly action: 'sent'; readonly level: ReminderLevel; readonly daysOverdue: number }
  | { readonly action: 'skip'; readonly reason: string };

export class SendInvoiceReminderUseCase {
  constructor(
    private readonly invoices: InvoiceRepository,
    private readonly reminders: InvoiceReminderRepository,
    private readonly email: EmailReminderSender,
    private readonly roleNotifier: RoleNotifier,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: SendInvoiceReminderInput,
  ): Promise<Result<SendInvoiceReminderOutput, SendInvoiceReminderError>> {
    const invoice = await this.invoices.findById(input.agencyId, asInvoiceId(input.invoiceId));
    if (!invoice) return failure('invoice_not_found', input.invoiceId);

    const now = this.clock.now();
    const existing = await this.reminders.findByInvoice(input.agencyId, invoice.id);
    const alreadySent = new Set(existing.map((r) => r.level));

    const decision = computeReminderDecision({ invoice, now, alreadySent });
    if (decision.action === 'skip') {
      return { ok: true, value: { action: 'skip', reason: decision.reason } };
    }

    const roles = rolesForLevel(decision.level);
    try {
      await this.email.send({
        agencyId: input.agencyId,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        level: decision.level,
        daysOverdue: decision.daysOverdue,
        recipientEmail: input.recipientEmail,
        totalTtcRappen: invoice.totalTtcRappen,
      });
    } catch (err) {
      return failure('email_failed', err instanceof Error ? err.message : 'unknown_email_error');
    }

    if (roles.length > 0) {
      try {
        await this.roleNotifier.notifyRoles({
          agencyId: input.agencyId,
          invoiceId: invoice.id,
          level: decision.level,
          roles,
        });
      } catch (err) {
        // Notification interne non-bloquante : log mais continue (email déjà parti)
        console.warn(
          `[reminder] notifyRoles failed for ${invoice.id} level=${decision.level}: ${err instanceof Error ? err.message : 'unknown'}`,
        );
      }
    }

    const record: InvoiceReminderRecord = {
      id: (input.idFactory ?? randomUUID)(),
      agencyId: input.agencyId,
      invoiceId: invoice.id,
      level: decision.level,
      sentAt: now,
      notifiedRoles: roles,
      metadata: {
        daysOverdue: String(decision.daysOverdue),
        recipientEmail: input.recipientEmail,
      },
    };
    try {
      await this.reminders.insert(record);
    } catch (err) {
      return failure(
        'persistence_failed',
        err instanceof Error ? err.message : 'unknown_persistence_error',
      );
    }

    return {
      ok: true,
      value: { action: 'sent', level: decision.level, daysOverdue: decision.daysOverdue },
    };
  }
}

/** Rôles internes à notifier en plus du client, selon le niveau. */
function rolesForLevel(level: ReminderLevel): readonly string[] {
  switch (level) {
    case 'l1_amicale':
      return ['commercial'];
    case 'l2_ferme':
      return ['commercial', 'direction'];
    case 'l3_mise_en_demeure':
      return ['direction'];
    case 'l4_contentieux':
      return ['direction', 'juridique'];
  }
}

function failure(
  kind: SendInvoiceReminderErrorKind,
  message: string,
): { readonly ok: false; readonly error: SendInvoiceReminderError } {
  return { ok: false, error: new SendInvoiceReminderError(kind, message) };
}
