import { DomainError } from '../workers/errors.js';
import type { AgencyId } from '../shared/ids.js';
import type { ClientId } from '../clients/client.js';
import { buildInterimQrReference } from './qr-reference.js';

/**
 * Aggregate Invoice — A5.7.
 *
 * Représente une facture agence → client, construite à partir d'un ou
 * plusieurs timesheets `signed`/`tacit` sur une période (hebdo, mensuel
 * ou per-mission selon contrat client).
 *
 * Immuable une fois émise (state = `emitted`). Les modifications
 * passent par des transitions : `paid` (A5.8 reconciliation camt.053),
 * `cancelled` (avoir/correction — DETTE-083).
 *
 * Montants stockés en rappen bigint. TVA en basis points (810 = 8.1%).
 */

export type InvoiceId = string & { readonly __brand: 'InvoiceId' };

export function asInvoiceId(value: string): InvoiceId {
  if (value.length === 0) throw new Error('InvoiceId cannot be empty');
  return value as InvoiceId;
}

export const INVOICE_STATES = ['draft', 'emitted', 'paid', 'cancelled'] as const;
export type InvoiceState = (typeof INVOICE_STATES)[number];

const TERMINAL: ReadonlySet<InvoiceState> = new Set(['paid', 'cancelled']);

const TRANSITIONS: ReadonlyMap<InvoiceState, ReadonlySet<InvoiceState>> = new Map([
  ['draft', new Set<InvoiceState>(['emitted', 'cancelled'])],
  ['emitted', new Set<InvoiceState>(['paid', 'cancelled'])],
  ['paid', new Set<InvoiceState>()],
  ['cancelled', new Set<InvoiceState>()],
]);

export class InvalidInvoiceTransition extends DomainError {
  constructor(from: InvoiceState, to: InvoiceState) {
    super('invalid_invoice_transition', `Transition interdite : ${from} → ${to}`);
  }
}

export class InvoiceAlreadyTerminal extends DomainError {
  constructor(state: InvoiceState) {
    super('invoice_already_terminal', `Invoice déjà terminale : ${state}`);
  }
}

export interface InvoiceLine {
  /** Libellé ligne (ex. "Cariste Jean Dupont - sem 2026-W17"). */
  readonly label: string;
  /** Quantité (heures × 100 pour 2 décimales : 8.5h → 850). Entier. */
  readonly quantityCentiunits: number;
  /** Prix unitaire en rappen (ex. taux horaire facturé client). */
  readonly unitPriceRappen: bigint;
  /** Total HT rappen = quantityCentiunits × unitPriceRappen / 100. */
  readonly totalHtRappen: bigint;
  /** Référence timesheet source (audit). */
  readonly sourceTimesheetId?: string;
}

export interface InvoiceProps {
  readonly id: InvoiceId;
  readonly agencyId: AgencyId;
  readonly clientId: ClientId;
  /** Numéro séquentiel humainement lisible `AG-{YYYY}-{NNNN}`. */
  readonly invoiceNumber: string;
  /** Référence QR 27 chiffres (incl. check digit). */
  readonly qrReference: string;
  readonly issueDate: Date;
  readonly dueDate: Date;
  readonly periodFromIso: string; // YYYY-MM-DD
  readonly periodToIso: string;
  readonly lines: readonly InvoiceLine[];
  readonly subtotalHtRappen: bigint;
  /** Taux TVA en basis points (810 = 8.1%, 0 = exonéré). */
  readonly vatRateBp: number;
  readonly vatAmountRappen: bigint;
  readonly totalTtcRappen: bigint;
  readonly state: InvoiceState;
  readonly emittedAt?: Date;
  readonly paidAt?: Date;
  readonly cancelledAt?: Date;
  readonly stateChangedAt: Date;
}

export interface CreateInvoiceInput {
  readonly id: InvoiceId;
  readonly agencyId: AgencyId;
  readonly agencyCode: string;
  readonly clientId: ClientId;
  readonly clientCode: string;
  readonly year: number;
  readonly sequentialNumber: number;
  readonly issueDate: Date;
  readonly dueInDays?: number;
  readonly periodFromIso: string;
  readonly periodToIso: string;
  readonly lines: readonly InvoiceLine[];
  readonly vatRateBp: number;
}

const DEFAULT_DUE_DAYS = 30;

export class Invoice {
  private constructor(private state: InvoiceProps) {}

  /**
   * Crée une Invoice (état initial `draft`). Calcule subtotal, TVA,
   * TTC et QR reference. Les `lines[].totalHtRappen` doivent être
   * cohérents avec `quantityCentiunits × unitPriceRappen / 100`
   * (vérifié ici).
   */
  static create(input: CreateInvoiceInput): Invoice {
    if (input.lines.length === 0) {
      throw new DomainError('invalid_invoice', 'lines vide');
    }
    if (input.vatRateBp < 0 || input.vatRateBp > 10000) {
      throw new DomainError(
        'invalid_vat_rate',
        `vatRateBp hors [0, 10000]: ${String(input.vatRateBp)}`,
      );
    }
    // Vérifie cohérence des totaux par ligne
    for (const line of input.lines) {
      if (line.quantityCentiunits <= 0) {
        throw new DomainError('invalid_line', `quantityCentiunits doit être > 0: ${line.label}`);
      }
      if (line.unitPriceRappen <= 0n) {
        throw new DomainError('invalid_line', `unitPriceRappen doit être > 0: ${line.label}`);
      }
      const expected = (BigInt(line.quantityCentiunits) * line.unitPriceRappen) / 100n;
      if (expected !== line.totalHtRappen) {
        throw new DomainError(
          'invalid_line',
          `totalHtRappen incohérent pour ${line.label}: attendu ${expected.toString()}, reçu ${line.totalHtRappen.toString()}`,
        );
      }
    }

    const subtotal = input.lines.reduce((sum, l) => sum + l.totalHtRappen, 0n);
    const vat = (subtotal * BigInt(input.vatRateBp)) / 10000n;
    const ttc = subtotal + vat;

    const invoiceNumber = `${input.agencyCode.toUpperCase()}-${String(input.year)}-${String(input.sequentialNumber).padStart(4, '0')}`;
    const qrRef = buildInterimQrReference({
      agencyCode: input.agencyCode,
      year: input.year,
      invoiceNumber: input.sequentialNumber,
      clientCode: input.clientCode,
    });

    const dueDate = new Date(
      input.issueDate.getTime() + (input.dueInDays ?? DEFAULT_DUE_DAYS) * 86400_000,
    );

    return new Invoice({
      id: input.id,
      agencyId: input.agencyId,
      clientId: input.clientId,
      invoiceNumber,
      qrReference: qrRef,
      issueDate: input.issueDate,
      dueDate,
      periodFromIso: input.periodFromIso,
      periodToIso: input.periodToIso,
      lines: input.lines,
      subtotalHtRappen: subtotal,
      vatRateBp: input.vatRateBp,
      vatAmountRappen: vat,
      totalTtcRappen: ttc,
      state: 'draft',
      stateChangedAt: input.issueDate,
    });
  }

  static fromPersistence(props: InvoiceProps): Invoice {
    return new Invoice(props);
  }

  get id(): InvoiceId {
    return this.state.id;
  }
  get agencyId(): AgencyId {
    return this.state.agencyId;
  }
  get currentState(): InvoiceState {
    return this.state.state;
  }
  get totalTtcRappen(): bigint {
    return this.state.totalTtcRappen;
  }
  get qrReference(): string {
    return this.state.qrReference;
  }
  get invoiceNumber(): string {
    return this.state.invoiceNumber;
  }

  toSnapshot(): InvoiceProps {
    return this.state;
  }

  /** Émet la facture (draft → emitted). Appelé après génération PDF + envoi email. */
  emit(at: Date): void {
    this.transition('emitted', at);
    this.state = { ...this.state, emittedAt: at };
  }

  /** Marque payée (emitted → paid). Appelé par A5.8 réconciliation camt.053. */
  markPaid(at: Date): void {
    this.transition('paid', at);
    this.state = { ...this.state, paidAt: at };
  }

  /** Annule (draft | emitted → cancelled). */
  cancel(at: Date): void {
    if (TERMINAL.has(this.state.state)) {
      throw new InvoiceAlreadyTerminal(this.state.state);
    }
    this.transition('cancelled', at);
    this.state = { ...this.state, cancelledAt: at };
  }

  private transition(to: InvoiceState, at: Date): void {
    const allowed = TRANSITIONS.get(this.state.state);
    if (!allowed?.has(to)) {
      throw new InvalidInvoiceTransition(this.state.state, to);
    }
    this.state = { ...this.state, state: to, stateChangedAt: at };
  }
}
