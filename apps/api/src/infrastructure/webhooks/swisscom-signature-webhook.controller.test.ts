import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  createSwisscomSignatureWebhookRouter,
  type SwisscomSecurityLogEntry,
} from './swisscom-signature-webhook.controller.js';
import { signSwisscomPayload } from './swisscom-hmac-verifier.js';

const NOW = new Date('2026-04-22T08:00:00Z');
const SECRET = 'swisscom-secret-current';

interface BuildAppOptions {
  readonly handlerError?: Error;
  readonly previousSecret?: string;
  readonly noSecret?: boolean;
}

function buildApp(opts: BuildAppOptions = {}) {
  const handler = {
    handle: vi.fn().mockImplementation(() => {
      if (opts.handlerError) return Promise.reject(opts.handlerError);
      return Promise.resolve();
    }),
  };
  const securityLog = vi.fn<(event: SwisscomSecurityLogEntry) => void>();
  const secrets = {
    getSecrets: () => {
      if (opts.noSecret) throw new Error('no_secret');
      return opts.previousSecret
        ? { current: SECRET, previous: opts.previousSecret }
        : { current: SECRET };
    },
  };
  const app = express();
  app.use(
    '/webhooks/signature/swisscom',
    createSwisscomSignatureWebhookRouter({
      secrets,
      handler,
      now: () => NOW,
      securityLog,
    }),
  );
  return { app, handler, securityLog };
}

describe('swisscom-signature-webhook.controller', () => {
  it('signature valide → 200 + handler appelé avec payload parsé', async () => {
    const { app, handler } = buildApp();
    const eventId = 'evt-1';
    const ts = NOW.toISOString();
    const body = JSON.stringify({ envelopeId: 'env-x', status: 'signed' });
    const sig = signSwisscomPayload({ eventId, timestamp: ts, rawBody: body, secret: SECRET });
    const res = await request(app)
      .post('/webhooks/signature/swisscom')
      .set('content-type', 'application/json')
      .set('x-swisscom-event-id', eventId)
      .set('x-swisscom-timestamp', ts)
      .set('x-swisscom-signature', sig)
      .set('x-swisscom-event-type', 'envelope.signed')
      .send(body);
    expect(res.status).toBe(200);
    expect(handler.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'evt-1',
        eventType: 'envelope.signed',
        timestamp: ts,
        secretVersion: 'current',
        payload: { envelopeId: 'env-x', status: 'signed' },
      }),
    );
  });

  it('signature invalide → 401 + log webhook.swisscom.hmac.invalid + handler non appelé', async () => {
    const { app, handler, securityLog } = buildApp();
    const eventId = 'evt-bad';
    const ts = NOW.toISOString();
    const body = '{}';
    const badSig = signSwisscomPayload({
      eventId,
      timestamp: ts,
      rawBody: body,
      secret: 'wrong',
    });
    const res = await request(app)
      .post('/webhooks/signature/swisscom')
      .set('content-type', 'application/json')
      .set('x-swisscom-event-id', eventId)
      .set('x-swisscom-timestamp', ts)
      .set('x-swisscom-signature', badSig)
      .send(body);
    expect(res.status).toBe(401);
    expect(handler.handle).not.toHaveBeenCalled();
    expect(securityLog).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'webhook.swisscom.hmac.invalid' }),
    );
  });

  it('header manquant → 401 + log malformed', async () => {
    const { app, securityLog } = buildApp();
    const res = await request(app)
      .post('/webhooks/signature/swisscom')
      .set('content-type', 'application/json')
      .send('{}');
    expect(res.status).toBe(401);
    expect(securityLog).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'webhook.swisscom.hmac.malformed' }),
    );
  });

  it('content-type non json → 415', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/webhooks/signature/swisscom')
      .set('content-type', 'text/plain')
      .send('oops');
    expect(res.status).toBe(415);
  });

  it('pas de secret → 503', async () => {
    const { app } = buildApp({ noSecret: true });
    const res = await request(app)
      .post('/webhooks/signature/swisscom')
      .set('content-type', 'application/json')
      .send('{}');
    expect(res.status).toBe(503);
  });

  it('handler throw → 500 + log handler.error', async () => {
    const { app, securityLog } = buildApp({ handlerError: new Error('boom') });
    const eventId = 'evt-h';
    const ts = NOW.toISOString();
    const body = '{}';
    const sig = signSwisscomPayload({ eventId, timestamp: ts, rawBody: body, secret: SECRET });
    const res = await request(app)
      .post('/webhooks/signature/swisscom')
      .set('content-type', 'application/json')
      .set('x-swisscom-event-id', eventId)
      .set('x-swisscom-timestamp', ts)
      .set('x-swisscom-signature', sig)
      .send(body);
    expect(res.status).toBe(500);
    expect(securityLog).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'webhook.swisscom.handler.error' }),
    );
  });

  it('GET /_health → ok + secrets accepted', async () => {
    const { app } = buildApp({ previousSecret: 'prev' });
    const res = await request(app).get('/webhooks/signature/swisscom/_health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      secretsAccepted: ['current', 'previous'],
    });
  });
});
