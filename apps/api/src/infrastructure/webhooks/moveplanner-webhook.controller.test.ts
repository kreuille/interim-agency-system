import { describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import {
  createMoveplannerWebhookRouter,
  type SecurityLogEntry,
} from './moveplanner-webhook.controller.js';
import { StaticWebhookSecretProvider } from './secret-rotation.service.js';

const NOW = new Date('2026-04-22T08:00:00Z');
const SECRET = 'mp-secret-current';

function sign(secret: string, eventId: string, ts: string, body: string): string {
  return createHmac('sha256', secret).update(`${eventId}.${ts}.${body}`).digest('hex');
}

interface BuildAppOptions {
  readonly handlerError?: Error;
  readonly previousSecret?: string;
}

function buildApp(opts: BuildAppOptions = {}) {
  const handler = {
    handle: vi.fn().mockImplementation(() => {
      if (opts.handlerError) return Promise.reject(opts.handlerError);
      return Promise.resolve();
    }),
  };
  const securityLog = vi.fn<(event: SecurityLogEntry) => void>();
  const app = express();
  app.use(
    '/webhooks/moveplanner',
    createMoveplannerWebhookRouter({
      secrets: new StaticWebhookSecretProvider(
        opts.previousSecret
          ? { current: SECRET, previous: opts.previousSecret }
          : { current: SECRET },
      ),
      handler,
      now: () => NOW,
      securityLog,
    }),
  );
  return { app, handler, securityLog };
}

describe('moveplanner-webhook.controller', () => {
  it('signature valide → 200 + handler appelé avec eventId/eventType/payload', async () => {
    const { app, handler } = buildApp();
    const eventId = 'evt-1';
    const ts = NOW.toISOString();
    const body = JSON.stringify({ kind: 'mission.proposed', requestId: 'r-1' });
    const sig = sign(SECRET, eventId, ts, body);
    const res = await request(app)
      .post('/webhooks/moveplanner')
      .set('content-type', 'application/json')
      .set('x-moveplanner-event-id', eventId)
      .set('x-moveplanner-timestamp', ts)
      .set('x-moveplanner-signature', `sha256=${sig}`)
      .set('x-moveplanner-event-type', 'mission.proposed')
      .send(body);
    expect(res.status).toBe(200);
    expect(handler.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'evt-1',
        eventType: 'mission.proposed',
        timestamp: ts,
        payload: { kind: 'mission.proposed', requestId: 'r-1' },
      }),
    );
  });

  it('signature invalide → 401 + log webhook.hmac.invalid', async () => {
    const { app, handler, securityLog } = buildApp();
    const eventId = 'evt-2';
    const ts = NOW.toISOString();
    const body = '{}';
    const res = await request(app)
      .post('/webhooks/moveplanner')
      .set('content-type', 'application/json')
      .set('x-moveplanner-event-id', eventId)
      .set('x-moveplanner-timestamp', ts)
      .set('x-moveplanner-signature', `sha256=${'a'.repeat(64)}`)
      .send(body);
    expect(res.status).toBe(401);
    expect(handler.handle).not.toHaveBeenCalled();
    expect(securityLog).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'webhook.hmac.invalid' }),
    );
  });

  it('timestamp +6 min → 401 + log webhook.hmac.skew', async () => {
    const { app, securityLog } = buildApp();
    const eventId = 'evt-3';
    const ts = new Date(NOW.getTime() + 6 * 60 * 1000).toISOString();
    const body = '{}';
    const sig = sign(SECRET, eventId, ts, body);
    const res = await request(app)
      .post('/webhooks/moveplanner')
      .set('content-type', 'application/json')
      .set('x-moveplanner-event-id', eventId)
      .set('x-moveplanner-timestamp', ts)
      .set('x-moveplanner-signature', `sha256=${sig}`)
      .send(body);
    expect(res.status).toBe(401);
    expect(securityLog).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'webhook.hmac.skew' }),
    );
  });

  it('header manquant → 401 + log webhook.hmac.malformed', async () => {
    const { app, securityLog } = buildApp();
    const res = await request(app)
      .post('/webhooks/moveplanner')
      .set('content-type', 'application/json')
      .send('{}');
    expect(res.status).toBe(401);
    expect(securityLog).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'webhook.hmac.malformed' }),
    );
  });

  it('signature OK avec secret précédent (rotation grace) → 200', async () => {
    const previous = 'mp-secret-old';
    const { app, handler } = buildApp({ previousSecret: previous });
    const eventId = 'evt-4';
    const ts = NOW.toISOString();
    const body = '{}';
    const sig = sign(previous, eventId, ts, body);
    const res = await request(app)
      .post('/webhooks/moveplanner')
      .set('content-type', 'application/json')
      .set('x-moveplanner-event-id', eventId)
      .set('x-moveplanner-timestamp', ts)
      .set('x-moveplanner-signature', `sha256=${sig}`)
      .send(body);
    expect(res.status).toBe(200);
    expect(handler.handle).toHaveBeenCalled();
  });

  it('body modifié post-signature → 401', async () => {
    const { app, securityLog } = buildApp();
    const eventId = 'evt-5';
    const ts = NOW.toISOString();
    const original = '{"k":"v"}';
    const sig = sign(SECRET, eventId, ts, original);
    const res = await request(app)
      .post('/webhooks/moveplanner')
      .set('content-type', 'application/json')
      .set('x-moveplanner-event-id', eventId)
      .set('x-moveplanner-timestamp', ts)
      .set('x-moveplanner-signature', `sha256=${sig}`)
      .send('{"k":"tampered"}');
    expect(res.status).toBe(401);
    expect(securityLog).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'webhook.hmac.invalid' }),
    );
  });

  it('handler error → 500 + log webhook.handler.error', async () => {
    const { app, securityLog } = buildApp({ handlerError: new Error('handler boom') });
    const eventId = 'evt-6';
    const ts = NOW.toISOString();
    const body = '{}';
    const sig = sign(SECRET, eventId, ts, body);
    const res = await request(app)
      .post('/webhooks/moveplanner')
      .set('content-type', 'application/json')
      .set('x-moveplanner-event-id', eventId)
      .set('x-moveplanner-timestamp', ts)
      .set('x-moveplanner-signature', `sha256=${sig}`)
      .send(body);
    expect(res.status).toBe(500);
    expect(securityLog).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'webhook.handler.error' }),
    );
  });

  it('GET /_health renvoie les versions de secret acceptées', async () => {
    const { app } = buildApp({ previousSecret: 'mp-secret-old' });
    const res = await request(app).get('/webhooks/moveplanner/_health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      secretsAccepted: ['current', 'previous'],
      tolerance: '±5min',
    });
  });

  it('GET /_health renvoie [current] si pas de secret précédent', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/webhooks/moveplanner/_health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ secretsAccepted: ['current'] });
  });

  it('Content-Type non application/json → 415', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/webhooks/moveplanner')
      .set('content-type', 'text/plain')
      .send('hello');
    expect(res.status).toBe(415);
  });
});
