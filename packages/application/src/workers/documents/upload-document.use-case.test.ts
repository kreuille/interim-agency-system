import { describe, it, expect, beforeEach } from 'vitest';
import { asAgencyId, DocumentNotFound, WorkerNotFound } from '@interim/domain';
import { FixedClock } from '@interim/shared';
import { RegisterWorkerUseCase } from '../register-worker.use-case.js';
import { InMemoryAuditLogger, InMemoryWorkerRepository } from '../test-helpers.js';
import { ApplyScanResultUseCase } from './apply-scan-result.use-case.js';
import { UploadDocumentUseCase } from './upload-document.use-case.js';
import { ValidateDocumentUseCase } from './validate-document.use-case.js';
import { ArchiveDocumentUseCase } from './archive-document.use-case.js';
import { ListDocumentsUseCase } from './list-documents.use-case.js';
import { GetDownloadUrlUseCase } from './get-download-url.use-case.js';
import {
  FakeOcrExtractor,
  InlineScanQueue,
  InMemoryDocumentAuditLogger,
  InMemoryDocumentRepository,
  InMemoryObjectStorage,
  NoOpOcrExtractor,
  RecordingScanQueue,
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
let validate: ValidateDocumentUseCase;
let archive: ArchiveDocumentUseCase;
let list: ListDocumentsUseCase;
let getUrl: GetDownloadUrlUseCase;
let docCounter = 0;

function buildUpload(opts: {
  scanner: StubAntivirusScanner;
  ocr?: NoOpOcrExtractor | FakeOcrExtractor;
  recording?: boolean;
}): { upload: UploadDocumentUseCase; queue: InlineScanQueue | RecordingScanQueue } {
  const apply = new ApplyScanResultUseCase(docs, storage, docAudit, clock);
  const queue = opts.recording
    ? new RecordingScanQueue()
    : new InlineScanQueue(opts.scanner, apply);
  const upload = new UploadDocumentUseCase(
    workers,
    docs,
    storage,
    queue,
    opts.ocr ?? new NoOpOcrExtractor(),
    docAudit,
    clock,
    () => `doc-${String(++docCounter)}`,
  );
  return { upload, queue };
}

beforeEach(async () => {
  workers = new InMemoryWorkerRepository();
  workerAudit = new InMemoryAuditLogger();
  docs = new InMemoryDocumentRepository();
  storage = new InMemoryObjectStorage();
  docAudit = new InMemoryDocumentAuditLogger();
  docCounter = 0;
  register = new RegisterWorkerUseCase(workers, workerAudit, clock, () => 'worker-1');
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

describe('UploadDocumentUseCase (async scan via ScanQueue)', () => {
  it('returns scanStatus=pending and enqueues scan request', async () => {
    const { upload, queue } = buildUpload({
      scanner: new StubAntivirusScanner('clean'),
      recording: true,
    });
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
    if (result.ok) expect(result.value.scanStatus).toBe('pending');
    const recording = queue;
    expect(recording.requests).toHaveLength(1);
    expect(recording.requests[0]?.documentId).toBe('doc-1');
  });

  it('inline mode: clean scan → PENDING_VALIDATION + audit DocumentScanned', async () => {
    const { upload } = buildUpload({ scanner: new StubAntivirusScanner('clean') });
    await upload.execute({
      agencyId: AGENCY,
      workerId: 'worker-1',
      type: 'permit_work',
      mimeType: 'application/pdf',
      body: PDF_BYTES,
    });
    const page = await list.execute({ agencyId: AGENCY, workerId: 'worker-1' });
    expect(page.items[0]?.status).toBe('PENDING_VALIDATION');
    expect(docAudit.entries.map((e) => e.kind)).toEqual(['DocumentUploaded', 'DocumentScanned']);
  });

  it('inline mode: infected scan → REJECTED + storage.delete', async () => {
    const { upload } = buildUpload({ scanner: new StubAntivirusScanner('infected') });
    await upload.execute({
      agencyId: AGENCY,
      workerId: 'worker-1',
      type: 'permit_work',
      mimeType: 'application/pdf',
      body: PDF_BYTES,
    });
    const page = await list.execute({ agencyId: AGENCY, workerId: 'worker-1' });
    expect(page.items[0]?.status).toBe('REJECTED');
    expect(storage.deletes).toHaveLength(1);
  });

  it('after validate, status becomes VALID', async () => {
    const { upload } = buildUpload({ scanner: new StubAntivirusScanner('clean') });
    await upload.execute({
      agencyId: AGENCY,
      workerId: 'worker-1',
      type: 'permit_work',
      mimeType: 'application/pdf',
      body: PDF_BYTES,
    });
    const validation = await validate.execute({
      agencyId: AGENCY,
      documentId: 'doc-1',
      actorUserId: 'user-hr',
    });
    expect(validation.ok).toBe(true);
    const page = await list.execute({ agencyId: AGENCY, workerId: 'worker-1' });
    expect(page.items[0]?.status).toBe('VALID');
  });

  it('returns worker_not_found for unknown worker', async () => {
    const { upload } = buildUpload({ scanner: new StubAntivirusScanner('clean') });
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

  it('cross-tenant: agency B cannot upload to agency A worker', async () => {
    const { upload } = buildUpload({ scanner: new StubAntivirusScanner('clean') });
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

  it('OCR: when expiresAt missing, OCR fills it', async () => {
    const ocrDate = new Date('2028-12-31T00:00:00Z');
    const { upload } = buildUpload({
      scanner: new StubAntivirusScanner('clean'),
      ocr: new FakeOcrExtractor({ expiresAt: ocrDate }),
    });
    await upload.execute({
      agencyId: AGENCY,
      workerId: 'worker-1',
      type: 'permit_work',
      mimeType: 'application/pdf',
      body: PDF_BYTES,
    });
    const page = await list.execute({ agencyId: AGENCY, workerId: 'worker-1' });
    expect(page.items[0]?.toSnapshot().expiresAt?.toISOString()).toBe(ocrDate.toISOString());
    const auditUpload = docAudit.entries.find((e) => e.kind === 'DocumentUploaded');
    expect((auditUpload?.diff as { ocrExtractedExpiresAt: string }).ocrExtractedExpiresAt).toBe(
      ocrDate.toISOString(),
    );
  });

  it('OCR: caller-provided expiresAt wins over OCR', async () => {
    const callerDate = new Date('2027-06-30T00:00:00Z');
    const { upload } = buildUpload({
      scanner: new StubAntivirusScanner('clean'),
      ocr: new FakeOcrExtractor({ expiresAt: new Date('2099-01-01T00:00:00Z') }),
    });
    await upload.execute({
      agencyId: AGENCY,
      workerId: 'worker-1',
      type: 'permit_work',
      mimeType: 'application/pdf',
      body: PDF_BYTES,
      expiresAt: callerDate,
    });
    const page = await list.execute({ agencyId: AGENCY, workerId: 'worker-1' });
    expect(page.items[0]?.toSnapshot().expiresAt?.toISOString()).toBe(callerDate.toISOString());
  });

  it('GetDownloadUrl returns signed URL with TTL', async () => {
    const { upload } = buildUpload({ scanner: new StubAntivirusScanner('clean') });
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

  it('GetDownloadUrl returns document_not_found for archived doc', async () => {
    const { upload } = buildUpload({ scanner: new StubAntivirusScanner('clean') });
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

  it('Archive deletes the blob', async () => {
    const { upload } = buildUpload({ scanner: new StubAntivirusScanner('clean') });
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
    const { upload } = buildUpload({ scanner: new StubAntivirusScanner('clean') });
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

describe('ApplyScanResultUseCase', () => {
  it('clean → PENDING_VALIDATION', async () => {
    const apply = new ApplyScanResultUseCase(docs, storage, docAudit, clock);
    const queue = new RecordingScanQueue();
    const upload = new UploadDocumentUseCase(
      workers,
      docs,
      storage,
      queue,
      new NoOpOcrExtractor(),
      docAudit,
      clock,
      () => 'doc-1',
    );
    await upload.execute({
      agencyId: AGENCY,
      workerId: 'worker-1',
      type: 'permit_work',
      mimeType: 'application/pdf',
      body: PDF_BYTES,
    });
    const result = await apply.execute({
      agencyId: AGENCY,
      documentId: 'doc-1',
      verdict: 'clean',
    });
    expect(result.ok).toBe(true);
    const page = await list.execute({ agencyId: AGENCY, workerId: 'worker-1' });
    expect(page.items[0]?.status).toBe('PENDING_VALIDATION');
  });

  it('infected → REJECTED + storage.delete', async () => {
    const apply = new ApplyScanResultUseCase(docs, storage, docAudit, clock);
    const queue = new RecordingScanQueue();
    const upload = new UploadDocumentUseCase(
      workers,
      docs,
      storage,
      queue,
      new NoOpOcrExtractor(),
      docAudit,
      clock,
      () => 'doc-1',
    );
    await upload.execute({
      agencyId: AGENCY,
      workerId: 'worker-1',
      type: 'permit_work',
      mimeType: 'application/pdf',
      body: PDF_BYTES,
    });
    const result = await apply.execute({
      agencyId: AGENCY,
      documentId: 'doc-1',
      verdict: 'infected',
    });
    expect(result.ok).toBe(true);
    expect(storage.deletes.length).toBe(1);
  });

  it('returns document_not_found for unknown doc', async () => {
    const apply = new ApplyScanResultUseCase(docs, storage, docAudit, clock);
    const result = await apply.execute({
      agencyId: AGENCY,
      documentId: 'ghost',
      verdict: 'clean',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(DocumentNotFound);
  });

  it('idempotent: re-applying scan on already-scanned doc is no-op', async () => {
    const apply = new ApplyScanResultUseCase(docs, storage, docAudit, clock);
    const queue = new RecordingScanQueue();
    const upload = new UploadDocumentUseCase(
      workers,
      docs,
      storage,
      queue,
      new NoOpOcrExtractor(),
      docAudit,
      clock,
      () => 'doc-1',
    );
    await upload.execute({
      agencyId: AGENCY,
      workerId: 'worker-1',
      type: 'permit_work',
      mimeType: 'application/pdf',
      body: PDF_BYTES,
    });
    await apply.execute({ agencyId: AGENCY, documentId: 'doc-1', verdict: 'clean' });
    const before = docAudit.entries.length;
    await apply.execute({ agencyId: AGENCY, documentId: 'doc-1', verdict: 'clean' });
    expect(docAudit.entries.length).toBe(before);
  });
});
