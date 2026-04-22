import { describe, expect, it } from 'vitest';
import { exportAccountingCsv } from './csv-exporter.js';
import {
  buildInvoiceEmissionTransaction,
  buildPaymentReceivedTransaction,
} from './transaction-builders.js';

describe('exportAccountingCsv', () => {
  it('header standard 9 colonnes par défaut', () => {
    const csv = exportAccountingCsv({ transactions: [] });
    expect(csv.split('\n')[0]).toBe(
      'transactionId,date,journal,reference,account,accountLabel,side,amountChf,label',
    );
  });

  it('exclure header si includeHeader=false', () => {
    const csv = exportAccountingCsv({ transactions: [], includeHeader: false });
    expect(csv).toBe('\n');
  });

  it('1 facture émission → 3 lignes (1100/3200/2200) + header', () => {
    const tx = buildInvoiceEmissionTransaction({
      transactionId: 'tx-1',
      invoiceId: 'inv-1',
      invoiceNumber: 'ACME-2026-0001',
      issueDate: new Date('2026-04-22T00:00:00Z'),
      subtotalHtRappen: 100_000n,
      vatAmountRappen: 8_100n,
      totalTtcRappen: 108_100n,
      clientLabel: 'Client SA',
    });
    const csv = exportAccountingCsv({ transactions: [tx] });
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(4); // header + 3 entries
    expect(lines[1]).toContain('1100');
    expect(lines[1]).toContain('1081.00');
    expect(lines[2]).toContain('3200');
    expect(lines[2]).toContain('1000.00');
    expect(lines[3]).toContain('2200');
    expect(lines[3]).toContain('81.00');
  });

  it('format date YYYY-MM-DD UTC', () => {
    const tx = buildInvoiceEmissionTransaction({
      transactionId: 'tx-1',
      invoiceId: 'inv-1',
      invoiceNumber: 'ACME-2026-0001',
      issueDate: new Date('2026-04-22T23:30:00Z'),
      subtotalHtRappen: 100_000n,
      vatAmountRappen: 8_100n,
      totalTtcRappen: 108_100n,
      clientLabel: 'Client SA',
    });
    const csv = exportAccountingCsv({ transactions: [tx] });
    expect(csv).toContain('2026-04-22');
  });

  it('multi-tx : émission + encaissement → 5 lignes (3 + 2)', () => {
    const emission = buildInvoiceEmissionTransaction({
      transactionId: 'tx-em',
      invoiceId: 'inv-1',
      invoiceNumber: 'ACME-2026-0001',
      issueDate: new Date('2026-04-22T00:00:00Z'),
      subtotalHtRappen: 100_000n,
      vatAmountRappen: 8_100n,
      totalTtcRappen: 108_100n,
      clientLabel: 'Client',
    });
    const payment = buildPaymentReceivedTransaction({
      transactionId: 'tx-pay',
      invoiceId: 'inv-1',
      invoiceNumber: 'ACME-2026-0001',
      paymentDate: new Date('2026-05-15T00:00:00Z'),
      amountRappen: 108_100n,
    });
    const csv = exportAccountingCsv({ transactions: [emission, payment] });
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(6); // 1 header + 3 emission + 2 payment
  });

  it('échappe valeurs avec virgule, guillemet, newline', () => {
    const tx = buildInvoiceEmissionTransaction({
      transactionId: 'tx-1',
      invoiceId: 'inv-1',
      invoiceNumber: 'ACME-2026-0001',
      issueDate: new Date('2026-04-22T00:00:00Z'),
      subtotalHtRappen: 100_000n,
      vatAmountRappen: 8_100n,
      totalTtcRappen: 108_100n,
      clientLabel: 'Client, "Acme" SA',
    });
    const csv = exportAccountingCsv({ transactions: [tx] });
    // Le label contient une virgule + guillemet → wrappé entre quotes
    // avec quotes doublées
    expect(csv).toContain('"Facture ACME-2026-0001 - Client, ""Acme"" SA"');
  });

  it('label account FR pour 1100/3200/2200', () => {
    const tx = buildInvoiceEmissionTransaction({
      transactionId: 'tx-1',
      invoiceId: 'inv-1',
      invoiceNumber: 'ACME-2026-0001',
      issueDate: new Date('2026-04-22T00:00:00Z'),
      subtotalHtRappen: 100_000n,
      vatAmountRappen: 8_100n,
      totalTtcRappen: 108_100n,
      clientLabel: 'Client',
    });
    const csv = exportAccountingCsv({ transactions: [tx] });
    expect(csv).toContain('Créances clients');
    expect(csv).toContain('Ventes de prestations');
    expect(csv).toContain('TVA due');
  });

  it('déterministe : 2 appels mêmes inputs → même CSV', () => {
    const tx = buildInvoiceEmissionTransaction({
      transactionId: 'tx-det',
      invoiceId: 'inv-1',
      invoiceNumber: 'ACME-2026-0001',
      issueDate: new Date('2026-04-22T00:00:00Z'),
      subtotalHtRappen: 100_000n,
      vatAmountRappen: 8_100n,
      totalTtcRappen: 108_100n,
      clientLabel: 'Client',
    });
    const a = exportAccountingCsv({ transactions: [tx] });
    const b = exportAccountingCsv({ transactions: [tx] });
    expect(a).toBe(b);
  });
});
