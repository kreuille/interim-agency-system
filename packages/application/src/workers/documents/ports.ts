import type { WorkerDocumentType } from '@interim/domain';

export interface UploadedBlob {
  readonly fileKey: string;
  readonly sizeBytes: number;
  readonly mimeType: string;
}

export interface ObjectStorage {
  putObject(input: {
    readonly agencyId: string;
    readonly workerId: string;
    readonly docType: WorkerDocumentType;
    readonly mimeType: string;
    readonly body: Buffer;
  }): Promise<UploadedBlob>;
  getSignedDownloadUrl(fileKey: string, ttlSeconds: number): Promise<string>;
  deleteObject(fileKey: string): Promise<void>;
}

export type AntivirusVerdict = 'clean' | 'infected';

export interface AntivirusScanner {
  scan(body: Buffer): Promise<AntivirusVerdict>;
}

/**
 * Demande de scan asynchrone. Le producteur (UploadDocumentUseCase) enqueue
 * une requête ; le consommateur (ScanWorker côté apps/worker) la dépile, lance
 * le scan ClamAV via {@link AntivirusScanner}, et appelle {@link ApplyScanResultUseCase}.
 *
 * En dev/test, l'implémentation in-memory `InlineScanQueue` exécute le scan
 * synchroniquement pour conserver l'ergonomie des tests.
 */
export interface ScanQueue {
  enqueue(request: ScanRequest): Promise<void>;
}

export interface ScanRequest {
  readonly documentId: string;
  readonly agencyId: string;
  readonly workerId: string;
  readonly fileKey: string;
}

/**
 * Métadonnée brute extraite du document par OCR (best-effort, optionnel).
 * Voir DETTE-022 — pour l'instant, NoOpOcrExtractor renvoie toujours undefined.
 */
export interface OcrExtractor {
  extractDates(input: { mimeType: string; body: Buffer }): Promise<{ expiresAt?: Date }>;
}

export type DocumentAuditKind =
  | 'DocumentUploaded'
  | 'DocumentScanned'
  | 'DocumentValidated'
  | 'DocumentRejected'
  | 'DocumentArchived';

export interface DocumentAuditEntry {
  readonly kind: DocumentAuditKind;
  readonly agencyId: string;
  readonly documentId: string;
  readonly workerId: string;
  readonly actorUserId?: string;
  readonly diff: Record<string, unknown>;
  readonly occurredAt: Date;
}

export interface DocumentAuditLogger {
  record(entry: DocumentAuditEntry): Promise<void>;
}
