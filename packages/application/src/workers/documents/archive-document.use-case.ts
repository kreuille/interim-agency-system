import type { AgencyId, DocumentRepository } from '@interim/domain';
import { DocumentNotFound } from '@interim/domain';
import type { Clock, Result } from '@interim/shared';
import type { DocumentAuditLogger, ObjectStorage } from './ports.js';

export interface ArchiveDocumentInput {
  readonly agencyId: AgencyId;
  readonly documentId: string;
  readonly actorUserId: string;
}

export class ArchiveDocumentUseCase {
  constructor(
    private readonly docs: DocumentRepository,
    private readonly storage: ObjectStorage,
    private readonly audit: DocumentAuditLogger,
    private readonly clock: Clock,
  ) {}

  async execute(input: ArchiveDocumentInput): Promise<Result<void, DocumentNotFound>> {
    const doc = await this.docs.findById(input.agencyId, input.documentId);
    if (!doc) return { ok: false, error: new DocumentNotFound(input.documentId) };

    const fileKey = doc.fileKey;
    doc.archive(this.clock);
    await this.docs.save(doc);
    await this.storage.deleteObject(fileKey);

    await this.audit.record({
      kind: 'DocumentArchived',
      agencyId: input.agencyId,
      documentId: input.documentId,
      workerId: doc.workerId,
      actorUserId: input.actorUserId,
      diff: { fileKey },
      occurredAt: this.clock.now(),
    });

    return { ok: true, value: undefined };
  }
}
