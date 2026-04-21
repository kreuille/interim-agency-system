import type { WorkerDocumentType } from '@interim/domain';

export interface UploadedBlob {
  readonly fileKey: string;
  readonly sizeBytes: number;
  readonly mimeType: string;
}

export interface ObjectStorage {
  putObject(input: {
    readonly agencyId: string;
    readonly workerId: string;
    readonly docType: WorkerDocumentType;
    readonly mimeType: string;
    readonly body: Buffer;
  }): Promise<UploadedBlob>;
  getSignedDownloadUrl(fileKey: string, ttlSeconds: number): Promise<string>;
  deleteObject(fileKey: string): Promise<void>;
}

export type AntivirusVerdict = 'clean' | 'infected';

export interface AntivirusScanner {
  scan(body: Buffer): Promise<AntivirusVerdict>;
}

export type DocumentAuditKind =
  | 'DocumentUploaded'
  | 'DocumentScanned'
  | 'DocumentValidated'
  | 'DocumentRejected'
  | 'DocumentArchived';

export interface DocumentAuditEntry {
  readonly kind: DocumentAuditKind;
  readonly agencyId: string;
  readonly documentId: string;
  readonly workerId: string;
  readonly actorUserId?: string;
  readonly diff: Record<string, unknown>;
  readonly occurredAt: Date;
}

export interface DocumentAuditLogger {
  record(entry: DocumentAuditEntry): Promise<void>;
}
