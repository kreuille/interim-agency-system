import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createMockApp } from './app.js';
import { signWebhookPayload } from './hmac.js';

const config = {
  hmacSecret: 'test-secret',
  apiWebhookUrl: 'http://127.0.0.1:1/webhook-never-reached',
};

describe('mock-moveplanner', () => {
  it('GET /health returns 200', async () => {
    const response = await request(createMockApp(config)).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ok' });
  });

  it('POST /api/v1/partners/:id/workers/:staffId/availability counts slots', async () => {
    const response = await request(createMockApp(config))
      .post('/api/v1/partners/mp-1/workers/staff-1/availability')
      .send({ slots: [{}, {}, {}] });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ accepted: 3, rejected: 0 });
  });

  it('GET /api/v1/partners/:id/timesheets returns fixture with at least one entry', async () => {
    const response = await request(createMockApp(config)).get('/api/v1/partners/mp-1/timesheets');
    expect(response.status).toBe(200);
    const body = response.body as { data: unknown[] };
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });
});

describe('signWebhookPayload', () => {
  it('produces deterministic hmac format', () => {
    const signed = signWebhookPayload('secret', { hello: 'world' });
    expect(signed.signature).toMatch(/^[0-9a-f]{64}$/);
    expect(signed.eventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
