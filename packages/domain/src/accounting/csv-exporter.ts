import { ACCOUNT_LABELS_FR } from './chart-of-accounts.js';
import type { AccountingTransaction } from './accounting-entry.js';

/**
 * Export CSV "comptable PME générique" : 1 ligne par écriture, format
 * largement accepté (Bexio, Abacus, Crésus, comptables externes).
 *
 * Schéma colonnes (ordre figé) :
 *   transactionId, date(YYYY-MM-DD), journal, reference, account,
 *   accountLabel, side, amountChf, label
 *
 * - Date YYYY-MM-DD UTC (CLAUDE.md §3.2 stockage UTC)
 * - amountChf format "1234.56" (point décimal, 2 décimales)
 * - Échappement RFC 4180 : `"` doublé, valeurs avec `,` `"` ou newline
 *   wrappées
 *
 * Pure function : déterministe, sortie identique pour input identique.
 * Sortie : string UTF-8 sans BOM, lignes séparées par `\n` (lf).
 */

export interface ExportAccountingCsvInput {
  readonly transactions: readonly AccountingTransaction[];
  readonly includeHeader?: boolean;
}

const HEADER = [
  'transactionId',
  'date',
  'journal',
  'reference',
  'account',
  'accountLabel',
  'side',
  'amountChf',
  'label',
];

export function exportAccountingCsv(input: ExportAccountingCsvInput): string {
  const rows: string[][] = [];
  if (input.includeHeader !== false) rows.push(HEADER);
  for (const tx of input.transactions) {
    const dateIso = isoDate(tx.date);
    for (const entry of tx.entries) {
      rows.push([
        tx.transactionId,
        dateIso,
        tx.journal,
        tx.reference,
        entry.account,
        ACCOUNT_LABELS_FR[entry.account],
        entry.side,
        formatChf(entry.amountRappen),
        entry.label,
      ]);
    }
  }
  return rows.map((r) => r.map(escapeCsv).join(',')).join('\n') + '\n';
}

function escapeCsv(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function formatChf(rappen: bigint): string {
  const sign = rappen < 0n ? '-' : '';
  const abs = rappen < 0n ? -rappen : rappen;
  const chf = abs / 100n;
  const cents = abs % 100n;
  return `${sign}${chf.toString()}.${cents.toString().padStart(2, '0')}`;
}

function isoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${String(y)}-${m}-${dd}`;
}
