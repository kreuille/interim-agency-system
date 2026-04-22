import { CHART_OF_ACCOUNTS } from './chart-of-accounts.js';
import {
  assertBalanced,
  type AccountingEntry,
  type AccountingTransaction,
} from './accounting-entry.js';

/**
 * Builders pure pour transformer un événement métier en
 * `AccountingTransaction` équilibrée.
 *
 * Chaque builder respecte les conventions PME suisse :
 *   - Émission facture → 1100 D / 3200 C / 2200 C TVA
 *   - Encaissement client → 1020 D / 1100 C
 *   - Bulletin de paie (employé) → 5000 D / 2270 C 2271 C 2272 C 2273 C
 *   - Virement salaire → 2270 D / 1020 C
 *
 * Les transactions générées sont équilibrées par construction
 * (`assertBalanced` lève si bug d'arrondi/algorithme).
 */

export interface BuildInvoiceEntriesInput {
  readonly transactionId: string;
  readonly invoiceId: string;
  readonly invoiceNumber: string;
  readonly issueDate: Date;
  readonly subtotalHtRappen: bigint;
  readonly vatAmountRappen: bigint;
  readonly totalTtcRappen: bigint;
  readonly clientLabel: string;
}

/**
 * Émission facture client (TVA suisse 8.1% par défaut).
 *
 *   1100 Créances clients     D = totalTtc
 *      → 3200 Ventes prestations  C = subtotalHt
 *      → 2200 TVA due             C = vatAmount
 */
export function buildInvoiceEmissionTransaction(
  input: BuildInvoiceEntriesInput,
): AccountingTransaction {
  const entries: AccountingEntry[] = [
    {
      account: CHART_OF_ACCOUNTS.RECEIVABLES,
      side: 'D',
      amountRappen: input.totalTtcRappen,
      label: `Facture ${input.invoiceNumber} - ${input.clientLabel}`,
    },
    {
      account: CHART_OF_ACCOUNTS.REVENUE,
      side: 'C',
      amountRappen: input.subtotalHtRappen,
      label: `Prestations - ${input.invoiceNumber}`,
    },
  ];
  if (input.vatAmountRappen > 0n) {
    entries.push({
      account: CHART_OF_ACCOUNTS.VAT_OUTPUT,
      side: 'C',
      amountRappen: input.vatAmountRappen,
      label: `TVA due - ${input.invoiceNumber}`,
    });
  }
  const tx: AccountingTransaction = {
    transactionId: input.transactionId,
    date: input.issueDate,
    journal: 'VENTES',
    reference: input.invoiceNumber,
    entries,
    metadata: { invoiceId: input.invoiceId, invoiceNumber: input.invoiceNumber },
  };
  assertBalanced(tx);
  return tx;
}

export interface BuildPaymentReceivedInput {
  readonly transactionId: string;
  readonly invoiceId: string;
  readonly invoiceNumber: string;
  readonly paymentDate: Date;
  readonly amountRappen: bigint;
  readonly bankReference?: string;
}

/**
 * Encaissement paiement client (camt.053 reconciliation).
 *
 *   1020 Banque             D = amount
 *      → 1100 Créances clients  C = amount
 */
export function buildPaymentReceivedTransaction(
  input: BuildPaymentReceivedInput,
): AccountingTransaction {
  const entries: AccountingEntry[] = [
    {
      account: CHART_OF_ACCOUNTS.BANK,
      side: 'D',
      amountRappen: input.amountRappen,
      label: `Encaissement ${input.invoiceNumber}${input.bankReference ? ` (${input.bankReference})` : ''}`,
    },
    {
      account: CHART_OF_ACCOUNTS.RECEIVABLES,
      side: 'C',
      amountRappen: input.amountRappen,
      label: `Solde créance ${input.invoiceNumber}`,
    },
  ];
  const tx: AccountingTransaction = {
    transactionId: input.transactionId,
    date: input.paymentDate,
    journal: 'BANQUE',
    reference: input.invoiceNumber,
    entries,
    metadata: {
      invoiceId: input.invoiceId,
      invoiceNumber: input.invoiceNumber,
      ...(input.bankReference ? { bankReference: input.bankReference } : {}),
    },
  };
  assertBalanced(tx);
  return tx;
}

export interface BuildPayslipEntriesInput {
  readonly transactionId: string;
  readonly payslipId: string;
  readonly workerId: string;
  readonly isoWeek: string;
  readonly issueDate: Date;
  readonly grossRappen: bigint; // brut total (worked + 13e + vacances)
  readonly avsRappen: bigint;
  readonly acRappen: bigint;
  readonly laaRappen: bigint;
  readonly lppRappen: bigint;
  readonly isRappen: bigint;
  readonly netRappen: bigint;
}

/**
 * Bulletin de paie (côté employeur : enregistrement des charges +
 * passifs en attente).
 *
 *   5000 Salaires bruts       D = grossRappen
 *      → 2271 Cotis sociales (AVS+AC+LAA)  C = avs + ac + laa
 *      → 2272 LPP à payer                  C = lpp
 *      → 2273 IS à payer                   C = is
 *      → 2270 Salaires nets à payer        C = netRappen
 *
 * Equilibre : grossRappen = avs + ac + laa + lpp + is + netRappen
 * (vérifié par assertBalanced ; lève si bulletin incohérent).
 */
export function buildPayslipTransaction(input: BuildPayslipEntriesInput): AccountingTransaction {
  const entries: AccountingEntry[] = [
    {
      account: CHART_OF_ACCOUNTS.WAGES_GROSS,
      side: 'D',
      amountRappen: input.grossRappen,
      label: `Salaire brut ${input.workerId} ${input.isoWeek}`,
    },
  ];
  const socialSubtotal = input.avsRappen + input.acRappen + input.laaRappen;
  if (socialSubtotal > 0n) {
    entries.push({
      account: CHART_OF_ACCOUNTS.SOCIAL_PAYABLE,
      side: 'C',
      amountRappen: socialSubtotal,
      label: `Cotis. sociales (AVS+AC+LAA) ${input.workerId} ${input.isoWeek}`,
    });
  }
  if (input.lppRappen > 0n) {
    entries.push({
      account: CHART_OF_ACCOUNTS.LPP_PAYABLE,
      side: 'C',
      amountRappen: input.lppRappen,
      label: `LPP ${input.workerId} ${input.isoWeek}`,
    });
  }
  if (input.isRappen > 0n) {
    entries.push({
      account: CHART_OF_ACCOUNTS.IS_PAYABLE,
      side: 'C',
      amountRappen: input.isRappen,
      label: `Impôt source ${input.workerId} ${input.isoWeek}`,
    });
  }
  if (input.netRappen > 0n) {
    entries.push({
      account: CHART_OF_ACCOUNTS.WAGES_PAYABLE,
      side: 'C',
      amountRappen: input.netRappen,
      label: `Salaire net à payer ${input.workerId} ${input.isoWeek}`,
    });
  }
  const tx: AccountingTransaction = {
    transactionId: input.transactionId,
    date: input.issueDate,
    journal: 'PAIE',
    reference: input.payslipId,
    entries,
    metadata: {
      payslipId: input.payslipId,
      workerId: input.workerId,
      isoWeek: input.isoWeek,
    },
  };
  assertBalanced(tx);
  return tx;
}

export interface BuildSalaryPaymentInput {
  readonly transactionId: string;
  readonly payslipId: string;
  readonly workerId: string;
  readonly paymentDate: Date;
  readonly netRappen: bigint;
}

/**
 * Virement effectif du salaire net au worker.
 *
 *   2270 Salaires à payer  D = netRappen
 *      → 1020 Banque       C = netRappen
 */
export function buildSalaryPaymentTransaction(
  input: BuildSalaryPaymentInput,
): AccountingTransaction {
  const entries: AccountingEntry[] = [
    {
      account: CHART_OF_ACCOUNTS.WAGES_PAYABLE,
      side: 'D',
      amountRappen: input.netRappen,
      label: `Solde salaire ${input.workerId}`,
    },
    {
      account: CHART_OF_ACCOUNTS.BANK,
      side: 'C',
      amountRappen: input.netRappen,
      label: `Virement salaire ${input.workerId}`,
    },
  ];
  const tx: AccountingTransaction = {
    transactionId: input.transactionId,
    date: input.paymentDate,
    journal: 'BANQUE',
    reference: input.payslipId,
    entries,
    metadata: { payslipId: input.payslipId, workerId: input.workerId },
  };
  assertBalanced(tx);
  return tx;
}
