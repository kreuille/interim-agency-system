import type { PayslipDocument } from '@interim/domain';

/**
 * Port renderer PDF du bulletin (pattern identique à
 * `ContractPdfRenderer`).
 *
 * Implémentations :
 *   - Production : `PdfLibPayslipRenderer` (pdf-lib pure JS,
 *     déterministe). Cf. apps/api/src/infrastructure/pdf/payslip-renderer.ts.
 *   - Tests : `StubPayslipPdfRenderer` (JSON sérialisé + sha256).
 */
export interface PayslipPdfRenderer {
  render(doc: PayslipDocument): Promise<RenderedPayslipPdf>;
}

export interface RenderedPayslipPdf {
  readonly bytes: Uint8Array;
  readonly sha256Hex: string;
}

/**
 * Storage chiffré pour les bulletins (GCS CMEK production, in-memory
 * tests). Conservation 5 ans (CO 958f), à archiver en GED via
 * `ArchiveLegalDocumentUseCase` (catégorie `payslip`).
 */
export interface PayslipPdfStorage {
  store(input: StorePayslipPdfInput): Promise<{ readonly key: string }>;
  getDownloadUrl(key: string, ttlSeconds?: number): Promise<string>;
}

export interface StorePayslipPdfInput {
  readonly agencyId: string;
  readonly workerId: string;
  readonly isoWeek: string;
  readonly bytes: Uint8Array;
  readonly sha256Hex: string;
}
