import { describe, expect, it, vi } from 'vitest';
import { MpClient, MpError } from './mp-client.js';
import { StaticApiKeyProvider } from './api-key-provider.js';
import { InMemoryOutboundIdempotencyStore } from './outbound-idempotency.store.js';
import { CircuitBreaker } from '../reliability/circuit-breaker.js';

interface FetchCall {
  readonly url: string;
  readonly init: RequestInit;
}

function makeFetchMock(responses: readonly (Response | (() => Response))[]): {
  fetchFn: typeof fetch;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  let i = 0;
  const fetchFn = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses[i];
    i = Math.min(i + 1, responses.length - 1);
    if (typeof next === 'function') return Promise.resolve(next());
    if (next === undefined) return Promise.resolve(new Response('', { status: 200 }));
    return Promise.resolve(next);
  }) as unknown as typeof fetch;
  return { fetchFn, calls };
}

function setup(opts: { responses: readonly (Response | (() => Response))[] }) {
  const sleep = vi.fn().mockResolvedValue(undefined);
  const { fetchFn, calls } = makeFetchMock(opts.responses);
  const idempotencyStore = new InMemoryOutboundIdempotencyStore();
  const client = new MpClient({
    baseUrl: 'https://mp.example.test',
    apiKey: new StaticApiKeyProvider('current-key', 'previous-key'),
    idempotencyStore,
    retryBackoffMs: [10, 20, 40, 80, 160],
    fetchFn,
    sleepFn: sleep,
  });
  return { client, calls, sleep, idempotencyStore };
}

describe('MpClient', () => {
  it('GET 200 → ok avec body parsé', async () => {
    const { client } = setup({
      responses: [new Response(JSON.stringify({ data: [] }), { status: 200 })],
    });
    const result = await client.request<{ data: unknown[] }>({
      method: 'GET',
      path: '/api/v1/partners/p1/timesheets',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.data).toEqual([]);
  });

  it('POST 200 ajoute Idempotency-Key et la cache', async () => {
    const { client, calls, idempotencyStore } = setup({
      responses: [new Response(JSON.stringify({ accepted: true }), { status: 200 })],
    });
    const result = await client.request({
      method: 'POST',
      path: '/api/v1/partners/p1/workers',
      body: { externalRef: 'w-1' },
    });
    expect(result.ok).toBe(true);
    expect((calls[0]?.init.headers as Record<string, string>)['idempotency-key']).toMatch(
      /^[0-9a-f-]{36}$/,
    );
    expect(idempotencyStore.size()).toBe(1);
  });

  it('POST avec idempotencyKey rejouée → renvoie cache sans nouvel appel', async () => {
    const { client, calls } = setup({
      responses: [new Response(JSON.stringify({ accepted: true }), { status: 200 })],
    });
    const opts = {
      method: 'POST' as const,
      path: '/api/v1/partners/p1/workers',
      body: { externalRef: 'w-1' },
      idempotencyKey: 'fixed-key-1',
    };
    await client.request(opts);
    await client.request(opts);
    expect(calls).toHaveLength(1);
  });

  it('5xx retry jusqu’au succès', async () => {
    const { client, calls } = setup({
      responses: [
        new Response('boom', { status: 502 }),
        new Response('boom', { status: 502 }),
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      ],
    });
    const result = await client.request({ method: 'GET', path: '/api/v1/partners/p1/x' });
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(3);
  });

  it('5xx persistant épuise les retry → server_error', async () => {
    const responses = Array.from({ length: 10 }, () => new Response('', { status: 500 }));
    const { client, calls } = setup({ responses });
    const result = await client.request({ method: 'GET', path: '/api/v1/partners/p1/x' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(MpError);
      expect(result.error.kind).toBe('server_error');
    }
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it('400 → client_error sans retry', async () => {
    const { client, calls } = setup({
      responses: [new Response('{"error":"bad"}', { status: 400 })],
    });
    const result = await client.request({
      method: 'POST',
      path: '/api/v1/partners/p1/workers',
      body: { externalRef: 'w-1' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('client_error');
    expect(calls).toHaveLength(1);
  });

  it('429 → rate_limited (retry possible avec backoff long)', async () => {
    const responses = Array.from({ length: 10 }, () => new Response('', { status: 429 }));
    const { client } = setup({ responses });
    const result = await client.request({ method: 'GET', path: '/api/v1/partners/p1/x' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('rate_limited');
  });

  it("network error → kind 'network' et retry", async () => {
    const fetchFn = (() => Promise.reject(new Error('ECONNRESET'))) as unknown as typeof fetch;
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = new MpClient({
      baseUrl: 'https://mp.example.test',
      apiKey: new StaticApiKeyProvider('k'),
      idempotencyStore: new InMemoryOutboundIdempotencyStore(),
      retryBackoffMs: [10, 20],
      fetchFn,
      sleepFn: sleep,
    });
    const result = await client.request({ method: 'GET', path: '/x' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('network');
    expect(sleep).toHaveBeenCalled();
  });

  it('Authorization header utilise la clé courante', async () => {
    const { client, calls } = setup({
      responses: [new Response('{}', { status: 200 })],
    });
    await client.request({ method: 'GET', path: '/x' });
    const auth = (calls[0]?.init.headers as Record<string, string>).authorization;
    expect(auth).toBe('Bearer current-key');
  });

  it('circuit breaker ouvre après seuil 5xx → renvoie circuit_open sans appel', async () => {
    const timeNow = 1_000_000;
    const responses = Array.from({ length: 20 }, () => new Response('', { status: 500 }));
    const { fetchFn, calls } = makeFetchMock(responses);
    const breaker = new CircuitBreaker({
      name: 'mp-test',
      volumeThreshold: 3,
      errorThresholdPercentage: 50,
      resetTimeoutMs: 60_000,
      now: () => timeNow,
    });
    const client = new MpClient({
      baseUrl: 'https://mp.example.test',
      apiKey: new StaticApiKeyProvider('k'),
      idempotencyStore: new InMemoryOutboundIdempotencyStore(),
      retryBackoffMs: [], // pas de retry interne pour isoler la logique CB
      fetchFn,
      sleepFn: vi.fn().mockResolvedValue(undefined),
      circuitBreaker: breaker,
    });
    // 3 appels échec → ouvre
    for (let i = 0; i < 3; i++) {
      await client.request({ method: 'GET', path: '/x' });
    }
    expect(breaker.getState()).toBe('open');
    const callsBefore = calls.length;
    const result = await client.request({ method: 'GET', path: '/x' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('circuit_open');
    expect(calls.length).toBe(callsBefore); // pas d'appel HTTP réel
  });

  it("circuit breaker ne s'ouvre pas sur 4xx (panne client, pas fournisseur)", async () => {
    const responses = Array.from({ length: 10 }, () => new Response('', { status: 400 }));
    const { fetchFn } = makeFetchMock(responses);
    const breaker = new CircuitBreaker({
      name: 'mp-test',
      volumeThreshold: 3,
      errorThresholdPercentage: 50,
    });
    const client = new MpClient({
      baseUrl: 'https://mp.example.test',
      apiKey: new StaticApiKeyProvider('k'),
      idempotencyStore: new InMemoryOutboundIdempotencyStore(),
      retryBackoffMs: [],
      fetchFn,
      sleepFn: vi.fn().mockResolvedValue(undefined),
      circuitBreaker: breaker,
    });
    for (let i = 0; i < 5; i++) {
      await client.request({ method: 'GET', path: '/x' });
    }
    expect(breaker.getState()).toBe('closed');
  });

  it('client_error mis en cache pour idempotency rejoue identique', async () => {
    const { client, calls } = setup({
      responses: [new Response('{"error":"bad"}', { status: 400 })],
    });
    const opts = {
      method: 'POST' as const,
      path: '/x',
      body: {},
      idempotencyKey: 'rejouée',
    };
    const a = await client.request(opts);
    const b = await client.request(opts);
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(false);
    expect(calls).toHaveLength(1); // pas de re-call
  });
});
