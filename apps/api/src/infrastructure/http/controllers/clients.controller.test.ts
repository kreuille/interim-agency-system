import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  ArchiveClientUseCase,
  GetClientUseCase,
  InMemoryClientAuditLogger,
  InMemoryClientRepository,
  ListClientsUseCase,
  RegisterClientUseCase,
  UpdateClientUseCase,
} from '@interim/application';
import { FixedClock } from '@interim/shared';
import { tenantMiddleware } from '../../../shared/middleware/tenant.middleware.js';
import { createClientsRouter } from './clients.controller.js';

const clock = new FixedClock(new Date('2026-04-22T08:00:00Z'));

function buildApp(userFactory?: () => { agencyId: string; userId: string; role: string }) {
  const repo = new InMemoryClientRepository();
  const audit = new InMemoryClientAuditLogger();
  let counter = 0;
  const register = new RegisterClientUseCase(
    repo,
    audit,
    clock,
    () => `client-${String(++counter)}`,
  );
  const update = new UpdateClientUseCase(repo, audit, clock);
  const archive = new ArchiveClientUseCase(repo, audit, clock);
  const get = new GetClientUseCase(repo);
  const list = new ListClientsUseCase(repo);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const u = userFactory?.();
    if (u) req.user = { agencyId: u.agencyId, userId: u.userId, role: u.role };
    next();
  });
  app.use(tenantMiddleware);
  app.use('/api/v1/clients', createClientsRouter({ register, update, archive, get, list }));
  return { app, audit };
}

const validBody = {
  legalName: 'Acme SA',
  ide: 'CHE-100.000.006',
  paymentTermDays: 30,
};

describe('Clients HTTP', () => {
  let app: express.Express;

  describe('with sales role', () => {
    beforeEach(() => {
      ({ app } = buildApp(() => ({ agencyId: 'agency-a', userId: 'user-s', role: 'sales' })));
    });

    it('POST creates 201 + Location', async () => {
      const r = await request(app).post('/api/v1/clients').send(validBody);
      expect(r.status).toBe(201);
      expect(r.header.location).toBe('/api/v1/clients/client-1');
    });

    it('POST 409 on duplicate IDE', async () => {
      await request(app).post('/api/v1/clients').send(validBody);
      const r = await request(app).post('/api/v1/clients').send(validBody);
      expect(r.status).toBe(409);
      expect(r.body).toMatchObject({ error: 'duplicate_client_ide' });
    });

    it('POST 400 on invalid IDE', async () => {
      const r = await request(app)
        .post('/api/v1/clients')
        .send({ ...validBody, ide: 'CHE-100.000.007' });
      expect(r.status).toBe(400);
      expect(r.body).toMatchObject({ error: 'InvalidIde' });
    });

    it('PUT transitions status active and returns updated client', async () => {
      await request(app).post('/api/v1/clients').send(validBody);
      const r = await request(app).put('/api/v1/clients/client-1').send({ status: 'active' });
      expect(r.status).toBe(200);
      const body = r.body as { status: string };
      expect(body.status).toBe('active');
    });

    it('PUT 409 on invalid transition (prospect → suspended)', async () => {
      await request(app).post('/api/v1/clients').send(validBody);
      const r = await request(app).put('/api/v1/clients/client-1').send({ status: 'suspended' });
      expect(r.status).toBe(409);
    });

    it('GET 404 unknown', async () => {
      const r = await request(app).get('/api/v1/clients/ghost');
      expect(r.status).toBe(404);
    });

    it('DELETE archives (sales has client:write)', async () => {
      await request(app).post('/api/v1/clients').send(validBody);
      const r = await request(app).delete('/api/v1/clients/client-1');
      expect(r.status).toBe(204);
    });
  });

  describe('cross-tenant', () => {
    it('agency B cannot read agency A client', async () => {
      const a = buildApp(() => ({ agencyId: 'agency-a', userId: 'a', role: 'sales' }));
      await request(a.app).post('/api/v1/clients').send(validBody);
      const b = buildApp(() => ({ agencyId: 'agency-b', userId: 'b', role: 'sales' }));
      const r = await request(b.app).get('/api/v1/clients/client-1');
      expect(r.status).toBe(404);
    });
  });

  describe('viewer role', () => {
    beforeEach(() => {
      ({ app } = buildApp(() => ({ agencyId: 'agency-a', userId: 'v', role: 'viewer' })));
    });

    it('POST 403', async () => {
      const r = await request(app).post('/api/v1/clients').send(validBody);
      expect(r.status).toBe(403);
    });

    it('GET 200', async () => {
      const r = await request(app).get('/api/v1/clients');
      expect(r.status).toBe(200);
    });
  });

  describe('edge cases (coverage)', () => {
    beforeEach(() => {
      ({ app } = buildApp(() => ({ agencyId: 'agency-a', userId: 'a', role: 'agency_admin' })));
    });

    it('POST 400 missing legalName', async () => {
      const r = await request(app).post('/api/v1/clients').send({ paymentTermDays: 30 });
      expect(r.status).toBe(400);
    });

    it('PUT 404 unknown id', async () => {
      const r = await request(app).put('/api/v1/clients/ghost').send({ legalName: 'X' });
      expect(r.status).toBe(404);
    });

    it('PUT 400 invalid IDE', async () => {
      await request(app).post('/api/v1/clients').send(validBody);
      const r = await request(app).put('/api/v1/clients/client-1').send({ ide: 'CHE-100.000.999' });
      expect(r.status).toBe(400);
    });

    it('DELETE 404 unknown', async () => {
      const r = await request(app).delete('/api/v1/clients/ghost');
      expect(r.status).toBe(404);
    });

    it('GET list with status + search filters', async () => {
      await request(app).post('/api/v1/clients').send(validBody);
      const r = await request(app).get(
        '/api/v1/clients?status=prospect&search=Acme&includeArchived=false&limit=10',
      );
      expect(r.status).toBe(200);
    });

    it('GET list 400 limit out of range', async () => {
      const r = await request(app).get('/api/v1/clients?limit=999');
      expect(r.status).toBe(400);
    });

    it('PUT can null IDE and creditLimit', async () => {
      await request(app)
        .post('/api/v1/clients')
        .send({ ...validBody, creditLimitRappen: '5000000' });
      const r = await request(app)
        .put('/api/v1/clients/client-1')
        .send({ ide: null, creditLimitRappen: null });
      expect(r.status).toBe(200);
    });
  });
});
