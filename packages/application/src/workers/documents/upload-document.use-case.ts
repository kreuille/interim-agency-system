import {
  asStaffId,
  WorkerDocument,
  WorkerNotFound,
  type AgencyId,
  type DocumentRepository,
  type WorkerDocumentType,
  type WorkerRepository,
} from '@interim/domain';
import type { Clock, Result } from '@interim/shared';
import type {
  DocumentAuditKind,
  DocumentAuditLogger,
  ObjectStorage,
  OcrExtractor,
  ScanQueue,
} from './ports.js';

export interface UploadDocumentInput {
  readonly agencyId: AgencyId;
  readonly workerId: string;
  readonly actorUserId?: string;
  readonly type: WorkerDocumentType;
  readonly mimeType: string;
  readonly body: Buffer;
  readonly issuedAt?: Date;
  readonly expiresAt?: Date;
}

export interface UploadDocumentOutput {
  readonly documentId: string;
  readonly scanStatus: 'pending';
}

/**
 * Flow d'upload :
 * 1. Verifier que le worker existe (cross-tenant safe via repo).
 * 2. (DETTE-022) Si `expiresAt` non fourni, tenter une extraction OCR best-effort.
 * 3. Pousser le blob sur l'Object Storage (chiffré CMEK en prod).
 * 4. Persister la WorkerDocument en `PENDING_SCAN`.
 * 5. Enqueue scan antivirus → traité asynchrone par le worker
 *    (DETTE-021 — `ApplyScanResultUseCase` côté consommateur).
 * 6. Renvoyer `documentId` + `scanStatus: pending`.
 */
export class UploadDocumentUseCase {
  constructor(
    private readonly workers: WorkerRepository,
    private readonly docs: DocumentRepository,
    private readonly storage: ObjectStorage,
    private readonly scanQueue: ScanQueue,
    private readonly ocr: OcrExtractor,
    private readonly audit: DocumentAuditLogger,
    private readonly clock: Clock,
    private readonly idFactory: () => string,
  ) {}

  async execute(input: UploadDocumentInput): Promise<Result<UploadDocumentOutput, WorkerNotFound>> {
    const worker = await this.workers.findById(input.agencyId, asStaffId(input.workerId));
    if (!worker) {
      return { ok: false, error: new WorkerNotFound(input.workerId) };
    }

    let resolvedExpiresAt = input.expiresAt;
    if (resolvedExpiresAt === undefined) {
      const ocrResult = await this.ocr.extractDates({
        mimeType: input.mimeType,
        body: input.body,
      });
      if (ocrResult.expiresAt) {
        resolvedExpiresAt = ocrResult.expiresAt;
      }
    }

    const blob = await this.storage.putObject({
      agencyId: input.agencyId,
      workerId: input.workerId,
      docType: input.type,
      mimeType: input.mimeType,
      body: input.body,
    });

    const docId = this.idFactory();
    const doc = WorkerDocument.create(
      {
        id: docId,
        agencyId: input.agencyId,
        workerId: asStaffId(input.workerId),
        type: input.type,
        fileKey: blob.fileKey,
        mimeType: blob.mimeType,
        sizeBytes: blob.sizeBytes,
        ...(input.issuedAt !== undefined ? { issuedAt: input.issuedAt } : {}),
        ...(resolvedExpiresAt !== undefined ? { expiresAt: resolvedExpiresAt } : {}),
      },
      this.clock,
    );
    await this.docs.save(doc);
    await this.recordAudit('DocumentUploaded', doc.id, input, {
      type: input.type,
      ocrExtractedExpiresAt:
        resolvedExpiresAt !== undefined && input.expiresAt === undefined
          ? resolvedExpiresAt.toISOString()
          : null,
    });

    await this.scanQueue.enqueue({
      documentId: doc.id,
      agencyId: input.agencyId,
      workerId: input.workerId,
      fileKey: blob.fileKey,
    });

    return {
      ok: true,
      value: {
        documentId: doc.id,
        scanStatus: 'pending',
      },
    };
  }

  private async recordAudit(
    kind: DocumentAuditKind,
    documentId: string,
    input: UploadDocumentInput,
    diff: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.record({
      kind,
      agencyId: input.agencyId,
      documentId,
      workerId: input.workerId,
      ...(input.actorUserId !== undefined ? { actorUserId: input.actorUserId } : {}),
      diff,
      occurredAt: this.clock.now(),
    });
  }
}
