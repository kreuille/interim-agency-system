import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { FixedClock } from '@interim/shared';
import {
  asAgencyId,
  asClientId,
  asStaffId,
  asTimesheetId,
  Timesheet,
  type TimesheetEntry,
} from '@interim/domain';
import {
  DisputeTimesheetUseCase,
  InMemoryTimesheetRepository,
  SignTimesheetUseCase,
  StubTimesheetMpPort,
} from '@interim/application';
import { tenantMiddleware } from '../../../shared/middleware/tenant.middleware.js';
import { createTimesheetsRouter } from './timesheets.controller.js';

const NOW = new Date('2026-04-22T08:00:00Z');
const clock = new FixedClock(NOW);
const AGENCY = 'agency-a';

function entry(): TimesheetEntry {
  return {
    workDate: new Date('2026-04-22T00:00:00Z'),
    plannedStart: new Date('2026-04-22T08:00:00Z'),
    plannedEnd: new Date('2026-04-22T17:00:00Z'),
    actualStart: new Date('2026-04-22T08:00:00Z'),
    actualEnd: new Date('2026-04-22T17:00:00Z'),
    breakMinutes: 60,
  };
}

interface SetupOpts {
  readonly user?: { agencyId: string; userId: string; role: string };
  readonly mpFail?: 'transient' | 'permanent';
}

async function setup(opts: SetupOpts = {}) {
  const repo = new InMemoryTimesheetRepository();
  const mp = new StubTimesheetMpPort();
  if (opts.mpFail === 'transient') mp.failNextSign = 'transient';
  if (opts.mpFail === 'permanent') mp.failNextSign = 'permanent';
  const signUseCase = new SignTimesheetUseCase(repo, mp, clock);
  const disputeUseCase = new DisputeTimesheetUseCase(repo, mp, clock);

  const ts = Timesheet.create({
    id: asTimesheetId('ts-1'),
    agencyId: asAgencyId(AGENCY),
    externalTimesheetId: 'mp-ts-1',
    workerId: asStaffId('worker-1'),
    clientId: asClientId('client-1'),
    entries: [entry()],
    hourlyRateRappen: 3200,
    anomalies: [],
    receivedAt: NOW,
  });
  await repo.save(ts);

  const app = express();
  app.use(express.json());
  const u = opts.user ?? { agencyId: AGENCY, userId: 'disp-1', role: 'dispatcher' };
  app.use((req, _res, next) => {
    req.user = { agencyId: u.agencyId, userId: u.userId, role: u.role };
    next();
  });
  app.use(tenantMiddleware);
  app.use('/api/v1/timesheets', createTimesheetsRouter({ repo, signUseCase, disputeUseCase }));
  return { app, repo, mp };
}

interface ListResponseDto {
  readonly items: readonly { readonly id: string; readonly state: string }[];
  readonly nextCursor: string | null;
}

describe('timesheets.controller', () => {
  it('GET /api/v1/timesheets → liste', async () => {
    const { app } = await setup();
    const res = await request(app).get('/api/v1/timesheets');
    expect(res.status).toBe(200);
    const body = res.body as ListResponseDto;
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.state).toBe('received');
  });

  it('GET /api/v1/timesheets?state=signed → 0', async () => {
    const { app } = await setup();
    const res = await request(app).get('/api/v1/timesheets?state=signed');
    expect(res.status).toBe(200);
    expect((res.body as ListResponseDto).items).toHaveLength(0);
  });

  it('GET /api/v1/timesheets/:id → détail', async () => {
    const { app } = await setup();
    const res = await request(app).get('/api/v1/timesheets/ts-1');
    expect(res.status).toBe(200);
    expect((res.body as { state: string }).state).toBe('received');
  });

  it('GET inconnu → 404', async () => {
    const { app } = await setup();
    const res = await request(app).get('/api/v1/timesheets/unknown');
    expect(res.status).toBe(404);
  });

  it('POST /:id/sign → 200 + state=signed + push MP', async () => {
    const { app, mp } = await setup();
    const res = await request(app)
      .post('/api/v1/timesheets/ts-1/sign')
      .send({ reviewerUserId: 'disp-1' });
    expect(res.status).toBe(200);
    expect((res.body as { state: string }).state).toBe('signed');
    expect(mp.signCalls).toHaveLength(1);
  });

  it('POST /:id/dispute sans reason → 422', async () => {
    const { app } = await setup();
    const res = await request(app)
      .post('/api/v1/timesheets/ts-1/dispute')
      .send({ reviewerUserId: 'disp-1', reason: 'short' });
    expect(res.status).toBe(422);
  });

  it('POST /:id/dispute avec reason valide → 200', async () => {
    const { app, mp } = await setup();
    const res = await request(app).post('/api/v1/timesheets/ts-1/dispute').send({
      reviewerUserId: 'disp-1',
      reason: 'Heures supplémentaires non autorisées par client',
    });
    expect(res.status).toBe(200);
    expect((res.body as { state: string }).state).toBe('disputed');
    expect(mp.disputeCalls).toHaveLength(1);
  });

  it('POST /:id/sign avec MP transient → 503', async () => {
    const { app } = await setup({ mpFail: 'transient' });
    const res = await request(app)
      .post('/api/v1/timesheets/ts-1/sign')
      .send({ reviewerUserId: 'disp-1' });
    expect(res.status).toBe(503);
  });

  it('POST /:id/sign avec MP permanent → 502', async () => {
    const { app } = await setup({ mpFail: 'permanent' });
    const res = await request(app)
      .post('/api/v1/timesheets/ts-1/sign')
      .send({ reviewerUserId: 'disp-1' });
    expect(res.status).toBe(502);
  });

  it('viewer (read-only) ne peut PAS signer → 403', async () => {
    const { app } = await setup({
      user: { agencyId: AGENCY, userId: 'v', role: 'viewer' },
    });
    const res = await request(app)
      .post('/api/v1/timesheets/ts-1/sign')
      .send({ reviewerUserId: 'v' });
    expect(res.status).toBe(403);
  });

  it('sales (no read access timesheet) → 403 sur GET', async () => {
    const { app } = await setup({
      user: { agencyId: AGENCY, userId: 's', role: 'sales' },
    });
    const res = await request(app).get('/api/v1/timesheets');
    expect(res.status).toBe(403);
  });

  it('GET /export.csv → 200 + CSV', async () => {
    const { app } = await setup();
    const res = await request(app).get('/api/v1/timesheets/export.csv');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text.split('\n')[0]).toContain('externalTimesheetId');
    expect(res.text).toContain('mp-ts-1');
  });

  it('multi-tenant : autre agencyId → 0 items list', async () => {
    const { app } = await setup({
      user: { agencyId: 'agency-b', userId: 'admin', role: 'agency_admin' },
    });
    const res = await request(app).get('/api/v1/timesheets');
    expect(res.status).toBe(200);
    expect((res.body as ListResponseDto).items).toHaveLength(0);
  });
});
