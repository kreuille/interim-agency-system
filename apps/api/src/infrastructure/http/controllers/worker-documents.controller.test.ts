import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  ArchiveDocumentUseCase,
  GetDownloadUrlUseCase,
  InMemoryAuditLogger,
  InMemoryDocumentAuditLogger,
  InMemoryDocumentRepository,
  InMemoryObjectStorage,
  InMemoryWorkerRepository,
  ListDocumentsUseCase,
  RegisterWorkerUseCase,
  StubAntivirusScanner,
  UploadDocumentUseCase,
  ValidateDocumentUseCase,
} from '@interim/application';
import { FixedClock } from '@interim/shared';
import { tenantMiddleware } from '../../../shared/middleware/tenant.middleware.js';
import { createWorkerDocumentsRouter } from './worker-documents.controller.js';

const clock = new FixedClock(new Date('2026-04-21T08:00:00Z'));

interface AppSetup {
  app: express.Express;
  workerId: string;
  docCounter: { n: number };
}

async function buildApp(user: {
  agencyId: string;
  userId: string;
  role: string;
}): Promise<AppSetup> {
  const workers = new InMemoryWorkerRepository();
  const workerAudit = new InMemoryAuditLogger();
  const docs = new InMemoryDocumentRepository();
  const storage = new InMemoryObjectStorage();
  const docAudit = new InMemoryDocumentAuditLogger();
  const register = new RegisterWorkerUseCase(workers, workerAudit, clock, () => 'worker-1');
  const docCounter = { n: 0 };
  const upload = new UploadDocumentUseCase(
    workers,
    docs,
    storage,
    new StubAntivirusScanner('clean'),
    docAudit,
    clock,
    () => `doc-${String(++docCounter.n)}`,
  );
  const validate = new ValidateDocumentUseCase(docs, docAudit, clock);
  const archive = new ArchiveDocumentUseCase(docs, storage, docAudit, clock);
  const list = new ListDocumentsUseCase(docs);
  const getUrl = new GetDownloadUrlUseCase(docs, storage);

  await register.execute({
    agencyId: user.agencyId as never,
    firstName: 'Jean',
    lastName: 'Dupont',
    avs: '756.1234.5678.97',
    iban: 'CH9300762011623852957',
    residenceCanton: 'GE',
  });

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { agencyId: user.agencyId, userId: user.userId, role: user.role };
    next();
  });
  app.use(tenantMiddleware);
  app.use(
    '/api/v1/workers/:id/documents',
    createWorkerDocumentsRouter({ upload, validate, archive, list, getUrl }),
  );
  return { app, workerId: 'worker-1', docCounter };
}

const PDF = Buffer.from('%PDF-1.4 content');

describe('Worker documents HTTP', () => {
  let setup: AppSetup;

  describe('as dispatcher', () => {
    beforeEach(async () => {
      setup = await buildApp({ agencyId: 'agency-a', userId: 'user-d', role: 'dispatcher' });
    });

    it('POST uploads a PDF and returns 202', async () => {
      const response = await request(setup.app)
        .post(`/api/v1/workers/${setup.workerId}/documents`)
        .field('type', 'permit_work')
        .attach('file', PDF, { filename: 'permit.pdf', contentType: 'application/pdf' });
      expect(response.status).toBe(202);
      const body = response.body as { documentId: string; scanStatus: string };
      expect(body.documentId).toBe('doc-1');
      expect(body.scanStatus).toBe('clean');
    });

    it('POST rejects a binary disguised as PDF (mime_mismatch)', async () => {
      const fake = Buffer.from([0x4d, 0x5a, 0x90, 0x00]); // EXE header
      const response = await request(setup.app)
        .post(`/api/v1/workers/${setup.workerId}/documents`)
        .field('type', 'permit_work')
        .attach('file', fake, { filename: 'fake.pdf', contentType: 'application/pdf' });
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ error: 'mime_mismatch' });
    });

    it('POST rejects unsupported mime type', async () => {
      const response = await request(setup.app)
        .post(`/api/v1/workers/${setup.workerId}/documents`)
        .field('type', 'permit_work')
        .attach('file', Buffer.from('<svg/>'), { filename: 'a.svg', contentType: 'image/svg+xml' });
      expect(response.status).toBe(415);
    });

    it('POST returns 400 when no file attached', async () => {
      const response = await request(setup.app)
        .post(`/api/v1/workers/${setup.workerId}/documents`)
        .field('type', 'permit_work');
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ error: 'missing_file' });
    });

    it('GET lists documents for the worker', async () => {
      await request(setup.app)
        .post(`/api/v1/workers/${setup.workerId}/documents`)
        .field('type', 'permit_work')
        .attach('file', PDF, { filename: 'p.pdf', contentType: 'application/pdf' });
      const response = await request(setup.app).get(`/api/v1/workers/${setup.workerId}/documents`);
      expect(response.status).toBe(200);
      const body = response.body as { items: unknown[] };
      expect(body.items).toHaveLength(1);
    });

    it('GET /:docId/download returns signed URL', async () => {
      await request(setup.app)
        .post(`/api/v1/workers/${setup.workerId}/documents`)
        .field('type', 'permit_work')
        .attach('file', PDF, { filename: 'p.pdf', contentType: 'application/pdf' });
      const response = await request(setup.app).get(
        `/api/v1/workers/${setup.workerId}/documents/doc-1/download`,
      );
      expect(response.status).toBe(200);
      const body = response.body as { url: string; expiresInSeconds: number };
      expect(body.url).toMatch(/^https:\/\/mock\//);
      expect(body.expiresInSeconds).toBe(900);
    });

    it('PATCH validate transitions to VALID', async () => {
      await request(setup.app)
        .post(`/api/v1/workers/${setup.workerId}/documents`)
        .field('type', 'permit_work')
        .attach('file', PDF, { filename: 'p.pdf', contentType: 'application/pdf' });
      const response = await request(setup.app)
        .patch(`/api/v1/workers/${setup.workerId}/documents/doc-1/validate`)
        .send({});
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ status: 'VALID' });
    });

    it('DELETE as dispatcher returns 403 (worker:delete)', async () => {
      await request(setup.app)
        .post(`/api/v1/workers/${setup.workerId}/documents`)
        .field('type', 'permit_work')
        .attach('file', PDF, { filename: 'p.pdf', contentType: 'application/pdf' });
      const response = await request(setup.app).delete(
        `/api/v1/workers/${setup.workerId}/documents/doc-1`,
      );
      expect(response.status).toBe(403);
    });
  });

  describe('as agency_admin', () => {
    beforeEach(async () => {
      setup = await buildApp({ agencyId: 'agency-a', userId: 'user-a', role: 'agency_admin' });
    });

    it('DELETE archives the document and hides from list', async () => {
      await request(setup.app)
        .post(`/api/v1/workers/${setup.workerId}/documents`)
        .field('type', 'permit_work')
        .attach('file', PDF, { filename: 'p.pdf', contentType: 'application/pdf' });
      const deleted = await request(setup.app).delete(
        `/api/v1/workers/${setup.workerId}/documents/doc-1`,
      );
      expect(deleted.status).toBe(204);
      const list = await request(setup.app).get(`/api/v1/workers/${setup.workerId}/documents`);
      const body = list.body as { items: unknown[] };
      expect(body.items).toHaveLength(0);
    });
  });

  describe('as viewer', () => {
    beforeEach(async () => {
      setup = await buildApp({ agencyId: 'agency-a', userId: 'user-v', role: 'viewer' });
    });

    it('POST returns 403', async () => {
      const response = await request(setup.app)
        .post(`/api/v1/workers/${setup.workerId}/documents`)
        .field('type', 'permit_work')
        .attach('file', PDF, { filename: 'p.pdf', contentType: 'application/pdf' });
      expect(response.status).toBe(403);
    });

    it('GET is allowed', async () => {
      const response = await request(setup.app).get(`/api/v1/workers/${setup.workerId}/documents`);
      expect(response.status).toBe(200);
    });
  });

  describe('cross-tenant isolation', () => {
    it('agency B cannot download agency A document', async () => {
      const a = await buildApp({ agencyId: 'agency-a', userId: 'ua', role: 'dispatcher' });
      await request(a.app)
        .post(`/api/v1/workers/${a.workerId}/documents`)
        .field('type', 'permit_work')
        .attach('file', PDF, { filename: 'p.pdf', contentType: 'application/pdf' });
      const b = await buildApp({ agencyId: 'agency-b', userId: 'ub', role: 'dispatcher' });
      const response = await request(b.app).get(
        `/api/v1/workers/${a.workerId}/documents/doc-1/download`,
      );
      expect(response.status).toBe(404);
    });
  });
});
