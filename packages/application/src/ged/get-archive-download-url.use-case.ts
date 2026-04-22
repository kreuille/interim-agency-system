import type { AgencyId, LegalArchiveRepository } from '@interim/domain';
import type { Clock, Result } from '@interim/shared';
import type {
  AccessPurpose,
  LegalArchiveAccessLogger,
  LegalArchiveStorage,
} from './legal-archive-ports.js';

/**
 * Génère une URL signée de téléchargement pour une archive légale, et
 * journalise l'accès (nLPD art. 12).
 *
 * Chaque appel produit un nouvel enregistrement dans `LegalArchiveAccessLogger`
 * (conservation 3 ans). La traçabilité doit persister **même** si le
 * téléchargement échoue côté client — on log avant de renvoyer l'URL.
 *
 * TTL par défaut : 900s (15 min). Capé à 1h pour éviter les URLs
 * qui traînent (CLAUDE.md §5).
 */

export type GetArchiveDownloadUrlErrorKind = 'archive_not_found' | 'storage_failed';

export class GetArchiveDownloadUrlError extends Error {
  constructor(
    public readonly kind: GetArchiveDownloadUrlErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'GetArchiveDownloadUrlError';
  }
}

export interface GetArchiveDownloadUrlInput {
  readonly agencyId: AgencyId;
  readonly archiveEntryId: string;
  readonly actorUserId: string;
  readonly actorIp?: string;
  readonly purpose: AccessPurpose;
  readonly ttlSeconds?: number;
}

export interface GetArchiveDownloadUrlOutput {
  readonly url: string;
  readonly expiresAt: Date;
  readonly sha256Hex: string;
}

const DEFAULT_TTL_SECONDS = 900; // 15 min
const MAX_TTL_SECONDS = 3600; // 1 h

export class GetArchiveDownloadUrlUseCase {
  constructor(
    private readonly repo: LegalArchiveRepository,
    private readonly storage: LegalArchiveStorage,
    private readonly logger: LegalArchiveAccessLogger,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: GetArchiveDownloadUrlInput,
  ): Promise<Result<GetArchiveDownloadUrlOutput, GetArchiveDownloadUrlError>> {
    const entry = await this.repo.findById(input.agencyId, input.archiveEntryId);
    if (!entry) {
      return failure('archive_not_found', `Archive ${input.archiveEntryId} introuvable`);
    }

    const ttl = clampTtl(input.ttlSeconds);
    let url: string;
    try {
      url = await this.storage.getSignedDownloadUrl(entry.storageKey, ttl);
    } catch (err) {
      return failure('storage_failed', err instanceof Error ? err.message : 'unknown');
    }

    const now = this.clock.now();
    await this.logger.recordAccess({
      agencyId: input.agencyId,
      archiveEntryId: entry.id,
      storageKey: entry.storageKey,
      category: entry.category,
      actorUserId: input.actorUserId,
      ...(input.actorIp ? { actorIp: input.actorIp } : {}),
      purpose: input.purpose,
      occurredAt: now,
    });

    return {
      ok: true,
      value: {
        url,
        expiresAt: new Date(now.getTime() + ttl * 1000),
        sha256Hex: entry.sha256Hex,
      },
    };
  }
}

function clampTtl(ttl: number | undefined): number {
  if (ttl === undefined || ttl <= 0) return DEFAULT_TTL_SECONDS;
  return Math.min(ttl, MAX_TTL_SECONDS);
}

function failure(
  kind: GetArchiveDownloadUrlErrorKind,
  message: string,
): { readonly ok: false; readonly error: GetArchiveDownloadUrlError } {
  return { ok: false, error: new GetArchiveDownloadUrlError(kind, message) };
}
