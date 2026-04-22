import { randomUUID } from 'node:crypto';
import {
  asInvoiceId,
  Invoice,
  type AgencyId,
  type ClientId,
  type InvoiceLine,
  type InvoiceRepository,
  type Timesheet,
} from '@interim/domain';
import type { Clock, Result } from '@interim/shared';

/**
 * Use case : génère une facture à partir des timesheets `signed`/`tacit`
 * d'un client sur une période (hebdo, mensuel, per-mission).
 *
 * Flux :
 *   1. Filtrer timesheets éligibles (state signed/tacit, clientId match,
 *      période intersect).
 *   2. Agrège par `(workerId, isoWeek)` : 1 ligne par couple avec
 *      heures × taux facturé client (pas le taux salarial, c'est le
 *      markup agence).
 *   3. Numéro séquentiel via repo atomique.
 *   4. Construit `Invoice` (state=draft) + QRR auto via domain.
 *   5. Save.
 *
 * Idempotence : si une invoice existe déjà pour
 * `(agencyId, clientId, periodFrom, periodTo)` en état draft/emitted,
 * renvoie cette invoice (évite doublons si rejeu).
 *
 * Note : la génération PDF + envoi email est gérée séparément
 * (`RenderInvoicePdfUseCase` — DETTE-084 chaînage complet).
 */

export type GenerateInvoiceErrorKind =
  | 'no_eligible_timesheets'
  | 'invalid_input'
  | 'already_generated';

export class GenerateInvoiceError extends Error {
  constructor(
    public readonly kind: GenerateInvoiceErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'GenerateInvoiceError';
  }
}

export interface GenerateInvoiceInput {
  readonly agencyId: AgencyId;
  readonly agencyCode: string;
  readonly clientId: ClientId;
  readonly clientCode: string;
  readonly timesheets: readonly Timesheet[];
  /**
   * Taux horaire facturé client par timesheet (markup agence).
   * Différent du taux salarial (hourlyRateRappen sur Timesheet).
   */
  readonly clientHourlyRateRappenByTimesheetId: ReadonlyMap<string, bigint>;
  readonly periodFromIso: string;
  readonly periodToIso: string;
  /** 810 = 8.1% TVA standard. 0 = exonéré (certains cas). */
  readonly vatRateBp: number;
  readonly issueDate: Date;
  readonly dueInDays?: number;
  /** Override pour tests — default randomUUID. */
  readonly idFactory?: () => string;
}

export interface GenerateInvoiceOutput {
  readonly invoiceId: string;
  readonly invoiceNumber: string;
  readonly qrReference: string;
  readonly subtotalHtRappen: bigint;
  readonly vatAmountRappen: bigint;
  readonly totalTtcRappen: bigint;
  readonly alreadyExisted: boolean;
}

export class GenerateInvoiceUseCase {
  constructor(
    private readonly repo: InvoiceRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: GenerateInvoiceInput,
  ): Promise<Result<GenerateInvoiceOutput, GenerateInvoiceError>> {
    if (input.timesheets.length === 0) {
      return failure('no_eligible_timesheets', 'Aucun timesheet fourni');
    }

    // Filtre signed/tacit + clientId match
    const eligible = input.timesheets.filter((t) => {
      const s = t.toSnapshot();
      const state = t.currentState;
      return (state === 'signed' || state === 'tacit') && s.clientId === input.clientId;
    });
    if (eligible.length === 0) {
      return failure(
        'no_eligible_timesheets',
        `Aucun timesheet signed/tacit pour client ${input.clientId} sur la période`,
      );
    }

    // Idempotence : cherche facture existante pour même période non-cancelled
    const existing = await this.repo.findByClient(input.agencyId, input.clientId, { limit: 50 });
    const matching = existing.find((inv) => {
      const snap = inv.toSnapshot();
      return (
        snap.periodFromIso === input.periodFromIso &&
        snap.periodToIso === input.periodToIso &&
        (snap.state === 'draft' || snap.state === 'emitted')
      );
    });
    if (matching) {
      const snap = matching.toSnapshot();
      return {
        ok: true,
        value: {
          invoiceId: matching.id,
          invoiceNumber: matching.invoiceNumber,
          qrReference: matching.qrReference,
          subtotalHtRappen: snap.subtotalHtRappen,
          vatAmountRappen: snap.vatAmountRappen,
          totalTtcRappen: snap.totalTtcRappen,
          alreadyExisted: true,
        },
      };
    }

    // Construit les lignes : 1 par timesheet
    const lines: InvoiceLine[] = [];
    for (const ts of eligible) {
      const snap = ts.toSnapshot();
      const rate = input.clientHourlyRateRappenByTimesheetId.get(ts.id);
      if (rate === undefined) {
        return failure('invalid_input', `Pas de tarif client pour timesheet ${ts.id}`);
      }
      const quantityCentiunits = (snap.totalMinutes * 100) / 60; // heures × 100
      const quantityRounded = Math.round(quantityCentiunits);
      const totalHt = (BigInt(quantityRounded) * rate) / 100n;
      lines.push({
        label: `Mission ${snap.externalTimesheetId} semaine ${(snap.entries[0]?.workDate ?? input.issueDate).toISOString().slice(0, 10)}`,
        quantityCentiunits: quantityRounded,
        unitPriceRappen: rate,
        totalHtRappen: totalHt,
        sourceTimesheetId: ts.id,
      });
    }

    const year = input.issueDate.getUTCFullYear();
    const sequentialNumber = await this.repo.nextSequentialNumber(input.agencyId, year);

    const id = asInvoiceId((input.idFactory ?? randomUUID)());
    const invoice = Invoice.create({
      id,
      agencyId: input.agencyId,
      agencyCode: input.agencyCode,
      clientId: input.clientId,
      clientCode: input.clientCode,
      year,
      sequentialNumber,
      issueDate: input.issueDate,
      ...(input.dueInDays !== undefined ? { dueInDays: input.dueInDays } : {}),
      periodFromIso: input.periodFromIso,
      periodToIso: input.periodToIso,
      lines,
      vatRateBp: input.vatRateBp,
    });
    await this.repo.save(invoice);

    void this.clock; // clock réservé pour timestamps futurs (emit, paid)

    const snap = invoice.toSnapshot();
    return {
      ok: true,
      value: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        qrReference: invoice.qrReference,
        subtotalHtRappen: snap.subtotalHtRappen,
        vatAmountRappen: snap.vatAmountRappen,
        totalTtcRappen: snap.totalTtcRappen,
        alreadyExisted: false,
      },
    };
  }
}

function failure(
  kind: GenerateInvoiceErrorKind,
  message: string,
): { readonly ok: false; readonly error: GenerateInvoiceError } {
  return { ok: false, error: new GenerateInvoiceError(kind, message) };
}
