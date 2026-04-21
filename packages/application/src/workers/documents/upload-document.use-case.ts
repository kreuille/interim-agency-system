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
  AntivirusScanner,
  DocumentAuditKind,
  DocumentAuditLogger,
  ObjectStorage,
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
  readonly scanStatus: 'pending' | 'clean' | 'infected';
}

export class UploadDocumentUseCase {
  constructor(
    private readonly workers: WorkerRepository,
    private readonly docs: DocumentRepository,
    private readonly storage: ObjectStorage,
    private readonly scanner: AntivirusScanner,
    private readonly audit: DocumentAuditLogger,
    private readonly clock: Clock,
    private readonly idFactory: () => string,
  ) {}

  async execute(input: UploadDocumentInput): Promise<Result<UploadDocumentOutput, WorkerNotFound>> {
    const worker = await this.workers.findById(input.agencyId, asStaffId(input.workerId));
    if (!worker) {
      return { ok: false, error: new WorkerNotFound(input.workerId) };
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
        ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
      },
      this.clock,
    );
    await this.docs.save(doc);
    await this.recordAudit('DocumentUploaded', doc.id, input, { type: input.type });

    const verdict = await this.scanner.scan(input.body);
    doc.markScanned(verdict === 'clean', this.clock);
    await this.docs.save(doc);
    await this.recordAudit('DocumentScanned', doc.id, input, { verdict });

    if (verdict === 'infected') {
      await this.storage.deleteObject(blob.fileKey);
    }

    return {
      ok: true,
      value: {
        documentId: doc.id,
        scanStatus: verdict === 'clean' ? 'clean' : 'infected',
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
