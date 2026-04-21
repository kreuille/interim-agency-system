import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  ArchiveWorkerUseCase,
  GetWorkerUseCase,
  InMemoryAuditLogger,
  InMemoryWorkerRepository,
  ListWorkersUseCase,
  RegisterWorkerUseCase,
  UpdateWorkerUseCase,
} from '@interim/application';
import { FixedClock } from '@interim/shared';
import { tenantMiddleware } from '../../../shared/middleware/tenant.middleware.js';
import { createWorkersRouter } from './workers.controller.js';

const clock = new FixedClock(new Date('2026-04-21T08:00:00Z'));

function buildApp(
  userFactory?: () => { agencyId: string; userId: string; role: string } | undefined,
) {
  const repo = new InMemoryWorkerRepository();
  const audit = new InMemoryAuditLogger();
  let idCounter = 0;
  const register = new RegisterWorkerUseCase(
    repo,
    audit,
    clock,
    () => `worker-${String(++idCounter)}`,
  );
  const update = new UpdateWorkerUseCase(repo, audit, clock);
  const archive = new ArchiveWorkerUseCase(repo, audit, clock);
  const get = new GetWorkerUseCase(repo);
  const list = new ListWorkersUseCase(repo);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const user = userFactory?.();
    if (user) {
      req.user = { agencyId: user.agencyId, userId: user.userId, role: user.role };
    }
    next();
  });
  app.use(tenantMiddleware);
  app.use('/api/v1/workers', createWorkersRouter({ register, update, archive, get, list }));
  return { app, audit };
}

const validBody = {
  firstName: 'Jean',
  lastName: 'Dupont',
  avs: '756.1234.5678.97',
  iban: 'CH9300762011623852957',
  residenceCanton: 'GE',
  email: 'jean@example.ch',
  phone: '+41780000001',
};

describe('Workers HTTP', () => {
  let app: express.Express;
  let audit: InMemoryAuditLogger;

  describe('without auth', () => {
    beforeEach(() => {
      ({ app, audit } = buildApp());
    });

    it('POST /workers returns 401 without user', async () => {
      const response = await request(app).post('/api/v1/workers').send(validBody);
      expect(response.status).toBe(401);
    });
  });

  describe('with dispatcher role', () => {
    beforeEach(() => {
      ({ app, audit } = buildApp(() => ({
        agencyId: 'agency-a',
        userId: 'user-1',
        role: 'dispatcher',
      })));
    });

    it('POST /workers with valid input returns 201 + Location', async () => {
      const response = await request(app).post('/api/v1/workers').send(validBody);
      expect(response.status).toBe(201);
      expect(response.header.location).toBe('/api/v1/workers/worker-1');
      expect(audit.entries).toHaveLength(1);
      expect(audit.entries[0]?.kind).toBe('WorkerRegistered');
    });

    it('POST /workers with duplicate AVS returns 409', async () => {
      await request(app).post('/api/v1/workers').send(validBody);
      const response = await request(app).post('/api/v1/workers').send(validBody);
      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ error: 'duplicate_avs' });
    });

    it('POST /workers with invalid AVS returns 400', async () => {
      const response = await request(app)
        .post('/api/v1/workers')
        .send({ ...validBody, avs: '756.0000.0000.00' });
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ error: 'InvalidAvs' });
    });

    it('GET /workers/:id returns 404 for unknown id', async () => {
      const response = await request(app).get('/api/v1/workers/ghost');
      expect(response.status).toBe(404);
    });

    it('POST then GET roundtrip', async () => {
      await request(app).post('/api/v1/workers').send(validBody);
      const response = await request(app).get('/api/v1/workers/worker-1');
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        firstName: 'Jean',
        lastName: 'Dupont',
        residenceCanton: 'GE',
      });
    });

    it('PUT /workers/:id updates name', async () => {
      await request(app).post('/api/v1/workers').send(validBody);
      const response = await request(app)
        .put('/api/v1/workers/worker-1')
        .send({ firstName: 'Jeanne' });
      expect(response.status).toBe(200);
      const body = response.body as { firstName: string };
      expect(body.firstName).toBe('Jeanne');
    });

    it('DELETE /workers/:id as dispatcher returns 403 (only admin/hr)', async () => {
      await request(app).post('/api/v1/workers').send(validBody);
      const deleteRes = await request(app).delete('/api/v1/workers/worker-1');
      expect(deleteRes.status).toBe(403);
    });

    it('GET /workers lists tenant workers only', async () => {
      await request(app).post('/api/v1/workers').send(validBody);
      const response = await request(app).get('/api/v1/workers');
      expect(response.status).toBe(200);
      const body = response.body as { items: unknown[] };
      expect(body.items).toHaveLength(1);
    });
  });

  describe('with viewer role (read-only)', () => {
    beforeEach(() => {
      ({ app } = buildApp(() => ({
        agencyId: 'agency-a',
        userId: 'user-v',
        role: 'viewer',
      })));
    });

    it('POST /workers returns 403', async () => {
      const response = await request(app).post('/api/v1/workers').send(validBody);
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ error: 'forbidden' });
    });

    it('GET /workers returns 200', async () => {
      const response = await request(app).get('/api/v1/workers');
      expect(response.status).toBe(200);
    });
  });

  describe('with agency_admin role', () => {
    beforeEach(() => {
      ({ app } = buildApp(() => ({
        agencyId: 'agency-a',
        userId: 'user-admin',
        role: 'agency_admin',
      })));
    });

    it('DELETE /workers/:id returns 204 and GET returns 404 afterwards', async () => {
      await request(app).post('/api/v1/workers').send(validBody);
      const deleteRes = await request(app).delete('/api/v1/workers/worker-1');
      expect(deleteRes.status).toBe(204);
      const getRes = await request(app).get('/api/v1/workers/worker-1');
      expect(getRes.status).toBe(404);
    });
  });

  describe('cross-tenant isolation', () => {
    it('agency B cannot see agency A worker', async () => {
      const { app: appA } = buildApp(() => ({
        agencyId: 'agency-a',
        userId: 'user-a',
        role: 'dispatcher',
      }));
      await request(appA).post('/api/v1/workers').send(validBody);

      const { app: appB } = buildApp(() => ({
        agencyId: 'agency-b',
        userId: 'user-b',
        role: 'dispatcher',
      }));
      const response = await request(appB).get('/api/v1/workers/worker-1');
      expect(response.status).toBe(404);
    });
  });
});
