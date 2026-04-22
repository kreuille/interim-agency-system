import type { AgencyId } from '../shared/ids.js';
import type { ClientId } from '../clients/client.js';
import type { Invoice, InvoiceId, InvoiceState } from './invoice.js';

/**
 * Port repository pour `Invoice`. Multi-tenant strict (CLAUDE.md §3.5).
 *
 * Méthode critique : `nextSequentialNumber(agencyId, year)` doit être
 * atomique (pas de duplicate possible entre 2 requêtes concurrentes).
 * Implémentation Prisma : table `invoice_counters` avec lock pessimiste
 * ou `SELECT ... FOR UPDATE` + `INSERT ... ON CONFLICT` selon transaction.
 */
export interface InvoiceRepository {
  save(invoice: Invoice): Promise<void>;
  findById(agencyId: AgencyId, id: InvoiceId): Promise<Invoice | undefined>;
  findByInvoiceNumber(agencyId: AgencyId, invoiceNumber: string): Promise<Invoice | undefined>;
  findByClient(
    agencyId: AgencyId,
    clientId: ClientId,
    opts?: { readonly state?: InvoiceState; readonly limit?: number },
  ): Promise<readonly Invoice[]>;
  /**
   * Incrémente et renvoie le prochain numéro séquentiel pour cette
   * agence et cette année. Atomique (lock base).
   */
  nextSequentialNumber(agencyId: AgencyId, year: number): Promise<number>;
}
