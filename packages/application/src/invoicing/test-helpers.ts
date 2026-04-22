import type {
  AgencyId,
  ClientId,
  Invoice,
  InvoiceId,
  InvoiceRepository,
  InvoiceState,
} from '@interim/domain';

/**
 * Repository in-memory pour tests. Séquentiel atomique via counter.
 */
export class InMemoryInvoiceRepository implements InvoiceRepository {
  private readonly byId = new Map<string, Invoice>();
  private readonly counters = new Map<string, number>();

  save(invoice: Invoice): Promise<void> {
    this.byId.set(invoice.id, invoice);
    return Promise.resolve();
  }

  findById(agencyId: AgencyId, id: InvoiceId): Promise<Invoice | undefined> {
    const inv = this.byId.get(id);
    if (inv?.agencyId !== agencyId) return Promise.resolve(undefined);
    return Promise.resolve(inv);
  }

  findByInvoiceNumber(agencyId: AgencyId, invoiceNumber: string): Promise<Invoice | undefined> {
    for (const inv of this.byId.values()) {
      if (inv.agencyId === agencyId && inv.invoiceNumber === invoiceNumber) {
        return Promise.resolve(inv);
      }
    }
    return Promise.resolve(undefined);
  }

  findByClient(
    agencyId: AgencyId,
    clientId: ClientId,
    opts?: { readonly state?: InvoiceState; readonly limit?: number },
  ): Promise<readonly Invoice[]> {
    const out: Invoice[] = [];
    for (const inv of this.byId.values()) {
      const s = inv.toSnapshot();
      if (s.agencyId !== agencyId || s.clientId !== clientId) continue;
      if (opts?.state !== undefined && s.state !== opts.state) continue;
      out.push(inv);
      if (opts?.limit !== undefined && out.length >= opts.limit) break;
    }
    return Promise.resolve(out);
  }

  nextSequentialNumber(agencyId: AgencyId, year: number): Promise<number> {
    const key = `${agencyId}:${String(year)}`;
    const current = this.counters.get(key) ?? 0;
    const next = current + 1;
    this.counters.set(key, next);
    return Promise.resolve(next);
  }

  size(): number {
    return this.byId.size;
  }
}
