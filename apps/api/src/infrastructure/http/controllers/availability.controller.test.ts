import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  AddSlotUseCase,
  GetWeekAvailabilityUseCase,
  InMemoryAvailabilityEventPublisher,
  InMemoryWorkerAvailabilityRepository,
  RemoveSlotUseCase,
} from '@interim/application';
import { FixedClock } from '@interim/shared';
import { tenantMiddleware } from '../../../shared/middleware/tenant.middleware.js';
import { createAvailabilityRouter } from './availability.controller.js';

const NOW = new Date('2026-04-22T08:00:00Z'); // mercredi
const MONDAY_ISO = '2026-04-20'; // lundi de la semaine ISO contenant NOW

interface AppSetup {
  readonly app: express.Express;
  readonly publisher: InMemoryAvailabilityEventPublisher;
  readonly workerId: string;
}

function buildApp(user: { agencyId: string; userId: string; role: string }): AppSetup {
  const repo = new InMemoryWorkerAvailabilityRepository();
  const publisher = new InMemoryAvailabilityEventPublisher();
  const clock = new FixedClock(NOW);
  let counter = 0;
  const idFactory = (): string => `wa-${String(++counter)}`;
  const add = new AddSlotUseCase(repo, publisher, clock, idFactory);
  const remove = new RemoveSlotUseCase(repo, publisher, clock);
  const getWeek = new GetWeekAvailabilityUseCase(repo, clock);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { agencyId: user.agencyId, userId: user.userId, role: user.role };
    next();
  });
  app.use(tenantMiddleware);
  app.use('/api/v1/workers/:id/availability', createAvailabilityRouter({ add, remove, getWeek }));
  return { app, publisher, workerId: 'worker-1' };
}

interface SlotResponse {
  readonly slotId: string;
}

interface ErrorResponse {
  readonly error: string;
}

interface WeekResponse {
  readonly freshness: string;
  readonly instances: readonly { readonly status: string }[];
}

describe('availability.controller', () => {
  it('POST /slots crée un slot et publie AvailabilityDeclared', async () => {
    const setup = buildApp({ agencyId: 'agency-a', userId: 'admin', role: 'agency_admin' });
    const res = await request(setup.app)
      .post(`/api/v1/workers/${setup.workerId}/availability/slots`)
      .send({
        dateFrom: '2026-04-22T08:00:00.000Z',
        dateTo: '2026-04-22T17:00:00.000Z',
        status: 'available',
      });
    expect(res.status).toBe(201);
    const body = res.body as SlotResponse;
    expect(body.slotId).toMatch(/^[0-9a-f-]+$/);
    expect(setup.publisher.published).toHaveLength(1);
    expect(setup.publisher.published[0]?.kind).toBe('AvailabilityDeclared');
  });

  it('POST /slots rejette dateTo <= dateFrom (400)', async () => {
    const setup = buildApp({ agencyId: 'agency-a', userId: 'admin', role: 'agency_admin' });
    const res = await request(setup.app)
      .post(`/api/v1/workers/${setup.workerId}/availability/slots`)
      .send({
        dateFrom: '2026-04-22T17:00:00.000Z',
        dateTo: '2026-04-22T08:00:00.000Z',
        status: 'available',
      });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'invalid_slot_window' });
  });

  it('POST /slots rejette payload invalide (400)', async () => {
    const setup = buildApp({ agencyId: 'agency-a', userId: 'admin', role: 'agency_admin' });
    const res = await request(setup.app)
      .post(`/api/v1/workers/${setup.workerId}/availability/slots`)
      .send({ dateFrom: 'not-a-date', dateTo: 'also-bad', status: 'unknown' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'validation_error' });
  });

  it('POST /slots → 401 si pas authentifié', async () => {
    const app = express();
    app.use(express.json());
    app.use(tenantMiddleware);
    app.use(
      '/api/v1/workers/:id/availability',
      createAvailabilityRouter({
        add: new AddSlotUseCase(
          new InMemoryWorkerAvailabilityRepository(),
          new InMemoryAvailabilityEventPublisher(),
          new FixedClock(NOW),
          () => 'wa-x',
        ),
        remove: new RemoveSlotUseCase(
          new InMemoryWorkerAvailabilityRepository(),
          new InMemoryAvailabilityEventPublisher(),
          new FixedClock(NOW),
        ),
        getWeek: new GetWeekAvailabilityUseCase(
          new InMemoryWorkerAvailabilityRepository(),
          new FixedClock(NOW),
        ),
      }),
    );
    const res = await request(app).post('/api/v1/workers/worker-1/availability/slots').send({
      dateFrom: '2026-04-22T08:00:00.000Z',
      dateTo: '2026-04-22T17:00:00.000Z',
      status: 'available',
    });
    expect(res.status).toBe(401);
  });

  it('POST /slots → 403 si rôle insuffisant (auditor sans worker:write)', async () => {
    const setup = buildApp({
      agencyId: 'agency-a',
      userId: 'reader',
      role: 'auditor',
    });
    const res = await request(setup.app)
      .post(`/api/v1/workers/${setup.workerId}/availability/slots`)
      .send({
        dateFrom: '2026-04-22T08:00:00.000Z',
        dateTo: '2026-04-22T17:00:00.000Z',
        status: 'available',
      });
    expect(res.status).toBe(403);
  });

  it('DELETE /slots/:slotId supprime un slot et publie AvailabilityChanged', async () => {
    const setup = buildApp({ agencyId: 'agency-a', userId: 'admin', role: 'agency_admin' });
    const created = await request(setup.app)
      .post(`/api/v1/workers/${setup.workerId}/availability/slots`)
      .send({
        dateFrom: '2026-04-22T08:00:00.000Z',
        dateTo: '2026-04-22T17:00:00.000Z',
        status: 'available',
      });
    const createdBody = created.body as SlotResponse;
    const res = await request(setup.app).delete(
      `/api/v1/workers/${setup.workerId}/availability/slots/${createdBody.slotId}`,
    );
    expect(res.status).toBe(204);
    expect(setup.publisher.published.at(-1)?.kind).toBe('AvailabilityChanged');
  });

  it('DELETE /slots/:slotId → 404 si slot inconnu', async () => {
    const setup = buildApp({ agencyId: 'agency-a', userId: 'admin', role: 'agency_admin' });
    const res = await request(setup.app).delete(
      `/api/v1/workers/${setup.workerId}/availability/slots/unknown`,
    );
    expect(res.status).toBe(404);
  });

  it('GET /week retourne les instances effectives sur la semaine', async () => {
    const setup = buildApp({ agencyId: 'agency-a', userId: 'admin', role: 'agency_admin' });
    await request(setup.app).post(`/api/v1/workers/${setup.workerId}/availability/slots`).send({
      dateFrom: '2026-04-22T08:00:00.000Z',
      dateTo: '2026-04-22T17:00:00.000Z',
      status: 'available',
    });
    const res = await request(setup.app).get(
      `/api/v1/workers/${setup.workerId}/availability/week?from=${MONDAY_ISO}`,
    );
    expect(res.status).toBe(200);
    const body = res.body as WeekResponse;
    expect(body.freshness).toBe('realtime');
    expect(body.instances).toHaveLength(1);
    expect(body.instances[0]?.status).toBe('available');
  });

  it('GET /week rejette from absent (400)', async () => {
    const setup = buildApp({ agencyId: 'agency-a', userId: 'admin', role: 'agency_admin' });
    const res = await request(setup.app).get(`/api/v1/workers/${setup.workerId}/availability/week`);
    expect(res.status).toBe(400);
    expect((res.body as ErrorResponse).error).toBe('missing_or_invalid_from');
  });

  it('GET /week rejette from non-lundi (400)', async () => {
    const setup = buildApp({ agencyId: 'agency-a', userId: 'admin', role: 'agency_admin' });
    const res = await request(setup.app).get(
      `/api/v1/workers/${setup.workerId}/availability/week?from=2026-04-22`,
    );
    expect(res.status).toBe(400);
    expect((res.body as ErrorResponse).error).toBe('from_must_be_monday');
  });
});
