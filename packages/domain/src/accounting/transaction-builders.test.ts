import { describe, expect, it } from 'vitest';
import { CHART_OF_ACCOUNTS } from './chart-of-accounts.js';
import {
  buildInvoiceEmissionTransaction,
  buildPaymentReceivedTransaction,
  buildPayslipTransaction,
  buildSalaryPaymentTransaction,
} from './transaction-builders.js';

describe('buildInvoiceEmissionTransaction', () => {
  it('TVA 8.1% : 1100 D 108_100 / 3200 C 100_000 / 2200 C 8_100', () => {
    const tx = buildInvoiceEmissionTransaction({
      transactionId: 'tx-1',
      invoiceId: 'inv-1',
      invoiceNumber: 'ACME-2026-0001',
      issueDate: new Date('2026-04-22T00:00:00Z'),
      subtotalHtRappen: 100_000n,
      vatAmountRappen: 8_100n,
      totalTtcRappen: 108_100n,
      clientLabel: 'Acme SA',
    });
    expect(tx.journal).toBe('VENTES');
    expect(tx.entries).toHaveLength(3);
    const recv = tx.entries.find((e) => e.account === CHART_OF_ACCOUNTS.RECEIVABLES);
    expect(recv?.side).toBe('D');
    expect(recv?.amountRappen).toBe(108_100n);
    const rev = tx.entries.find((e) => e.account === CHART_OF_ACCOUNTS.REVENUE);
    expect(rev?.side).toBe('C');
    expect(rev?.amountRappen).toBe(100_000n);
    const vat = tx.entries.find((e) => e.account === CHART_OF_ACCOUNTS.VAT_OUTPUT);
    expect(vat?.amountRappen).toBe(8_100n);
  });

  it('exonéré (TVA 0) → 2 entries seulement, pas de 2200', () => {
    const tx = buildInvoiceEmissionTransaction({
      transactionId: 'tx-2',
      invoiceId: 'inv-2',
      invoiceNumber: 'ACME-2026-0002',
      issueDate: new Date('2026-04-22T00:00:00Z'),
      subtotalHtRappen: 100_000n,
      vatAmountRappen: 0n,
      totalTtcRappen: 100_000n,
      clientLabel: 'Acme',
    });
    expect(tx.entries).toHaveLength(2);
    expect(tx.entries.find((e) => e.account === CHART_OF_ACCOUNTS.VAT_OUTPUT)).toBeUndefined();
  });
});

describe('buildPaymentReceivedTransaction', () => {
  it('1020 D / 1100 C', () => {
    const tx = buildPaymentReceivedTransaction({
      transactionId: 'tx-pay',
      invoiceId: 'inv-1',
      invoiceNumber: 'ACME-2026-0001',
      paymentDate: new Date('2026-05-15T00:00:00Z'),
      amountRappen: 108_100n,
      bankReference: 'CAMT-001',
    });
    expect(tx.journal).toBe('BANQUE');
    expect(tx.entries.find((e) => e.account === CHART_OF_ACCOUNTS.BANK)?.side).toBe('D');
    expect(tx.entries.find((e) => e.account === CHART_OF_ACCOUNTS.RECEIVABLES)?.side).toBe('C');
    expect(tx.metadata.bankReference).toBe('CAMT-001');
  });
});

describe('buildPayslipTransaction', () => {
  it('5000 D = somme C (équilibre exact)', () => {
    // Brut 2333.20 = 233_320 rappen
    // Déductions : AVS 12_366 + AC 2_566 + LAA 3_266 + LPP 4_452 + IS 0
    //            = 22_650
    // Net = 210_670
    // Total D = 233_320, Total C = 22_650 + 210_670 = 233_320 ✓
    const tx = buildPayslipTransaction({
      transactionId: 'tx-pay-1',
      payslipId: 'pay-1',
      workerId: 'worker-1',
      isoWeek: '2026-W17',
      issueDate: new Date('2026-04-27T00:00:00Z'),
      grossRappen: 233_320n,
      avsRappen: 12_366n,
      acRappen: 2_566n,
      laaRappen: 3_266n,
      lppRappen: 4_452n,
      isRappen: 0n,
      netRappen: 210_670n,
    });
    expect(tx.journal).toBe('PAIE');
    // Vérif équilibre déjà fait par assertBalanced dans le builder
    const social = tx.entries.find((e) => e.account === CHART_OF_ACCOUNTS.SOCIAL_PAYABLE);
    expect(social?.amountRappen).toBe(12_366n + 2_566n + 3_266n);
    const lpp = tx.entries.find((e) => e.account === CHART_OF_ACCOUNTS.LPP_PAYABLE);
    expect(lpp?.amountRappen).toBe(4_452n);
  });

  it("IS=0 → pas d'entry 2273", () => {
    const tx = buildPayslipTransaction({
      transactionId: 'tx-x',
      payslipId: 'pay-x',
      workerId: 'w-x',
      isoWeek: '2026-W17',
      issueDate: new Date('2026-04-27T00:00:00Z'),
      grossRappen: 200_000n,
      avsRappen: 10_000n,
      acRappen: 2_000n,
      laaRappen: 3_000n,
      lppRappen: 5_000n,
      isRappen: 0n,
      netRappen: 180_000n,
    });
    expect(tx.entries.find((e) => e.account === CHART_OF_ACCOUNTS.IS_PAYABLE)).toBeUndefined();
  });

  it('avec IS → 2273 présent', () => {
    const tx = buildPayslipTransaction({
      transactionId: 'tx-is',
      payslipId: 'pay-is',
      workerId: 'w-is',
      isoWeek: '2026-W17',
      issueDate: new Date('2026-04-27T00:00:00Z'),
      grossRappen: 250_000n,
      avsRappen: 13_000n,
      acRappen: 2_700n,
      laaRappen: 3_500n,
      lppRappen: 5_000n,
      isRappen: 15_000n,
      netRappen: 210_800n,
    });
    expect(tx.entries.find((e) => e.account === CHART_OF_ACCOUNTS.IS_PAYABLE)?.amountRappen).toBe(
      15_000n,
    );
  });

  it('rejette si bulletin déséquilibré (gross != déductions + net)', () => {
    expect(() =>
      buildPayslipTransaction({
        transactionId: 'tx-bad',
        payslipId: 'pay-bad',
        workerId: 'w-bad',
        isoWeek: '2026-W17',
        issueDate: new Date('2026-04-27T00:00:00Z'),
        grossRappen: 100_000n,
        avsRappen: 10_000n,
        acRappen: 2_000n,
        laaRappen: 3_000n,
        lppRappen: 0n,
        isRappen: 0n,
        netRappen: 99_999n, // déséquilibré : 10+2+3+0+0+99.999 = 114.999 ≠ 100
      }),
    ).toThrow(/déséquilibrée/);
  });
});

describe('buildSalaryPaymentTransaction', () => {
  it('2270 D / 1020 C', () => {
    const tx = buildSalaryPaymentTransaction({
      transactionId: 'tx-vir',
      payslipId: 'pay-1',
      workerId: 'worker-1',
      paymentDate: new Date('2026-05-01T00:00:00Z'),
      netRappen: 210_670n,
    });
    expect(tx.journal).toBe('BANQUE');
    expect(tx.entries.find((e) => e.account === CHART_OF_ACCOUNTS.WAGES_PAYABLE)?.side).toBe('D');
    expect(tx.entries.find((e) => e.account === CHART_OF_ACCOUNTS.BANK)?.side).toBe('C');
  });
});
