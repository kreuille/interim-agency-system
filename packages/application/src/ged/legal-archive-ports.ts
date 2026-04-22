import type { AgencyId, LegalCategory } from '@interim/domain';

/**
 * Storage immutable pour les blobs d'archive légale.
 *
 * Implémentations attendues :
 *   - Production : GCS bucket avec **Object Lock COMPLIANCE mode** activé
 *     (immuabilité au niveau objet, ni l'admin ni Google ne peut
 *     supprimer avant `retention_until`). Cf. ADR-0006 (à rédiger).
 *   - Tests : `InMemoryLegalArchiveStorage` qui refuse explicitement
 *     toute tentative de suppression avant `retention_until`.
 *
 * **Différence avec `ObjectStorage`** (cf. workers/documents/ports) :
 * ce storage rejette `delete()` tant que la rétention n'est pas
 * dépassée — c'est un store *Write-Once-Read-Many*. L'`ObjectStorage`
 * standard est utilisé pour les documents workers vivants (permis, etc.)
 * où on doit pouvoir corriger / re-uploader.
 */
export interface LegalArchiveStorage {
  /**
   * Stocke un blob immutable. Renvoie une clé opaque + métadonnées.
   * Doit configurer le `retention_until` côté objet (object-lock).
   */
  putImmutable(input: PutImmutableInput): Promise<PutImmutableOutput>;

  /**
   * Génère une URL signée pour téléchargement temporaire (ex. consultation
   * juriste, contrôle SECO). TTL par défaut : 15 min.
   */
  getSignedDownloadUrl(storageKey: string, ttlSeconds: number): Promise<string>;

  /**
   * Supprime un blob. **Doit lever** si la rétention n'est pas dépassée.
   * `now` permet aux tests d'injecter un instant.
   */
  purge(storageKey: string, now: Date): Promise<void>;
}

export interface PutImmutableInput {
  readonly agencyId: AgencyId;
  readonly category: LegalCategory;
  readonly referenceEntityType: string;
  readonly referenceEntityId: string;
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  /** Date jusqu'à laquelle l'objet doit rester immutable. */
  readonly retentionUntil: Date;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface PutImmutableOutput {
  readonly storageKey: string;
  readonly sizeBytes: number;
  readonly sha256Hex: string;
}

/**
 * Erreur levée par le storage si on tente de supprimer un blob
 * encore sous rétention. **Defense in depth** : le use case doit
 * déjà refuser, mais le storage refuse aussi (au cas où l'app serait
 * compromise).
 */
export class RetentionViolationError extends Error {
  constructor(
    public readonly storageKey: string,
    public readonly retentionUntil: Date,
  ) {
    super(
      `Storage refuse purge: ${storageKey} sous rétention jusqu'à ${retentionUntil.toISOString()}`,
    );
    this.name = 'RetentionViolationError';
  }
}

/**
 * Audit log dédié aux **accès** aux archives légales (download).
 * nLPD art. 12 : journaliser qui consulte les données personnelles
 * pendant la durée de rétention. Conservation 3 ans minimum.
 */
export interface LegalArchiveAccessLogger {
  recordAccess(input: LegalArchiveAccessEntry): Promise<void>;
}

export interface LegalArchiveAccessEntry {
  readonly agencyId: AgencyId;
  readonly archiveEntryId: string;
  readonly storageKey: string;
  readonly category: LegalCategory;
  readonly actorUserId: string;
  readonly actorIp?: string;
  readonly purpose: AccessPurpose;
  readonly occurredAt: Date;
}

/**
 * Motif d'accès — exigé pour traçabilité (audit DPO + contrôle SECO).
 * `seco_audit` doit être visible à part dans les rapports compliance.
 */
export const ACCESS_PURPOSES = [
  'internal_review',
  'worker_request',
  'seco_audit',
  'tax_audit',
  'legal_dispute',
] as const;
export type AccessPurpose = (typeof ACCESS_PURPOSES)[number];
