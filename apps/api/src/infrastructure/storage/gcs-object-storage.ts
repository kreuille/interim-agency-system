import { Storage, type Bucket } from '@google-cloud/storage';
import type { ObjectStorage, UploadedBlob } from '@interim/application';
import type { WorkerDocumentType } from '@interim/domain';

export interface GcsConfig {
  /** Nom du bucket GCS (ex. `interim-documents-prod`). Région `europe-west6`. */
  readonly bucketName: string;
  /**
   * Chemin de la clé KMS pour le chiffrement CMEK :
   * `projects/<id>/locations/europe-west6/keyRings/<ring>/cryptoKeys/<key>`
   * Recommandé pour conformité nLPD (CLAUDE.md §3.4 + ADR-0002).
   */
  readonly kmsKeyName?: string;
  /** Project GCP (lu depuis ADC si absent). */
  readonly projectId?: string;
}

/**
 * Adapter GCS Cloud Storage avec :
 *  - chiffrement CMEK via `kmsKeyName` (clé Cloud KMS gérée par nous).
 *  - URLs signées V4 pour téléchargement temporaire (15 min par défaut).
 *  - Authentification via Application Default Credentials (Workload Identity
 *    Federation depuis GitHub Actions ou service account local).
 *
 * Utilisation :
 *
 * ```ts
 * const storage = new GcsObjectStorage({
 *   bucketName: 'interim-documents-prod',
 *   kmsKeyName: 'projects/.../europe-west6/keyRings/.../cryptoKeys/...',
 * });
 * ```
 *
 * Le wire dans `apps/api/src/main.ts` se fait conditionnellement via
 * `OBJECT_STORAGE_PROVIDER=gcs` ; en dev local on garde `InMemoryObjectStorage`.
 */
export class GcsObjectStorage implements ObjectStorage {
  private readonly bucket: Bucket;

  constructor(private readonly config: GcsConfig) {
    const storage = new Storage(
      config.projectId !== undefined ? { projectId: config.projectId } : {},
    );
    this.bucket = storage.bucket(config.bucketName);
  }

  async putObject(input: {
    agencyId: string;
    workerId: string;
    docType: WorkerDocumentType;
    mimeType: string;
    body: Buffer;
  }): Promise<UploadedBlob> {
    const fileKey = buildFileKey(input);
    const file = this.bucket.file(fileKey);
    await file.save(input.body, {
      contentType: input.mimeType,
      resumable: false,
      metadata: {
        contentType: input.mimeType,
        metadata: {
          agencyId: input.agencyId,
          workerId: input.workerId,
          docType: input.docType,
        },
      },
      ...(this.config.kmsKeyName !== undefined ? { kmsKeyName: this.config.kmsKeyName } : {}),
    });
    return {
      fileKey,
      sizeBytes: input.body.byteLength,
      mimeType: input.mimeType,
    };
  }

  async getSignedDownloadUrl(fileKey: string, ttlSeconds: number): Promise<string> {
    const [url] = await this.bucket.file(fileKey).getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + ttlSeconds * 1000,
    });
    return url;
  }

  async deleteObject(fileKey: string): Promise<void> {
    await this.bucket.file(fileKey).delete({ ignoreNotFound: true });
  }
}

function buildFileKey(input: {
  agencyId: string;
  workerId: string;
  docType: WorkerDocumentType;
}): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${input.agencyId}/${input.workerId}/${input.docType}/${String(Date.now())}-${random}`;
}
