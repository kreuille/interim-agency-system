import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { FixedClock } from '@interim/shared';
import { asAgencyId, asMissionProposalId, asStaffId, MissionProposal } from '@interim/domain';
import {
  AcceptOnBehalfUseCase,
  AssignRoutingModeUseCase,
  InMemoryMissionProposalRepository,
  RefuseOnBehalfUseCase,
  ScriptedProposalMpResponsePort,
} from '@interim/application';
import { tenantMiddleware } from '../../../shared/middleware/tenant.middleware.js';
import { createProposalsRouter } from './proposals.controller.js';

const NOW = new Date('2026-04-22T08:00:00Z');
const clock = new FixedClock(NOW);
const AGENCY = 'agency-a';

interface SetupOpts {
  readonly user?: { agencyId: string; userId: string; role: string };
  readonly mpOutcome?: 'ok' | 'transient' | 'permanent';
}

async function setup(opts: SetupOpts = {}) {
  const repo = new InMemoryMissionProposalRepository();
  const port = new ScriptedProposalMpResponsePort([{ kind: opts.mpOutcome ?? 'ok' }]);
  const assignRouting = new AssignRoutingModeUseCase(repo, clock);
  const accept = new AcceptOnBehalfUseCase(repo, port, clock);
  const refuse = new RefuseOnBehalfUseCase(repo, port, clock);

  const proposal = MissionProposal.create({
    id: asMissionProposalId('mp-1'),
    agencyId: asAgencyId(AGENCY),
    externalRequestId: 'mp-req-1',
    workerId: asStaffId('worker-1'),
    missionSnapshot: {
      title: 'Cariste',
      clientName: 'ACME',
      siteAddress: 'Rue 1',
      canton: 'GE',
      hourlyRateRappen: 3200,
      startsAt: new Date('2026-04-25T07:00:00Z'),
      endsAt: new Date('2026-04-25T16:00:00Z'),
      skillsRequired: ['cariste'],
    },
    proposedAt: NOW,
    responseDeadline: new Date(NOW.getTime() + 30 * 60 * 1000),
    clock,
  });
  proposal.transitionTo('agency_review', {}, clock);
  await repo.save(proposal);

  const app = express();
  app.use(express.json());
  const u = opts.user ?? { agencyId: AGENCY, userId: 'admin', role: 'agency_admin' };
  app.use((req, _res, next) => {
    req.user = { agencyId: u.agencyId, userId: u.userId, role: u.role };
    next();
  });
  app.use(tenantMiddleware);
  app.use('/api/v1/proposals', createProposalsRouter({ repo, assignRouting, accept, refuse }));

  return { app, repo, port };
}

interface DtoResponse {
  readonly id: string;
  readonly state: string;
}

interface ListResponse {
  readonly items: readonly DtoResponse[];
  readonly nextCursor: string | null;
}

describe('proposals.controller', () => {
  it('GET /api/v1/proposals → liste', async () => {
    const { app } = await setup();
    const res = await request(app).get('/api/v1/proposals');
    expect(res.status).toBe(200);
    const body = res.body as ListResponse;
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.state).toBe('agency_review');
  });

  it('GET /api/v1/proposals?state=accepted → 0 items', async () => {
    const { app } = await setup();
    const res = await request(app).get('/api/v1/proposals?state=accepted');
    expect(res.status).toBe(200);
    expect((res.body as ListResponse).items).toHaveLength(0);
  });

  it('GET /api/v1/proposals/:id détail', async () => {
    const { app } = await setup();
    const res = await request(app).get('/api/v1/proposals/mp-1');
    expect(res.status).toBe(200);
    expect((res.body as DtoResponse).id).toBe('mp-1');
  });

  it('GET /api/v1/proposals/export.csv → CSV avec header + ligne', async () => {
    const { app } = await setup();
    const res = await request(app).get('/api/v1/proposals/export.csv');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('proposals.csv');
    const csv = res.text;
    expect(csv.split('\n')[0]).toContain('id,externalRequestId,state');
    expect(csv).toContain('mp-1');
    expect(csv).toContain('ACME');
  });

  it('GET /api/v1/proposals/export.csv → 403 si rôle insuffisant', async () => {
    const { app } = await setup({
      user: { agencyId: AGENCY, userId: 'a', role: 'payroll_officer' },
    });
    const res = await request(app).get('/api/v1/proposals/export.csv');
    expect(res.status).toBe(403);
  });

  it('POST /api/v1/proposals/:id/accept happy path', async () => {
    const { app, repo } = await setup({ mpOutcome: 'ok' });
    const res = await request(app)
      .post('/api/v1/proposals/mp-1/accept')
      .set('idempotency-key', 'idem-1')
      .send({ notes: 'ok' });
    expect(res.status).toBe(200);
    expect((res.body as { state: string }).state).toBe('accepted');
    const updated = await repo.findById(asAgencyId(AGENCY), asMissionProposalId('mp-1'));
    expect(updated?.state).toBe('accepted');
  });

  it('POST /api/v1/proposals/:id/refuse avec reason structurée', async () => {
    const { app } = await setup({ mpOutcome: 'ok' });
    const res = await request(app)
      .post('/api/v1/proposals/mp-1/refuse')
      .set('idempotency-key', 'idem-2')
      .send({ reason: { kind: 'cct_below_minimum' } });
    expect(res.status).toBe(200);
    expect((res.body as { state: string }).state).toBe('refused');
  });

  it('POST /refuse `other` sans freeform → 400 (DomainError fallback)', async () => {
    const { app } = await setup({ mpOutcome: 'ok' });
    const res = await request(app)
      .post('/api/v1/proposals/mp-1/refuse')
      .set('idempotency-key', 'idem-3')
      .send({ reason: { kind: 'other' } });
    expect(res.status).toBe(400);
  });

  it('POST /accept proposal inconnue → 404', async () => {
    const { app } = await setup();
    const res = await request(app)
      .post('/api/v1/proposals/unknown/accept')
      .set('idempotency-key', 'idem-4')
      .send({});
    expect(res.status).toBe(404);
  });

  it('POST /accept MP transient error → 502', async () => {
    const { app } = await setup({ mpOutcome: 'transient' });
    const res = await request(app)
      .post('/api/v1/proposals/mp-1/accept')
      .set('idempotency-key', 'idem-5')
      .send({});
    expect(res.status).toBe(502);
  });

  it('POST /:id/routing assigne pass_through', async () => {
    const repo = new InMemoryMissionProposalRepository();
    const port = new ScriptedProposalMpResponsePort();
    const assignRouting = new AssignRoutingModeUseCase(repo, clock);
    const accept = new AcceptOnBehalfUseCase(repo, port, clock);
    const refuse = new RefuseOnBehalfUseCase(repo, port, clock);
    const p = MissionProposal.create({
      id: asMissionProposalId('mp-2'),
      agencyId: asAgencyId(AGENCY),
      externalRequestId: 'mp-req-2',
      missionSnapshot: {
        title: 't',
        clientName: 'c',
        siteAddress: 'a',
        canton: 'GE',
        hourlyRateRappen: 3000,
        startsAt: new Date('2026-04-25T07:00:00Z'),
        endsAt: new Date('2026-04-25T16:00:00Z'),
        skillsRequired: [],
      },
      proposedAt: NOW,
      clock,
    });
    await repo.save(p);
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { agencyId: AGENCY, userId: 'admin', role: 'agency_admin' };
      next();
    });
    app.use(tenantMiddleware);
    app.use('/api/v1/proposals', createProposalsRouter({ repo, assignRouting, accept, refuse }));
    const res = await request(app)
      .post('/api/v1/proposals/mp-2/routing')
      .send({ mode: 'pass_through' });
    expect(res.status).toBe(200);
    expect((res.body as { state: string }).state).toBe('pass_through_sent');
  });

  it('GET /api/v1/proposals → 403 si rôle insuffisant (payroll_officer sans proposal:read)', async () => {
    const { app } = await setup({
      user: { agencyId: AGENCY, userId: 'a', role: 'payroll_officer' },
    });
    const res = await request(app).get('/api/v1/proposals');
    expect(res.status).toBe(403);
  });

  it('POST /:id/accept → 403 si role read-only', async () => {
    const { app } = await setup({
      user: { agencyId: AGENCY, userId: 'a', role: 'auditor' },
    });
    const res = await request(app).post('/api/v1/proposals/mp-1/accept').send({});
    expect(res.status).toBe(403);
  });
});
