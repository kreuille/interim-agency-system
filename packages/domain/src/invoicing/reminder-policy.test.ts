import { describe, expect, it } from 'vitest';
import { asAgencyId } from '../shared/ids.js';
import { asClientId } from '../clients/client.js';
import { asInvoiceId, Invoice, type InvoiceLine } from './invoice.js';
import {
  computeReminderDecision,
  REMINDER_DELAYS_DAYS,
  type ReminderLevel,
} from './reminder-policy.js';

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

function buildInvoice(opts: {
  state: 'draft' | 'emitted' | 'paid' | 'cancelled';
  issueDate?: Date;
  dueInDays?: number;
}): Invoice {
  const inv = Invoice.create({
    id: asInvoiceId('inv-1'),
    agencyId: AGENCY,
    agencyCode: 'ACME',
    clientId: CLIENT,
    clientCode: '1',
    year: 2026,
    sequentialNumber: 1,
    issueDate: opts.issueDate ?? new Date('2026-04-01T00:00:00Z'),
    ...(opts.dueInDays !== undefined ? { dueInDays: opts.dueInDays } : {}),
    periodFromIso: '2026-03-01',
    periodToIso: '2026-03-31',
    lines: [line()],
    vatRateBp: 810,
  });
  if (opts.state === 'emitted' || opts.state === 'paid' || opts.state === 'cancelled') {
    inv.emit(new Date('2026-04-01T00:00:00Z'));
  }
  if (opts.state === 'paid') {
    inv.markPaid(new Date('2026-04-15T00:00:00Z'));
  }
  if (opts.state === 'cancelled') {
    inv.cancel(new Date('2026-04-02T00:00:00Z'));
  }
  return inv;
}

describe('REMINDER_DELAYS_DAYS', () => {
  it('valeurs conformes : 7, 15, 30, 45', () => {
    expect(REMINDER_DELAYS_DAYS.l1_amicale).toBe(7);
    expect(REMINDER_DELAYS_DAYS.l2_ferme).toBe(15);
    expect(REMINDER_DELAYS_DAYS.l3_mise_en_demeure).toBe(30);
    expect(REMINDER_DELAYS_DAYS.l4_contentieux).toBe(45);
  });
});

describe('computeReminderDecision', () => {
  it('draft → skip (invoice_not_emitted)', () => {
    const inv = buildInvoice({ state: 'draft' });
    const decision = computeReminderDecision({
      invoice: inv,
      now: new Date('2026-06-01T00:00:00Z'),
      alreadySent: new Set(),
    });
    expect(decision.action).toBe('skip');
    if (decision.action === 'skip') expect(decision.reason).toBe('invoice_not_emitted');
  });

  it('paid → skip (invoice_paid)', () => {
    const inv = buildInvoice({ state: 'paid' });
    const decision = computeReminderDecision({
      invoice: inv,
      now: new Date('2026-06-01T00:00:00Z'),
      alreadySent: new Set(),
    });
    expect(decision.action).toBe('skip');
    if (decision.action === 'skip') expect(decision.reason).toBe('invoice_paid');
  });

  it('cancelled → skip (invoice_not_emitted)', () => {
    const inv = buildInvoice({ state: 'cancelled' });
    const decision = computeReminderDecision({
      invoice: inv,
      now: new Date('2026-06-01T00:00:00Z'),
      alreadySent: new Set(),
    });
    expect(decision.action).toBe('skip');
  });

  it('emitted, avant dueDate → skip (not_yet_overdue)', () => {
    // dueDate = issue + 30j default = 2026-05-01
    const inv = buildInvoice({ state: 'emitted' });
    const decision = computeReminderDecision({
      invoice: inv,
      now: new Date('2026-04-15T00:00:00Z'), // avant
      alreadySent: new Set(),
    });
    expect(decision.action).toBe('skip');
    if (decision.action === 'skip') expect(decision.reason).toBe('not_yet_overdue');
  });

  it('J+7 après dueDate → send L1', () => {
    const inv = buildInvoice({ state: 'emitted' });
    // dueDate = 2026-05-01, +7 = 2026-05-08
    const decision = computeReminderDecision({
      invoice: inv,
      now: new Date('2026-05-08T12:00:00Z'),
      alreadySent: new Set(),
    });
    expect(decision.action).toBe('send');
    if (decision.action === 'send') {
      expect(decision.level).toBe('l1_amicale');
      expect(decision.daysOverdue).toBe(7);
    }
  });

  it('J+15, L1 déjà envoyé → send L2', () => {
    const inv = buildInvoice({ state: 'emitted' });
    const decision = computeReminderDecision({
      invoice: inv,
      now: new Date('2026-05-16T00:00:00Z'),
      alreadySent: new Set<ReminderLevel>(['l1_amicale']),
    });
    expect(decision.action).toBe('send');
    if (decision.action === 'send') expect(decision.level).toBe('l2_ferme');
  });

  it('J+30, L1+L2 envoyés → send L3', () => {
    const inv = buildInvoice({ state: 'emitted' });
    const decision = computeReminderDecision({
      invoice: inv,
      now: new Date('2026-05-31T00:00:00Z'),
      alreadySent: new Set<ReminderLevel>(['l1_amicale', 'l2_ferme']),
    });
    expect(decision.action).toBe('send');
    if (decision.action === 'send') expect(decision.level).toBe('l3_mise_en_demeure');
  });

  it('J+50, tous envoyés → skip (all_levels_sent)', () => {
    const inv = buildInvoice({ state: 'emitted' });
    const decision = computeReminderDecision({
      invoice: inv,
      now: new Date('2026-06-20T00:00:00Z'),
      alreadySent: new Set<ReminderLevel>([
        'l1_amicale',
        'l2_ferme',
        'l3_mise_en_demeure',
        'l4_contentieux',
      ]),
    });
    expect(decision.action).toBe('skip');
    if (decision.action === 'skip') expect(decision.reason).toBe('all_levels_sent');
  });

  it('J+7 après dueDate, scan attrape niveau le plus haut éligible (L1) en premier (skip vers L1 même si L4 pas encore atteint)', () => {
    const inv = buildInvoice({ state: 'emitted' });
    // À J+7, seul L1 est éligible (J+15, J+30, J+45 pas atteints)
    const decision = computeReminderDecision({
      invoice: inv,
      now: new Date('2026-05-08T00:00:00Z'),
      alreadySent: new Set(),
    });
    expect(decision.action).toBe('send');
    if (decision.action === 'send') expect(decision.level).toBe('l1_amicale');
  });

  it('J+45 sans aucune relance précédente (cas exotique pile sur L4 sans escalade) → send L4', () => {
    const inv = buildInvoice({ state: 'emitted' });
    const decision = computeReminderDecision({
      invoice: inv,
      now: new Date('2026-06-15T00:00:00Z'), // J+45
      alreadySent: new Set(),
    });
    expect(decision.action).toBe('send');
    if (decision.action === 'send') {
      expect(decision.level).toBe('l4_contentieux');
      expect(decision.daysOverdue).toBe(45);
    }
  });
});
