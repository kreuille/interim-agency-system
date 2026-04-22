import type { DocumentRepository } from '@interim/domain';
import { DocumentNotFound, asAgencyId } from '@interim/domain';
import type { Clock, Result } from '@interim/shared';
import type { AntivirusVerdict, DocumentAuditLogger, ObjectStorage } from './ports.js';

export interface ApplyScanResultInput {
  readonly agencyId: string;
  readonly documentId: string;
  readonly verdict: AntivirusVerdict;
}

/**
 * Côté worker : applique le verdict du scan antivirus sur un document.
 * - clean → markScanned(true) → status PENDING_VALIDATION
 * - infected → markScanned(false) → status REJECTED + storage.deleteObject
 *
 * Idempotent : si le document est déjà sorti de PENDING_SCAN (rescan tardif),
 * l'opération est un no-op silencieux.
 */
export class ApplyScanResultUseCase {
  constructor(
    private readonly docs: DocumentRepository,
    private readonly storage: ObjectStorage,
    private readonly audit: DocumentAuditLogger,
    private readonly clock: Clock,
  ) {}

  async execute(input: ApplyScanResultInput): Promise<Result<void, DocumentNotFound>> {
    const doc = await this.docs.findById(asAgencyId(input.agencyId), input.documentId);
    if (!doc) return { ok: false, error: new DocumentNotFound(input.documentId) };

    if (doc.status !== 'PENDING_SCAN') {
      // déjà traité par un autre worker — idempotent
      return { ok: true, value: undefined };
    }

    const fileKey = doc.fileKey;
    doc.markScanned(input.verdict === 'clean', this.clock);
    await this.docs.save(doc);

    if (input.verdict === 'infected') {
      await this.storage.deleteObject(fileKey);
    }

    await this.audit.record({
      kind: 'DocumentScanned',
      agencyId: input.agencyId,
      documentId: input.documentId,
      workerId: doc.workerId,
      diff: { verdict: input.verdict },
      occurredAt: this.clock.now(),
    });

    return { ok: true, value: undefined };
  }
}
