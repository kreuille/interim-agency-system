import { describe, expect, it } from 'vitest';
import {
  assertBalanced,
  totalsByside,
  UnbalancedTransaction,
  type AccountingTransaction,
} from './accounting-entry.js';

function tx(overrides: Partial<AccountingTransaction> = {}): AccountingTransaction {
  return {
    transactionId: 'tx-1',
    date: new Date('2026-04-22T00:00:00Z'),
    journal: 'VENTES',
    reference: 'REF-1',
    entries: [],
    metadata: {},
    ...overrides,
  };
}

describe('assertBalanced', () => {
  it('équilibrée 2 entries → ok', () => {
    const t = tx({
      entries: [
        { account: '1100', side: 'D', amountRappen: 100n, label: 'D' },
        { account: '3200', side: 'C', amountRappen: 100n, label: 'C' },
      ],
    });
    expect(() => {
      assertBalanced(t);
    }).not.toThrow();
  });

  it('équilibrée 3 entries (1 D + 2 C)', () => {
    const t = tx({
      entries: [
        { account: '1100', side: 'D', amountRappen: 108_100n, label: 'D' },
        { account: '3200', side: 'C', amountRappen: 100_000n, label: 'C1' },
        { account: '2200', side: 'C', amountRappen: 8_100n, label: 'C2' },
      ],
    });
    expect(() => {
      assertBalanced(t);
    }).not.toThrow();
  });

  it('déséquilibrée → UnbalancedTransaction', () => {
    const t = tx({
      entries: [
        { account: '1100', side: 'D', amountRappen: 100n, label: 'D' },
        { account: '3200', side: 'C', amountRappen: 99n, label: 'C' },
      ],
    });
    expect(() => {
      assertBalanced(t);
    }).toThrow(UnbalancedTransaction);
  });

  it('amount = 0 → throw invalid_entry', () => {
    const t = tx({
      entries: [{ account: '1100', side: 'D', amountRappen: 0n, label: 'X' }],
    });
    expect(() => {
      assertBalanced(t);
    }).toThrow(/non positif/);
  });

  it('amount négatif → throw', () => {
    const t = tx({
      entries: [
        { account: '1100', side: 'D', amountRappen: -100n, label: 'D' },
        { account: '3200', side: 'C', amountRappen: -100n, label: 'C' },
      ],
    });
    expect(() => {
      assertBalanced(t);
    }).toThrow(/non positif/);
  });
});

describe('totalsByside', () => {
  it('somme D et C séparément', () => {
    const totals = totalsByside(
      tx({
        entries: [
          { account: '1100', side: 'D', amountRappen: 1000n, label: 'D' },
          { account: '3200', side: 'C', amountRappen: 600n, label: 'C1' },
          { account: '2200', side: 'C', amountRappen: 400n, label: 'C2' },
        ],
      }),
    );
    expect(totals.debit).toBe(1000n);
    expect(totals.credit).toBe(1000n);
  });
});
