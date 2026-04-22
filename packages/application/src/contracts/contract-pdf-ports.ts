import type { ContractDocument } from '@interim/domain';

/**
 * Port renderer PDF : prend un `ContractDocument` sémantique et produit
 * les bytes PDF + leur hash SHA-256.
 *
 * Implémentations possibles :
 *   - `PdfLibContractRenderer` (défaut, infra `apps/api/src/infrastructure/pdf/`)
 *   - Puppeteer + Chromium pour rendu HTML→PDF riche (reporté)
 */
export interface ContractPdfRenderer {
  render(doc: ContractDocument): Promise<RenderedContractPdf>;
}

export interface RenderedContractPdf {
  readonly bytes: Uint8Array;
  readonly sha256Hex: string;
}

/**
 * Storage pour les PDFs signés (ou en attente de signature) : GCS
 * chiffrement CMEK (cf. `docs/firebase-setup.md` ou adapter
 * `apps/api/src/infrastructure/storage/gcs-object-storage.ts`).
 *
 * Retourne une clé opaque (ex. `gs://bucket/contracts/{uuid}.pdf`) à
 * persister dans `MissionContract.signedPdfKey`.
 */
export interface ContractPdfStorage {
  store(input: StoreContractPdfInput): Promise<{ readonly key: string }>;
  /** Renvoie une URL signée (10 min) pour téléchargement ponctuel. */
  getDownloadUrl(key: string): Promise<string>;
}

export interface StoreContractPdfInput {
  readonly agencyId: string;
  readonly contractId: string;
  readonly reference: string;
  readonly bytes: Uint8Array;
  readonly sha256Hex: string;
}
