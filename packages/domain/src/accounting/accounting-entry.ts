import { DomainError } from '../workers/errors.js';
import type { AccountCode } from './chart-of-accounts.js';

/**
 * Écriture comptable double-partie (debit/credit) — pure value object.
 *
 * Chaque transaction métier produit un ensemble d'écritures (`AccountingTransaction`)
 * dont la somme des debit = somme des credit (équilibre comptable).
 *
 * Tous les montants en rappen (bigint). Les conversions CHF se font
 * uniquement à l'export (CSV, Bexio, Abacus).
 */

export interface AccountingEntry {
  readonly account: AccountCode;
  /** Côté : 'D' = debit (augmente actif/charge), 'C' = credit (augmente passif/produit). */
  readonly side: 'D' | 'C';
  readonly amountRappen: bigint;
  readonly label: string;
}

export interface AccountingTransaction {
  readonly transactionId: string;
  readonly date: Date;
  readonly journal: AccountingJournal;
  readonly reference: string;
  readonly entries: readonly AccountingEntry[];
  /** Métadonnées libres (invoiceId, payslipId, paymentRef…). */
  readonly metadata: Readonly<Record<string, string>>;
}

/**
 * Journaux comptables (subdivision usuelle PME suisse).
 *   - VENTES   : factures clients
 *   - ACHATS   : factures fournisseurs (out of scope MVP)
 *   - BANQUE   : encaissements + virements
 *   - PAIE     : bulletins de salaire
 *   - DIVERS   : tout le reste (reg., corrections)
 */
export const ACCOUNTING_JOURNALS = ['VENTES', 'ACHATS', 'BANQUE', 'PAIE', 'DIVERS'] as const;
export type AccountingJournal = (typeof ACCOUNTING_JOURNALS)[number];

export class UnbalancedTransaction extends DomainError {
  constructor(
    public readonly transactionId: string,
    public readonly debitTotal: bigint,
    public readonly creditTotal: bigint,
  ) {
    super(
      'unbalanced_transaction',
      `Transaction ${transactionId} déséquilibrée : D=${debitTotal.toString()} C=${creditTotal.toString()}`,
    );
  }
}

/**
 * Vérifie que la somme des débits = somme des crédits.
 * @throws UnbalancedTransaction si déséquilibre.
 */
export function assertBalanced(transaction: AccountingTransaction): void {
  let d = 0n;
  let c = 0n;
  for (const e of transaction.entries) {
    if (e.amountRappen <= 0n) {
      throw new DomainError(
        'invalid_entry',
        `Montant non positif : ${e.amountRappen.toString()} sur ${e.account}`,
      );
    }
    if (e.side === 'D') d += e.amountRappen;
    else c += e.amountRappen;
  }
  if (d !== c) {
    throw new UnbalancedTransaction(transaction.transactionId, d, c);
  }
}

/**
 * Calcule le total débit et crédit d'une transaction (sans vérification
 * d'équilibre — pour reporting).
 */
export function totalsByside(transaction: AccountingTransaction): {
  readonly debit: bigint;
  readonly credit: bigint;
} {
  let d = 0n;
  let c = 0n;
  for (const e of transaction.entries) {
    if (e.side === 'D') d += e.amountRappen;
    else c += e.amountRappen;
  }
  return { debit: d, credit: c };
}
