import { describe, expect, it } from 'vitest';
import { asAgencyId } from '../shared/ids.js';
import { asClientId } from '../clients/client.js';
import {
  asInvoiceId,
  InvalidInvoiceTransition,
  Invoice,
  InvoiceAlreadyTerminal,
  type InvoiceLine,
} from './invoice.js';
import { isValidQrReference } from './qr-reference.js';

const AGENCY = asAgencyId('agency-a');
const CLIENT = asClientId('client-1');

function line(overrides: Partial<InvoiceLine> = {}): InvoiceLine {
  return {
    label: 'Mission Cariste',
    quantityCentiunits: 850, // 8.50 heures
    unitPriceRappen: 5000n, // CHF 50.00/h facturé client
    totalHtRappen: 42_500n, // 8.5 × 5000 = 42_500 rappen = CHF 425
    ...overrides,
  };
}

describe('Invoice.create', () => {
  it('happy path : draft + QRR valide + invoiceNumber formaté', () => {
    const inv = Invoice.create({
      id: asInvoiceId('inv-1'),
      agencyId: AGENCY,
      agencyCode: 'ACME',
      clientId: CLIENT,
      clientCode: 'client-1',
      year: 2026,
      sequentialNumber: 42,
      issueDate: new Date('2026-04-27T00:00:00Z'),
      periodFromIso: '2026-04-20',
      periodToIso: '2026-04-26',
      lines: [line()],
      vatRateBp: 810,
    });
    expect(inv.currentState).toBe('draft');
    expect(inv.invoiceNumber).toBe('ACME-2026-0042');
    expect(inv.qrReference.length).toBe(27);
    expect(isValidQrReference(inv.qrReference)).toBe(true);
  });

  it('calcul TVA 8.1% + TTC', () => {
    const inv = Invoice.create({
      id: asInvoiceId('inv-2'),
      agencyId: AGENCY,
      agencyCode: 'ACME',
      clientId: CLIENT,
      clientCode: '1',
      year: 2026,
      sequentialNumber: 1,
      issueDate: new Date('2026-04-27T00:00:00Z'),
      periodFromIso: '2026-04-20',
      periodToIso: '2026-04-26',
      lines: [line({ totalHtRappen: 100_000n, quantityCentiunits: 2000, unitPriceRappen: 5000n })],
      vatRateBp: 810,
    });
    const snap = inv.toSnapshot();
    expect(snap.subtotalHtRappen).toBe(100_000n);
    // TVA 8.1% sur 100_000 = 8_100
    expect(snap.vatAmountRappen).toBe(8_100n);
    expect(snap.totalTtcRappen).toBe(108_100n);
  });

  it('TVA 0% (exonéré) → TTC = HT', () => {
    const inv = Invoice.create({
      id: asInvoiceId('inv-3'),
      agencyId: AGENCY,
      agencyCode: 'ACME',
      clientId: CLIENT,
      clientCode: '1',
      year: 2026,
      sequentialNumber: 1,
      issueDate: new Date('2026-04-27T00:00:00Z'),
      periodFromIso: '2026-04-20',
      periodToIso: '2026-04-26',
      lines: [line()],
      vatRateBp: 0,
    });
    const snap = inv.toSnapshot();
    expect(snap.vatAmountRappen).toBe(0n);
    expect(snap.totalTtcRappen).toBe(snap.subtotalHtRappen);
  });

  it('due date = issue + 30 jours par défaut', () => {
    const inv = Invoice.create({
      id: asInvoiceId('inv-4'),
      agencyId: AGENCY,
      agencyCode: 'ACME',
      clientId: CLIENT,
      clientCode: '1',
      year: 2026,
      sequentialNumber: 1,
      issueDate: new Date('2026-04-27T00:00:00Z'),
      periodFromIso: '2026-04-20',
      periodToIso: '2026-04-26',
      lines: [line()],
      vatRateBp: 810,
    });
    expect(inv.toSnapshot().dueDate.toISOString()).toBe('2026-05-27T00:00:00.000Z');
  });

  it('dueInDays custom', () => {
    const inv = Invoice.create({
      id: asInvoiceId('inv-5'),
      agencyId: AGENCY,
      agencyCode: 'ACME',
      clientId: CLIENT,
      clientCode: '1',
      year: 2026,
      sequentialNumber: 1,
      issueDate: new Date('2026-04-27T00:00:00Z'),
      dueInDays: 10,
      periodFromIso: '2026-04-20',
      periodToIso: '2026-04-26',
      lines: [line()],
      vatRateBp: 810,
    });
    expect(inv.toSnapshot().dueDate.toISOString()).toBe('2026-05-07T00:00:00.000Z');
  });

  it('rejette lines vide', () => {
    expect(() =>
      Invoice.create({
        id: asInvoiceId('x'),
        agencyId: AGENCY,
        agencyCode: 'A',
        clientId: CLIENT,
        clientCode: '1',
        year: 2026,
        sequentialNumber: 1,
        issueDate: new Date(),
        periodFromIso: '2026-04-20',
        periodToIso: '2026-04-26',
        lines: [],
        vatRateBp: 810,
      }),
    ).toThrow();
  });

  it('rejette vatRateBp hors [0, 10000]', () => {
    expect(() =>
      Invoice.create({
        id: asInvoiceId('x'),
        agencyId: AGENCY,
        agencyCode: 'A',
        clientId: CLIENT,
        clientCode: '1',
        year: 2026,
        sequentialNumber: 1,
        issueDate: new Date(),
        periodFromIso: '2026-04-20',
        periodToIso: '2026-04-26',
        lines: [line()],
        vatRateBp: 15000,
      }),
    ).toThrow(/vat/);
  });

  it('rejette ligne avec totalHt incohérent', () => {
    expect(() =>
      Invoice.create({
        id: asInvoiceId('x'),
        agencyId: AGENCY,
        agencyCode: 'A',
        clientId: CLIENT,
        clientCode: '1',
        year: 2026,
        sequentialNumber: 1,
        issueDate: new Date(),
        periodFromIso: '2026-04-20',
        periodToIso: '2026-04-26',
        lines: [line({ totalHtRappen: 99_999n })], // mais qty × price = 42_500
        vatRateBp: 810,
      }),
    ).toThrow(/incohérent/);
  });
});

describe('Invoice — transitions', () => {
  function fresh(): Invoice {
    return Invoice.create({
      id: asInvoiceId('inv-tr'),
      agencyId: AGENCY,
      agencyCode: 'ACME',
      clientId: CLIENT,
      clientCode: '1',
      year: 2026,
      sequentialNumber: 1,
      issueDate: new Date('2026-04-27T00:00:00Z'),
      periodFromIso: '2026-04-20',
      periodToIso: '2026-04-26',
      lines: [line()],
      vatRateBp: 810,
    });
  }

  it('draft → emit → emitted', () => {
    const inv = fresh();
    inv.emit(new Date('2026-04-28T00:00:00Z'));
    expect(inv.currentState).toBe('emitted');
    expect(inv.toSnapshot().emittedAt?.toISOString()).toBe('2026-04-28T00:00:00.000Z');
  });

  it('emitted → markPaid → paid', () => {
    const inv = fresh();
    inv.emit(new Date('2026-04-28T00:00:00Z'));
    inv.markPaid(new Date('2026-05-15T00:00:00Z'));
    expect(inv.currentState).toBe('paid');
  });

  it('draft → cancel → cancelled', () => {
    const inv = fresh();
    inv.cancel(new Date());
    expect(inv.currentState).toBe('cancelled');
  });

  it('paid → cancel throw (terminal)', () => {
    const inv = fresh();
    inv.emit(new Date());
    inv.markPaid(new Date());
    expect(() => {
      inv.cancel(new Date());
    }).toThrow(InvoiceAlreadyTerminal);
  });

  it('draft → markPaid direct → throw invalid transition', () => {
    const inv = fresh();
    expect(() => {
      inv.markPaid(new Date());
    }).toThrow(InvalidInvoiceTransition);
  });
});
