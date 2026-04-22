import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createWebhookIpRateLimitMiddleware } from './ip-rate-limit.js';

function buildApp(opts: Parameters<typeof createWebhookIpRateLimitMiddleware>[0]) {
  const app = express();
  app.use(createWebhookIpRateLimitMiddleware(opts));
  app.post('/', (_req, res) => {
    res.status(200).json({ ok: true });
  });
  return app;
}

describe('createWebhookIpRateLimitMiddleware', () => {
  it("autorise jusqu'à requestsPerMinute, refuse au-delà avec 429 + retry-after", async () => {
    const app = buildApp({ requestsPerMinute: 3 });
    for (let i = 0; i < 3; i++) {
      const res = await request(app).post('/').send({});
      expect(res.status).toBe(200);
    }
    const blocked = await request(app).post('/').send({});
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
    expect(blocked.body).toMatchObject({ error: 'rate_limited' });
  });

  it('réinitialise après la fenêtre 60s', async () => {
    let nowMs = 1_000_000;
    const onDenied = vi.fn();
    const app = buildApp({
      requestsPerMinute: 1,
      now: () => nowMs,
      onDenied,
    });
    expect((await request(app).post('/').send({})).status).toBe(200);
    expect((await request(app).post('/').send({})).status).toBe(429);
    nowMs += 61_000;
    expect((await request(app).post('/').send({})).status).toBe(200);
  });

  it('allowlist : refuse les IPs hors liste avec 403', async () => {
    const onDenied = vi.fn();
    const app = buildApp({ allowlist: ['203.0.113.42'], onDenied });
    const res = await request(app).post('/').send({});
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'ip_not_allowed' });
    expect(onDenied).toHaveBeenCalledWith(expect.objectContaining({ kind: 'not_in_allowlist' }));
  });

  it('hook onDenied appelé sur rate_limited', async () => {
    const onDenied = vi.fn();
    const app = buildApp({ requestsPerMinute: 1, onDenied });
    await request(app).post('/').send({});
    await request(app).post('/').send({});
    expect(onDenied).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'rate_limited', countInWindow: 2 }),
    );
  });
});
