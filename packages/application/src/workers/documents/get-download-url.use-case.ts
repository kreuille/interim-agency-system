import type { AgencyId, DocumentRepository } from '@interim/domain';
import { DocumentNotFound } from '@interim/domain';
import type { Result } from '@interim/shared';
import type { ObjectStorage } from './ports.js';

export interface GetDownloadUrlInput {
  readonly agencyId: AgencyId;
  readonly documentId: string;
  readonly ttlSeconds?: number;
}

const DEFAULT_TTL = 15 * 60; // 15 min

export class GetDownloadUrlUseCase {
  constructor(
    private readonly docs: DocumentRepository,
    private readonly storage: ObjectStorage,
  ) {}

  async execute(
    input: GetDownloadUrlInput,
  ): Promise<Result<{ url: string; expiresInSeconds: number }, DocumentNotFound>> {
    const doc = await this.docs.findById(input.agencyId, input.documentId);
    if (!doc || doc.isArchived) {
      return { ok: false, error: new DocumentNotFound(input.documentId) };
    }

    const ttl = input.ttlSeconds ?? DEFAULT_TTL;
    const url = await this.storage.getSignedDownloadUrl(doc.fileKey, ttl);
    return { ok: true, value: { url, expiresInSeconds: ttl } };
  }
}
