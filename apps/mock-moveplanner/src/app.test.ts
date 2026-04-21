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

  it('POST /api/v1/partners/:id/workers returns accepted', async () => {
    const response = await request(createMockApp(config))
      .post('/api/v1/partners/mp-1/workers')
      .send({ firstName: 'Jean' });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ accepted: true });
  });

  it('POST /assignments/:id/response records response', async () => {
    const response = await request(createMockApp(config))
      .post('/api/v1/partners/mp-1/assignments/req-42/response')
      .send({ accepted: true });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ recorded: true });
  });

  it('POST /timesheets/:id/sign returns signed', async () => {
    const response = await request(createMockApp(config))
      .post('/api/v1/partners/mp-1/timesheets/ts-1/sign')
      .send({});
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ signed: true });
  });

  it('POST /_mock/emit-webhook returns 502 when API is unreachable', async () => {
    const response = await request(createMockApp(config))
      .post('/_mock/emit-webhook')
      .send({ event: 'worker.assignment.proposed', payload: { x: 1 } });
    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({ dispatched: false });
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
