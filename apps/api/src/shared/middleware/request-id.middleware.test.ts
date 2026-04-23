import { describe, expect, it } from 'vitest';
import express, { type Request } from 'express';
import request from 'supertest';
import { requestIdMiddleware } from './request-id.middleware.js';

describe('requestIdMiddleware', () => {
  function buildApp(): express.Express {
    const app = express();
    app.use(requestIdMiddleware);
    app.get('/echo', (req, res) => {
      const reqWithId = req as Request & { id: string };
      res.status(200).json({ id: reqWithId.id });
    });
    return app;
  }

  it('génère un UUIDv4 quand aucun header X-Request-Id', async () => {
    const res = await request(buildApp()).get('/echo');
    const body = res.body as { id: string };
    expect(res.status).toBe(200);
    expect(typeof body.id).toBe('string');
    expect(body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(res.headers['x-request-id']).toBe(body.id);
  });

  it('respecte X-Request-Id fourni par le client', async () => {
    const res = await request(buildApp()).get('/echo').set('X-Request-Id', 'req_abc_123');
    const body = res.body as { id: string };
    expect(body.id).toBe('req_abc_123');
    expect(res.headers['x-request-id']).toBe('req_abc_123');
  });

  it('respecte X-Correlation-Id en alternative', async () => {
    const res = await request(buildApp()).get('/echo').set('X-Correlation-Id', 'corr_456');
    const body = res.body as { id: string };
    expect(body.id).toBe('corr_456');
    expect(res.headers['x-request-id']).toBe('corr_456');
  });

  it('ignore un X-Request-Id vide', async () => {
    const res = await request(buildApp()).get('/echo').set('X-Request-Id', '');
    const body = res.body as { id: string };
    expect(body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
  });

  it('ignore un X-Request-Id trop long (> 128 chars, protection abuse)', async () => {
    const huge = 'a'.repeat(200);
    const res = await request(buildApp()).get('/echo').set('X-Request-Id', huge);
    const body = res.body as { id: string };
    expect(body.id).not.toBe(huge);
    expect(body.id.length).toBeLessThanOrEqual(40);
  });
});
