import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  createIdempotencyMiddleware,
  type CachedResponse,
  type IdempotencyStore,
} from './idempotency.middleware.js';
import { runWithTenant } from '../context/tenant-context.js';

class InMemoryStore implements IdempotencyStore {
  private readonly rows = new Map<string, CachedResponse>();

  find(agencyId: string, key: string): Promise<CachedResponse | null> {
    return Promise.resolve(this.rows.get(`${agencyId}:${key}`) ?? null);
  }

  save(agencyId: string, key: string, entry: CachedResponse): Promise<void> {
    this.rows.set(`${agencyId}:${key}`, entry);
    return Promise.resolve();
  }

  size(): number {
    return this.rows.size;
  }
}

function buildApp(store: IdempotencyStore, handlerCount = { n: 0 }) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    runWithTenant({ agencyId: 'agency-a' }, () => {
      next();
    });
  });
  app.use((req, res, next) => {
    void createIdempotencyMiddleware({ store })(req, res, next);
  });
  app.post('/items', (req, res) => {
    handlerCount.n += 1;
    res.status(201).json({ id: `item-${String(handlerCount.n)}`, received: req.body });
  });
  app.get('/items', (_req, res) => {
    res.status(200).json({ ok: true });
  });
  return { app, handlerCount };
}

const KEY = '3f1b6b5e-6b4a-4b6a-9b4a-1b6a4b6a9b4a';
const OTHER_KEY = '3f1b6b5e-6b4a-4b6a-9b4a-1b6a4b6a9b4b';

describe('idempotencyMiddleware', () => {
  let store: InMemoryStore;

  beforeEach(() => {
    store = new InMemoryStore();
  });

  it('caches successful POST response and replays on retry with same key + body', async () => {
    const counter = { n: 0 };
    const { app } = buildApp(store, counter);

    const first = await request(app)
      .post('/items')
      .set('idempotency-key', KEY)
      .send({ name: 'foo' });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ id: 'item-1' });

    const second = await request(app)
      .post('/items')
      .set('idempotency-key', KEY)
      .send({ name: 'foo' });
    expect(second.status).toBe(201);
    expect(second.body).toMatchObject({ id: 'item-1' });
    expect(counter.n).toBe(1);
  });

  it('returns 422 when same key is reused with a different payload', async () => {
    const { app } = buildApp(store);
    await request(app).post('/items').set('idempotency-key', KEY).send({ name: 'foo' });
    const conflict = await request(app)
      .post('/items')
      .set('idempotency-key', KEY)
      .send({ name: 'bar' });
    expect(conflict.status).toBe(422);
    expect(conflict.body).toMatchObject({ error: 'idempotency_key_conflict' });
  });

  it('different keys are independent', async () => {
    const counter = { n: 0 };
    const { app } = buildApp(store, counter);
    await request(app).post('/items').set('idempotency-key', KEY).send({ a: 1 });
    await request(app).post('/items').set('idempotency-key', OTHER_KEY).send({ a: 1 });
    expect(counter.n).toBe(2);
  });

  it('returns 400 when idempotency-key is not a UUID v4', async () => {
    const { app } = buildApp(store);
    const response = await request(app)
      .post('/items')
      .set('idempotency-key', 'not-a-uuid')
      .send({});
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: 'idempotency_key_format' });
  });

  it('GET requests bypass the middleware (no cache)', async () => {
    const { app } = buildApp(store);
    await request(app).get('/items').set('idempotency-key', KEY);
    expect(store.size()).toBe(0);
  });

  it('POST without idempotency-key is not cached', async () => {
    const { app } = buildApp(store);
    await request(app).post('/items').send({ name: 'foo' });
    expect(store.size()).toBe(0);
  });

  it('non-2xx responses are not cached', async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      runWithTenant({ agencyId: 'agency-a' }, () => {
        next();
      });
    });
    app.use((req, res, next) => {
      void createIdempotencyMiddleware({ store })(req, res, next);
    });
    app.post('/broken', (_req, res) => {
      res.status(500).json({ error: 'boom' });
    });
    await request(app).post('/broken').set('idempotency-key', KEY).send({});
    expect(store.size()).toBe(0);
  });
});
