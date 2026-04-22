import type {
  AgencyId,
  ClientId,
  Invoice,
  InvoiceId,
  InvoiceRepository,
  InvoiceReminderRecord,
  InvoiceReminderRepository,
  InvoiceState,
  ReminderLevel,
} from '@interim/domain';
import type { EmailReminderSender, RoleNotifier } from './send-invoice-reminder.use-case.js';

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

export class InMemoryInvoiceReminderRepository implements InvoiceReminderRepository {
  readonly records: InvoiceReminderRecord[] = [];

  insert(record: InvoiceReminderRecord): Promise<void> {
    const duplicate = this.records.find(
      (r) => r.invoiceId === record.invoiceId && r.level === record.level,
    );
    if (duplicate) {
      throw new Error(
        `InvoiceReminder duplicate (invoiceId, level) = (${record.invoiceId}, ${record.level})`,
      );
    }
    this.records.push(record);
    return Promise.resolve();
  }

  findByInvoice(
    agencyId: AgencyId,
    invoiceId: InvoiceId,
  ): Promise<readonly InvoiceReminderRecord[]> {
    return Promise.resolve(
      this.records.filter((r) => r.agencyId === agencyId && r.invoiceId === invoiceId),
    );
  }

  findPotentiallyOverdueInvoices(): Promise<readonly InvoiceId[]> {
    // Stub simple : test se charge d'injecter via `registerOverdue` si besoin
    return Promise.resolve([]);
  }
}

export class StubEmailReminderSender implements EmailReminderSender {
  readonly sent: {
    readonly agencyId: string;
    readonly invoiceId: string;
    readonly invoiceNumber: string;
    readonly level: ReminderLevel;
    readonly daysOverdue: number;
    readonly recipientEmail: string;
    readonly totalTtcRappen: bigint;
  }[] = [];
  failNext?: string | undefined;

  send(input: {
    agencyId: string;
    invoiceId: string;
    invoiceNumber: string;
    level: ReminderLevel;
    daysOverdue: number;
    recipientEmail: string;
    totalTtcRappen: bigint;
  }): Promise<{ messageId: string }> {
    if (this.failNext) {
      const reason = this.failNext;
      this.failNext = undefined;
      return Promise.reject(new Error(`simulated email failure: ${reason}`));
    }
    this.sent.push({ ...input });
    return Promise.resolve({ messageId: `msg-${String(this.sent.length)}` });
  }
}

export class InMemoryRoleNotifier implements RoleNotifier {
  readonly notifications: {
    readonly agencyId: string;
    readonly invoiceId: string;
    readonly level: ReminderLevel;
    readonly roles: readonly string[];
  }[] = [];

  notifyRoles(input: {
    agencyId: string;
    invoiceId: string;
    level: ReminderLevel;
    roles: readonly string[];
  }): Promise<void> {
    this.notifications.push({ ...input });
    return Promise.resolve();
  }
}
