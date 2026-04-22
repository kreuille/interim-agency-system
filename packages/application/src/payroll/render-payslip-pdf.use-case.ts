import {
  buildPayslipDocument,
  type PayslipAgencyInfo,
  type PayslipBreakdown,
  type PayslipWorkerLegal,
} from '@interim/domain';
import type { Result } from '@interim/shared';
import type { PayslipPdfRenderer, PayslipPdfStorage } from './payslip-pdf-ports.js';

/**
 * Use case : rend le PDF d'un bulletin de paie + stocke en storage
 * chiffré + renvoie clé + hash. À chaîner avec
 * `ArchiveLegalDocumentUseCase` (catégorie `payslip`, rétention 5 ans
 * CO 958f) et notifier (SMS/email) — DETTE-073 pour le pipeline complet.
 *
 * Idempotence : si on rejoue avec le même `(agencyId, workerId, isoWeek)`,
 * on génère un nouveau PDF avec le même contenu (déterministe via
 * `setCreationDate(0)` côté renderer pdf-lib). Le storage peut
 * dédupliquer sur sha256Hex (le storage GCS supporte ça nativement).
 */

export type RenderPayslipPdfErrorKind = 'render_failed' | 'storage_failed';

export class RenderPayslipPdfError extends Error {
  constructor(
    public readonly kind: RenderPayslipPdfErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'RenderPayslipPdfError';
  }
}

export interface RenderPayslipPdfInput {
  readonly agencyId: string;
  readonly breakdown: PayslipBreakdown;
  readonly agency: PayslipAgencyInfo;
  readonly worker: PayslipWorkerLegal;
  readonly periodFromIso: string;
  readonly periodToIso: string;
  readonly clientName?: string;
  readonly missionTitle?: string;
}

export interface RenderPayslipPdfOutput {
  readonly storageKey: string;
  readonly sha256Hex: string;
  readonly bytesLength: number;
}

export class RenderPayslipPdfUseCase {
  constructor(
    private readonly renderer: PayslipPdfRenderer,
    private readonly storage: PayslipPdfStorage,
  ) {}

  async execute(
    input: RenderPayslipPdfInput,
  ): Promise<Result<RenderPayslipPdfOutput, RenderPayslipPdfError>> {
    const doc = buildPayslipDocument({
      breakdown: input.breakdown,
      agency: input.agency,
      worker: input.worker,
      periodFromIso: input.periodFromIso,
      periodToIso: input.periodToIso,
      ...(input.clientName ? { clientName: input.clientName } : {}),
      ...(input.missionTitle ? { missionTitle: input.missionTitle } : {}),
    });

    let rendered;
    try {
      rendered = await this.renderer.render(doc);
    } catch (err) {
      return failure('render_failed', err instanceof Error ? err.message : 'unknown');
    }

    let stored;
    try {
      stored = await this.storage.store({
        agencyId: input.agencyId,
        workerId: input.breakdown.workerId,
        isoWeek: input.breakdown.isoWeek,
        bytes: rendered.bytes,
        sha256Hex: rendered.sha256Hex,
      });
    } catch (err) {
      return failure('storage_failed', err instanceof Error ? err.message : 'unknown');
    }

    return {
      ok: true,
      value: {
        storageKey: stored.key,
        sha256Hex: rendered.sha256Hex,
        bytesLength: rendered.bytes.length,
      },
    };
  }
}

function failure(
  kind: RenderPayslipPdfErrorKind,
  message: string,
): { readonly ok: false; readonly error: RenderPayslipPdfError } {
  return { ok: false, error: new RenderPayslipPdfError(kind, message) };
}
