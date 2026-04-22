import { describe, expect, it } from 'vitest';
import { FixedClock } from '@interim/shared';
import { asAgencyId, asClientId, asInvoiceId, Invoice, type InvoiceLine } from '@interim/domain';
import { SendInvoiceReminderUseCase } from './send-invoice-reminder.use-case.js';
import {
  InMemoryInvoiceReminderRepository,
  InMemoryInvoiceRepository,
  InMemoryRoleNotifier,
  StubEmailReminderSender,
} from './test-helpers.js';

const AGENCY = asAgencyId('agency-a');
const CLIENT = asClientId('client-1');

function line(): InvoiceLine {
  return {
    label: 'Mission',
    quantityCentiunits: 800,
    unitPriceRappen: 5000n,
    totalHtRappen: 40_000n,
  };
}

async function setup(opts: { state: 'draft' | 'emitted' | 'paid'; nowIso: string }) {
  const invoices = new InMemoryInvoiceRepository();
  const reminders = new InMemoryInvoiceReminderRepository();
  const email = new StubEmailReminderSender();
  const notifier = new InMemoryRoleNotifier();
  const clock = new FixedClock(new Date(opts.nowIso));
  const useCase = new SendInvoiceReminderUseCase(invoices, reminders, email, notifier, clock);

  const inv = Invoice.create({
    id: asInvoiceId('inv-1'),
    agencyId: AGENCY,
    agencyCode: 'ACME',
    clientId: CLIENT,
    clientCode: '1',
    year: 2026,
    sequentialNumber: 1,
    issueDate: new Date('2026-04-01T00:00:00Z'),
    periodFromIso: '2026-03-01',
    periodToIso: '2026-03-31',
    lines: [line()],
    vatRateBp: 810,
  });
  if (opts.state !== 'draft') inv.emit(new Date('2026-04-01T00:00:00Z'));
  if (opts.state === 'paid') inv.markPaid(new Date('2026-04-15T00:00:00Z'));
  await invoices.save(inv);

  return { useCase, invoices, reminders, email, notifier };
}

describe('SendInvoiceReminderUseCase', () => {
  it('J+7 après dueDate → envoie L1 + notifie commercial + insert record', async () => {
    const { useCase, reminders, email, notifier } = await setup({
      state: 'emitted',
      nowIso: '2026-05-08T12:00:00Z',
    });
    const result = await useCase.execute({
      agencyId: AGENCY,
      invoiceId: 'inv-1',
      recipientEmail: 'client@acme.test',
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.value.action === 'sent') {
      expect(result.value.level).toBe('l1_amicale');
      expect(result.value.daysOverdue).toBe(7);
    }
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]?.level).toBe('l1_amicale');
    expect(email.sent[0]?.recipientEmail).toBe('client@acme.test');
    expect(notifier.notifications).toHaveLength(1);
    expect(notifier.notifications[0]?.roles).toEqual(['commercial']);
    expect(reminders.records).toHaveLength(1);
    expect(reminders.records[0]?.level).toBe('l1_amicale');
  });

  it("paid → skip (invoice_paid), pas d'email", async () => {
    const { useCase, email } = await setup({
      state: 'paid',
      nowIso: '2026-05-08T00:00:00Z',
    });
    const result = await useCase.execute({
      agencyId: AGENCY,
      invoiceId: 'inv-1',
      recipientEmail: 'client@acme.test',
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.value.action === 'skip') {
      expect(result.value.reason).toBe('invoice_paid');
    }
    expect(email.sent).toHaveLength(0);
  });

  it('idempotent : 2 appels J+7 → 1 seul envoi (skip 2e)', async () => {
    const { useCase, email } = await setup({
      state: 'emitted',
      nowIso: '2026-05-08T00:00:00Z',
    });
    const r1 = await useCase.execute({
      agencyId: AGENCY,
      invoiceId: 'inv-1',
      recipientEmail: 'client@acme.test',
    });
    const r2 = await useCase.execute({
      agencyId: AGENCY,
      invoiceId: 'inv-1',
      recipientEmail: 'client@acme.test',
    });
    expect(r1.ok && r2.ok).toBe(true);
    if (r1.ok) expect(r1.value.action).toBe('sent');
    if (r2.ok && r2.value.action === 'skip') {
      expect(['no_level_due_yet', 'all_levels_sent']).toContain(r2.value.reason);
    }
    expect(email.sent).toHaveLength(1);
  });

  it('escalade L1 → L2 quand on rejoue à J+15', async () => {
    const invoices = new InMemoryInvoiceRepository();
    const reminders = new InMemoryInvoiceReminderRepository();
    const email = new StubEmailReminderSender();
    const notifier = new InMemoryRoleNotifier();

    const inv = Invoice.create({
      id: asInvoiceId('inv-1'),
      agencyId: AGENCY,
      agencyCode: 'ACME',
      clientId: CLIENT,
      clientCode: '1',
      year: 2026,
      sequentialNumber: 1,
      issueDate: new Date('2026-04-01T00:00:00Z'),
      periodFromIso: '2026-03-01',
      periodToIso: '2026-03-31',
      lines: [line()],
      vatRateBp: 810,
    });
    inv.emit(new Date('2026-04-01T00:00:00Z'));
    await invoices.save(inv);

    // Run 1 : J+7 → L1
    const useCase1 = new SendInvoiceReminderUseCase(
      invoices,
      reminders,
      email,
      notifier,
      new FixedClock(new Date('2026-05-08T00:00:00Z')),
    );
    await useCase1.execute({ agencyId: AGENCY, invoiceId: 'inv-1', recipientEmail: 'c@acme.test' });

    // Run 2 : J+15 → L2
    const useCase2 = new SendInvoiceReminderUseCase(
      invoices,
      reminders,
      email,
      notifier,
      new FixedClock(new Date('2026-05-16T00:00:00Z')),
    );
    const r2 = await useCase2.execute({
      agencyId: AGENCY,
      invoiceId: 'inv-1',
      recipientEmail: 'c@acme.test',
    });
    expect(r2.ok && r2.value.action === 'sent').toBe(true);
    if (r2.ok && r2.value.action === 'sent') {
      expect(r2.value.level).toBe('l2_ferme');
    }
    expect(reminders.records).toHaveLength(2);
    expect(notifier.notifications).toHaveLength(2);
    expect(notifier.notifications[1]?.roles).toEqual(['commercial', 'direction']);
  });

  it('L3 mise demeure → notifie direction uniquement', async () => {
    const invoices = new InMemoryInvoiceRepository();
    const reminders = new InMemoryInvoiceReminderRepository();
    const email = new StubEmailReminderSender();
    const notifier = new InMemoryRoleNotifier();
    const useCase = new SendInvoiceReminderUseCase(
      invoices,
      reminders,
      email,
      notifier,
      new FixedClock(new Date('2026-06-01T00:00:00Z')),
    );
    const inv = Invoice.create({
      id: asInvoiceId('inv-1'),
      agencyId: AGENCY,
      agencyCode: 'ACME',
      clientId: CLIENT,
      clientCode: '1',
      year: 2026,
      sequentialNumber: 1,
      issueDate: new Date('2026-04-01T00:00:00Z'),
      periodFromIso: '2026-03-01',
      periodToIso: '2026-03-31',
      lines: [line()],
      vatRateBp: 810,
    });
    inv.emit(new Date('2026-04-01T00:00:00Z'));
    await invoices.save(inv);
    // Pré-existe L1 + L2
    await reminders.insert({
      id: 'r1',
      agencyId: AGENCY,
      invoiceId: inv.id,
      level: 'l1_amicale',
      sentAt: new Date('2026-05-08T00:00:00Z'),
      notifiedRoles: ['commercial'],
      metadata: {},
    });
    await reminders.insert({
      id: 'r2',
      agencyId: AGENCY,
      invoiceId: inv.id,
      level: 'l2_ferme',
      sentAt: new Date('2026-05-16T00:00:00Z'),
      notifiedRoles: ['commercial', 'direction'],
      metadata: {},
    });

    const result = await useCase.execute({
      agencyId: AGENCY,
      invoiceId: 'inv-1',
      recipientEmail: 'c@acme.test',
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.value.action === 'sent') {
      expect(result.value.level).toBe('l3_mise_en_demeure');
    }
    expect(notifier.notifications[0]?.roles).toEqual(['direction']);
  });

  it('email failed → email_failed, pas de record inséré', async () => {
    const { useCase, email, reminders } = await setup({
      state: 'emitted',
      nowIso: '2026-05-08T00:00:00Z',
    });
    email.failNext = 'smtp_timeout';
    const result = await useCase.execute({
      agencyId: AGENCY,
      invoiceId: 'inv-1',
      recipientEmail: 'c@acme.test',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('email_failed');
    expect(reminders.records).toHaveLength(0);
  });

  it('invoice introuvable → invoice_not_found', async () => {
    const { useCase } = await setup({
      state: 'emitted',
      nowIso: '2026-05-08T00:00:00Z',
    });
    const result = await useCase.execute({
      agencyId: AGENCY,
      invoiceId: 'unknown',
      recipientEmail: 'c@acme.test',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('invoice_not_found');
  });

  it('multi-tenant : autre agencyId → invoice_not_found', async () => {
    const { useCase } = await setup({
      state: 'emitted',
      nowIso: '2026-05-08T00:00:00Z',
    });
    const result = await useCase.execute({
      agencyId: asAgencyId('agency-b'),
      invoiceId: 'inv-1',
      recipientEmail: 'c@acme.test',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('invoice_not_found');
  });
});
