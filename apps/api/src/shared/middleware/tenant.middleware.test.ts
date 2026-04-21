import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { tenantMiddleware } from './tenant.middleware.js';
import { currentTenant } from '../context/tenant-context.js';

function buildTestApp(userFactory?: () => { agencyId: string; userId?: string; role?: string }) {
  const app = express();
  app.use((req, _res, next) => {
    if (userFactory) {
      req.user = userFactory();
    }
    next();
  });
  app.use(tenantMiddleware);
  app.get('/whoami', (_req, res) => {
    const ctx = currentTenant();
    res.json({ agencyId: ctx.agencyId, actorId: ctx.actorId ?? null });
  });
  return app;
}

describe('tenantMiddleware', () => {
  it('returns 401 when no user is attached to the request', async () => {
    const response = await request(buildTestApp()).get('/whoami');
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'unauthenticated' });
  });

  it('exposes the agencyId from the authenticated user', async () => {
    const response = await request(
      buildTestApp(() => ({ agencyId: 'agency-a', userId: 'user-1', role: 'agency_admin' })),
    ).get('/whoami');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ agencyId: 'agency-a', actorId: 'user-1' });
  });

  it('isolates concurrent requests across tenants', async () => {
    const appA = buildTestApp(() => ({ agencyId: 'agency-a' }));
    const appB = buildTestApp(() => ({ agencyId: 'agency-b' }));

    const [resA, resB] = await Promise.all([
      request(appA).get('/whoami'),
      request(appB).get('/whoami'),
    ]);
    expect(resA.body).toEqual({ agencyId: 'agency-a', actorId: null });
    expect(resB.body).toEqual({ agencyId: 'agency-b', actorId: null });
  });
});
