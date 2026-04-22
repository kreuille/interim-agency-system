import type { Invoice, InvoiceState } from './invoice.js';

/**
 * Politique de relance pour factures impayées (A5.8).
 *
 * 4 niveaux escalatifs, conformes aux usages commerciaux suisses
 * (CO art. 102 "mise en demeure" + intérêts moratoires 5% art. 104).
 *
 *   - L1 amicale      : J+7 après dueDate  → email + commercial notifié
 *   - L2 ferme        : J+15 après dueDate → email + direction notifiée
 *   - L3 mise demeure : J+30 après dueDate → mise en demeure (LR recommandée)
 *   - L4 contentieux  : J+45 après dueDate → flag pour transmission contentieux
 *
 * Chaque niveau émis est tracé dans `invoice_reminders` (append-only).
 * Le use case est idempotent : si L2 déjà envoyée, ne renvoie pas.
 *
 * Paiement avant relance : `Invoice.state=paid` → stop complet (pas de
 * relance). Le check se fait au moment du scan, avant envoi.
 */

export const REMINDER_LEVELS = [
  'l1_amicale',
  'l2_ferme',
  'l3_mise_en_demeure',
  'l4_contentieux',
] as const;
export type ReminderLevel = (typeof REMINDER_LEVELS)[number];

export const REMINDER_DELAYS_DAYS: Readonly<Record<ReminderLevel, number>> = {
  l1_amicale: 7,
  l2_ferme: 15,
  l3_mise_en_demeure: 30,
  l4_contentieux: 45,
};

export interface ReminderComputationInput {
  readonly invoice: Invoice;
  readonly now: Date;
  /** Niveaux déjà envoyés pour cette facture (lookup repo). */
  readonly alreadySent: ReadonlySet<ReminderLevel>;
}

export type ReminderDecision =
  | { readonly action: 'skip'; readonly reason: SkipReason }
  | { readonly action: 'send'; readonly level: ReminderLevel; readonly daysOverdue: number };

export type SkipReason =
  | 'invoice_not_emitted' // draft ou cancelled
  | 'invoice_paid'
  | 'not_yet_overdue' // avant dueDate
  | 'all_levels_sent'
  | 'no_level_due_yet'; // dueDate dépassé mais pas assez pour L1

/**
 * Calcule la prochaine action relance pour une facture donnée.
 *
 * Logique :
 *   1. Si état ≠ emitted → skip (draft, paid, cancelled)
 *   2. Si now < dueDate → skip (pas encore en retard)
 *   3. Calcule daysOverdue = (now - dueDate) / 86400
 *   4. Trouve le niveau le plus élevé atteint mais non encore envoyé
 *   5. Si tous envoyés → skip
 *
 * Pure function : pas d'I/O, déterministe.
 */
export function computeReminderDecision(input: ReminderComputationInput): ReminderDecision {
  const state: InvoiceState = input.invoice.currentState;
  if (state === 'draft' || state === 'cancelled') {
    return { action: 'skip', reason: 'invoice_not_emitted' };
  }
  if (state === 'paid') {
    return { action: 'skip', reason: 'invoice_paid' };
  }

  const dueDate = input.invoice.toSnapshot().dueDate;
  const overdueMs = input.now.getTime() - dueDate.getTime();
  if (overdueMs < 0) {
    return { action: 'skip', reason: 'not_yet_overdue' };
  }
  const daysOverdue = Math.floor(overdueMs / 86400_000);

  // Cherche le niveau le plus élevé éligible (daysOverdue >= delai) non encore envoyé
  const orderedLevels: readonly ReminderLevel[] = [
    'l4_contentieux',
    'l3_mise_en_demeure',
    'l2_ferme',
    'l1_amicale',
  ];
  for (const level of orderedLevels) {
    const delay = REMINDER_DELAYS_DAYS[level];
    if (daysOverdue >= delay && !input.alreadySent.has(level)) {
      return { action: 'send', level, daysOverdue };
    }
  }

  // Tous les niveaux éligibles sont déjà envoyés ?
  const eligibleLevels = orderedLevels.filter((l) => daysOverdue >= REMINDER_DELAYS_DAYS[l]);
  if (eligibleLevels.length === 0) {
    return { action: 'skip', reason: 'no_level_due_yet' };
  }
  const allSent = eligibleLevels.every((l) => input.alreadySent.has(l));
  if (allSent) {
    return { action: 'skip', reason: 'all_levels_sent' };
  }
  return { action: 'skip', reason: 'no_level_due_yet' };
}
