import { describe, it, expect, beforeEach } from 'vitest';
import { asAgencyId, DocumentNotFound, WorkerNotFound } from '@interim/domain';
import { FixedClock } from '@interim/shared';
import { RegisterWorkerUseCase } from '../register-worker.use-case.js';
import { InMemoryAuditLogger, InMemoryWorkerRepository } from '../test-helpers.js';
import { UploadDocumentUseCase } from './upload-document.use-case.js';
import { ValidateDocumentUseCase } from './validate-document.use-case.js';
import { ArchiveDocumentUseCase } from './archive-document.use-case.js';
import { ListDocumentsUseCase } from './list-documents.use-case.js';
import { GetDownloadUrlUseCase } from './get-download-url.use-case.js';
import {
  InMemoryDocumentAuditLogger,
  InMemoryDocumentRepository,
  InMemoryObjectStorage,
  StubAntivirusScanner,
} from './test-helpers.js';

const AGENCY = asAgencyId('agency-a');
const clock = new FixedClock(new Date('2026-04-21T08:00:00Z'));

let workers: InMemoryWorkerRepository;
let workerAudit: InMemoryAuditLogger;
let docs: InMemoryDocumentRepository;
let storage: InMemoryObjectStorage;
let docAudit: InMemoryDocumentAuditLogger;
let register: RegisterWorkerUseCase;
let upload: UploadDocumentUseCase;
let validate: ValidateDocumentUseCase;
let archive: ArchiveDocumentUseCase;
let list: ListDocumentsUseCase;
let getUrl: GetDownloadUrlUseCase;
let docCounter = 0;

beforeEach(async () => {
  workers = new InMemoryWorkerRepository();
  workerAudit = new InMemoryAuditLogger();
  docs = new InMemoryDocumentRepository();
  storage = new InMemoryObjectStorage();
  docAudit = new InMemoryDocumentAuditLogger();
  docCounter = 0;
  register = new RegisterWorkerUseCase(workers, workerAudit, clock, () => 'worker-1');
  upload = new UploadDocumentUseCase(
    workers,
    docs,
    storage,
    new StubAntivirusScanner('clean'),
    docAudit,
    clock,
    () => `doc-${String(++docCounter)}`,
  );
  validate = new ValidateDocumentUseCase(docs, docAudit, clock);
  archive = new ArchiveDocumentUseCase(docs, storage, docAudit, clock);
  list = new ListDocumentsUseCase(docs);
  getUrl = new GetDownloadUrlUseCase(docs, storage);

  await register.execute({
    agencyId: AGENCY,
    firstName: 'Jean',
    lastName: 'Dupont',
    avs: '756.1234.5678.97',
    iban: 'CH9300762011623852957',
    residenceCanton: 'GE',
  });
});

const PDF_BYTES = Buffer.from('%PDF-1.4 test content');

describe('UploadDocumentUseCase', () => {
  it('clean upload → status VALID after validate, audit entries captured', async () => {
    const result = await upload.execute({
      agencyId: AGENCY,
      workerId: 'worker-1',
      actorUserId: 'user-1',
      type: 'permit_work',
      mimeType: 'application/pdf',
      body: PDF_BYTES,
      expiresAt: new Date('2030-01-01T00:00:00Z'),
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.scanStatus).toBe('clean');
    const page = await list.execute({ agencyId: AGENCY, workerId: 'worker-1' });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.status).toBe('PENDING_VALIDATION');
    expect(docAudit.entries.map((e) => e.kind)).toEqual(['DocumentUploaded', 'DocumentScanned']);

    const validation = await validate.execute({
      agencyId: AGENCY,
      documentId: 'doc-1',
      actorUserId: 'user-hr',
    });
    expect(validation.ok).toBe(true);
    const after = await list.execute({ agencyId: AGENCY, workerId: 'worker-1' });
    expect(after.items[0]?.status).toBe('VALID');
  });

  it('returns worker_not_found if worker does not exist', async () => {
    const result = await upload.execute({
      agencyId: AGENCY,
      workerId: 'ghost',
      type: 'permit_work',
      mimeType: 'application/pdf',
      body: PDF_BYTES,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(WorkerNotFound);
  });

  it('infected scan → document REJECTED + object deleted from storage', async () => {
    const infectedUpload = new UploadDocumentUseCase(
      workers,
      docs,
      storage,
      new StubAntivirusScanner('infected'),
      docAudit,
      clock,
      () => `doc-${String(++docCounter)}`,
    );
    const result = await infectedUpload.execute({
      agencyId: AGENCY,
      workerId: 'worker-1',
      type: 'permit_work',
      mimeType: 'application/pdf',
      body: PDF_BYTES,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.scanStatus).toBe('infected');
    const page = await list.execute({ agencyId: AGENCY, workerId: 'worker-1' });
    expect(page.items[0]?.status).toBe('REJECTED');
    expect(storage.deletes).toHaveLength(1);
  });

  it('cross-tenant isolation: agency B cannot upload to agency A worker', async () => {
    const result = await upload.execute({
      agencyId: asAgencyId('agency-b'),
      workerId: 'worker-1',
      type: 'permit_work',
      mimeType: 'application/pdf',
      body: PDF_BYTES,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(WorkerNotFound);
  });

  it('GetDownloadUrlUseCase returns a signed URL with TTL', async () => {
    await upload.execute({
      agencyId: AGENCY,
      workerId: 'worker-1',
      type: 'permit_work',
      mimeType: 'application/pdf',
      body: PDF_BYTES,
    });
    const result = await getUrl.execute({ agencyId: AGENCY, documentId: 'doc-1' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.url).toMatch(/^https:\/\/mock\//);
      expect(result.value.expiresInSeconds).toBe(900);
    }
  });

  it('GetDownloadUrlUseCase returns document_not_found for archived doc', async () => {
    await upload.execute({
      agencyId: AGENCY,
      workerId: 'worker-1',
      type: 'permit_work',
      mimeType: 'application/pdf',
      body: PDF_BYTES,
    });
    await archive.execute({ agencyId: AGENCY, documentId: 'doc-1', actorUserId: 'u' });
    const result = await getUrl.execute({ agencyId: AGENCY, documentId: 'doc-1' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(DocumentNotFound);
  });

  it('ArchiveDocumentUseCase deletes the blob', async () => {
    await upload.execute({
      agencyId: AGENCY,
      workerId: 'worker-1',
      type: 'permit_work',
      mimeType: 'application/pdf',
      body: PDF_BYTES,
    });
    await archive.execute({ agencyId: AGENCY, documentId: 'doc-1', actorUserId: 'u' });
    expect(storage.deletes.length).toBeGreaterThan(0);
  });

  it('List excludes archived by default', async () => {
    await upload.execute({
      agencyId: AGENCY,
      workerId: 'worker-1',
      type: 'permit_work',
      mimeType: 'application/pdf',
      body: PDF_BYTES,
    });
    await archive.execute({ agencyId: AGENCY, documentId: 'doc-1', actorUserId: 'u' });
    const defaultList = await list.execute({ agencyId: AGENCY, workerId: 'worker-1' });
    expect(defaultList.items).toHaveLength(0);
    const withArchived = await list.execute({
      agencyId: AGENCY,
      workerId: 'worker-1',
      includeArchived: true,
    });
    expect(withArchived.items).toHaveLength(1);
  });
});
