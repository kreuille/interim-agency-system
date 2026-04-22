import type { AgencyId } from '../shared/ids.js';
import type { InvoiceId } from './invoice.js';
import type { ReminderLevel } from './reminder-policy.js';

/**
 * Entrée append-only dans `invoice_reminders` : enregistre chaque
 * relance envoyée pour une facture. Permet :
 *   - L'idempotence (ne pas renvoyer le même niveau 2 fois)
 *   - L'audit DPO / compliance (trace envois, notifications commerciales)
 *   - Le dashboard direction (historique par client)
 *
 * Table Prisma `invoice_reminders(id, agency_id, invoice_id, level,
 * sent_at, notified_roles[], metadata_json)`.
 */
export interface InvoiceReminderRecord {
  readonly id: string;
  readonly agencyId: AgencyId;
  readonly invoiceId: InvoiceId;
  readonly level: ReminderLevel;
  readonly sentAt: Date;
  /** Rôles notifiés en plus du client : ['commercial'], ['direction']… */
  readonly notifiedRoles: readonly string[];
  /** Métadonnées libres : emailMessageId, recipientEmail, days overdue… */
  readonly metadata: Readonly<Record<string, string>>;
}

export interface InvoiceReminderRepository {
  insert(record: InvoiceReminderRecord): Promise<void>;
  findByInvoice(
    agencyId: AgencyId,
    invoiceId: InvoiceId,
  ): Promise<readonly InvoiceReminderRecord[]>;
  /**
   * Pour le job de scan quotidien : liste des factures emitted avec
   * dueDate < now (potentiellement en retard). L'application filtre
   * ensuite via `computeReminderDecision`.
   */
  findPotentiallyOverdueInvoices(
    agencyId: AgencyId,
    now: Date,
    opts?: { readonly limit?: number },
  ): Promise<readonly InvoiceId[]>;
}
