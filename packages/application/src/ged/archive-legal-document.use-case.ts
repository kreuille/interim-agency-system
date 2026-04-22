import { createHash, randomUUID } from 'node:crypto';
import {
  computeRetentionUntil,
  LegalArchiveEntry,
  type AgencyId,
  type LegalArchiveRepository,
  type LegalCategory,
} from '@interim/domain';
import type { Clock, Result } from '@interim/shared';
import type { LegalArchiveStorage } from './legal-archive-ports.js';

/**
 * Archive un document légal dans la GED.
 *
 * Flux :
 *   1. Calcule la rétention selon la catégorie (`computeRetentionUntil`).
 *   2. Idempotence : si une entrée existe déjà pour
 *      `(category, referenceEntityType, referenceEntityId)`, renvoie-la
 *      sans rien réécrire (évite double archivage si webhook rejoué).
 *   3. Stocke le blob via `LegalArchiveStorage.putImmutable` (active
 *      object-lock côté GCS jusqu'à `retentionUntil`).
 *   4. Crée l'entrée domain `LegalArchiveEntry` (immutable).
 *   5. Persiste via `LegalArchiveRepository.insert`.
 *
 * Le hash SHA-256 calculé localement DOIT correspondre à celui retourné
 * par le storage (sinon corruption en transit → erreur).
 */

export type ArchiveLegalDocumentErrorKind =
  | 'invalid_input'
  | 'storage_failed'
  | 'integrity_check_failed'
  | 'retention_calc_failed';

export class ArchiveLegalDocumentError extends Error {
  constructor(
    public readonly kind: ArchiveLegalDocumentErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'ArchiveLegalDocumentError';
  }
}

export interface ArchiveLegalDocumentInput {
  readonly agencyId: AgencyId;
  readonly category: LegalCategory;
  readonly referenceEntityType: string;
  readonly referenceEntityId: string;
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  /** Pour worker_legal_doc — date de fin d'emploi, sinon ignoré. */
  readonly employmentEndedAt?: Date;
  readonly metadata?: Readonly<Record<string, string>>;
  /** Override de la factory d'ID pour tests (default: randomUUID). */
  readonly idFactory?: () => string;
}

export interface ArchiveLegalDocumentOutput {
  readonly entryId: string;
  readonly storageKey: string;
  readonly sha256Hex: string;
  readonly retentionUntil: Date;
  readonly alreadyExisted: boolean;
}

export class ArchiveLegalDocumentUseCase {
  constructor(
    private readonly repo: LegalArchiveRepository,
    private readonly storage: LegalArchiveStorage,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: ArchiveLegalDocumentInput,
  ): Promise<Result<ArchiveLegalDocumentOutput, ArchiveLegalDocumentError>> {
    if (input.bytes.length === 0) {
      return failure('invalid_input', 'bytes vide');
    }

    // Idempotence : un seul archive par (category, refType, refId).
    const existing = await this.repo.findByReference(
      input.agencyId,
      input.referenceEntityType,
      input.referenceEntityId,
    );
    const sameCategory = existing.find((e) => e.category === input.category);
    if (sameCategory) {
      const snap = sameCategory.toSnapshot();
      return {
        ok: true,
        value: {
          entryId: snap.id,
          storageKey: snap.storageKey,
          sha256Hex: snap.sha256Hex,
          retentionUntil: snap.retentionUntil,
          alreadyExisted: true,
        },
      };
    }

    const archivedAt = this.clock.now();

    // Calcule la rétention en amont pour la passer au storage (object-lock).
    let retentionUntil: Date;
    try {
      retentionUntil = computeRetentionUntil({
        category: input.category,
        archivedAt,
        ...(input.employmentEndedAt ? { employmentEndedAt: input.employmentEndedAt } : {}),
      });
    } catch (err) {
      return failure(
        'retention_calc_failed',
        err instanceof Error ? err.message : 'unknown_retention_error',
      );
    }

    const localSha = sha256Hex(input.bytes);

    let stored;
    try {
      stored = await this.storage.putImmutable({
        agencyId: input.agencyId,
        category: input.category,
        referenceEntityType: input.referenceEntityType,
        referenceEntityId: input.referenceEntityId,
        bytes: input.bytes,
        mimeType: input.mimeType,
        retentionUntil,
        ...(input.metadata ? { metadata: input.metadata } : {}),
      });
    } catch (err) {
      return failure(
        'storage_failed',
        err instanceof Error ? err.message : 'unknown_storage_error',
      );
    }

    if (stored.sha256Hex !== localSha) {
      return failure(
        'integrity_check_failed',
        `SHA mismatch: local=${localSha} storage=${stored.sha256Hex}`,
      );
    }

    const entry = LegalArchiveEntry.create({
      id: (input.idFactory ?? randomUUID)(),
      agencyId: input.agencyId,
      category: input.category,
      referenceEntityType: input.referenceEntityType,
      referenceEntityId: input.referenceEntityId,
      storageKey: stored.storageKey,
      sha256Hex: stored.sha256Hex,
      sizeBytes: stored.sizeBytes,
      mimeType: input.mimeType,
      archivedAt,
      ...(input.employmentEndedAt ? { employmentEndedAt: input.employmentEndedAt } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    });
    await this.repo.insert(entry);

    return {
      ok: true,
      value: {
        entryId: entry.id,
        storageKey: stored.storageKey,
        sha256Hex: stored.sha256Hex,
        retentionUntil,
        alreadyExisted: false,
      },
    };
  }
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function failure(
  kind: ArchiveLegalDocumentErrorKind,
  message: string,
): { readonly ok: false; readonly error: ArchiveLegalDocumentError } {
  return { ok: false, error: new ArchiveLegalDocumentError(kind, message) };
}
