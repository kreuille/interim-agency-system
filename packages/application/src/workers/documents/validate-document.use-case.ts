import type { AgencyId, DocumentRepository } from '@interim/domain';
import { DocumentNotFound } from '@interim/domain';
import type { Clock, Result } from '@interim/shared';
import type { DocumentAuditLogger } from './ports.js';

export interface ValidateDocumentInput {
  readonly agencyId: AgencyId;
  readonly documentId: string;
  readonly actorUserId: string;
}

export class ValidateDocumentUseCase {
  constructor(
    private readonly docs: DocumentRepository,
    private readonly audit: DocumentAuditLogger,
    private readonly clock: Clock,
  ) {}

  async execute(input: ValidateDocumentInput): Promise<Result<void, DocumentNotFound>> {
    const doc = await this.docs.findById(input.agencyId, input.documentId);
    if (!doc) return { ok: false, error: new DocumentNotFound(input.documentId) };

    doc.validate(input.actorUserId, this.clock);
    await this.docs.save(doc);

    await this.audit.record({
      kind: 'DocumentValidated',
      agencyId: input.agencyId,
      documentId: input.documentId,
      workerId: doc.workerId,
      actorUserId: input.actorUserId,
      diff: { status: 'VALID' },
      occurredAt: this.clock.now(),
    });

    return { ok: true, value: undefined };
  }
}
