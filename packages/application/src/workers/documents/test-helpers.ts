import type {
  AgencyId,
  DocumentListPage,
  DocumentRepository,
  ListDocumentsQuery,
  WorkerDocument,
} from '@interim/domain';
import type {
  AntivirusScanner,
  AntivirusVerdict,
  DocumentAuditEntry,
  DocumentAuditLogger,
  ObjectStorage,
  UploadedBlob,
} from './ports.js';

export class InMemoryDocumentRepository implements DocumentRepository {
  private readonly store = new Map<string, WorkerDocument>();

  private key(agencyId: AgencyId, id: string): string {
    return `${agencyId}::${id}`;
  }

  save(doc: WorkerDocument): Promise<void> {
    this.store.set(this.key(doc.agencyId, doc.id), doc);
    return Promise.resolve();
  }

  findById(agencyId: AgencyId, id: string): Promise<WorkerDocument | null> {
    return Promise.resolve(this.store.get(this.key(agencyId, id)) ?? null);
  }

  listByWorker(query: ListDocumentsQuery): Promise<DocumentListPage> {
    const items: WorkerDocument[] = [];
    for (const doc of this.store.values()) {
      if (doc.agencyId !== query.agencyId) continue;
      if (doc.workerId !== query.workerId) continue;
      if (!query.includeArchived && doc.isArchived) continue;
      items.push(doc);
    }
    return Promise.resolve({ items: items.slice(0, query.limit) });
  }

  count(): number {
    return this.store.size;
  }
}

export class InMemoryObjectStorage implements ObjectStorage {
  readonly uploads = new Map<string, Buffer>();
  readonly deletes: string[] = [];

  putObject(input: {
    agencyId: string;
    workerId: string;
    docType: string;
    mimeType: string;
    body: Buffer;
  }): Promise<UploadedBlob> {
    const fileKey = `${input.agencyId}/${input.workerId}/${input.docType}/${String(Date.now())}-${String(Math.random()).slice(2, 8)}`;
    this.uploads.set(fileKey, input.body);
    return Promise.resolve({ fileKey, sizeBytes: input.body.byteLength, mimeType: input.mimeType });
  }

  getSignedDownloadUrl(fileKey: string, ttlSeconds: number): Promise<string> {
    return Promise.resolve(`https://mock/${fileKey}?ttl=${String(ttlSeconds)}`);
  }

  deleteObject(fileKey: string): Promise<void> {
    this.uploads.delete(fileKey);
    this.deletes.push(fileKey);
    return Promise.resolve();
  }
}

export class StubAntivirusScanner implements AntivirusScanner {
  constructor(private readonly verdict: AntivirusVerdict = 'clean') {}

  scan(_body: Buffer): Promise<AntivirusVerdict> {
    return Promise.resolve(this.verdict);
  }
}

export class InMemoryDocumentAuditLogger implements DocumentAuditLogger {
  readonly entries: DocumentAuditEntry[] = [];

  record(entry: DocumentAuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}
