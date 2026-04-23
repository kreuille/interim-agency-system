import { afterEach, describe, expect, it, vi } from 'vitest';
import { Counter, Registry } from 'prom-client';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { startMetricsServer } from './server.js';

let server: Server | undefined;

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => {
      server?.close(() => {
        resolve();
      });
    });
    server = undefined;
  }
});

describe('startMetricsServer', () => {
  function buildRegistry(): Registry {
    const reg = new Registry();
    const c = new Counter({ name: 'test_total', help: 'test', registers: [reg] });
    c.inc(42);
    return reg;
  }

  function urlOf(): string {
    const addr = server?.address() as AddressInfo | null;
    if (!addr) throw new Error('server not listening');
    return `http://127.0.0.1:${String(addr.port)}`;
  }

  it('GET /metrics retourne text/plain avec les métriques', async () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    server = startMetricsServer({ port: 0, registry: buildRegistry(), logger });
    // Wait for listening
    await new Promise((r) => server?.once('listening', r));

    const res = await fetch(`${urlOf()}/metrics`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    const body = await res.text();
    expect(body).toContain('test_total 42');
    expect(logger.info).toHaveBeenCalledWith(
      'metrics-server listening',
      expect.objectContaining({ port: expect.any(Number) }),
    );
  });

  it('GET /health retourne 200 {status:ok}', async () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    server = startMetricsServer({ port: 0, registry: buildRegistry(), logger });
    await new Promise((r) => server?.once('listening', r));

    const res = await fetch(`${urlOf()}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('ok');
  });

  it('GET /unknown retourne 404', async () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    server = startMetricsServer({ port: 0, registry: buildRegistry(), logger });
    await new Promise((r) => server?.once('listening', r));

    const res = await fetch(`${urlOf()}/foo`);
    expect(res.status).toBe(404);
  });

  it('POST /metrics retourne 405', async () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    server = startMetricsServer({ port: 0, registry: buildRegistry(), logger });
    await new Promise((r) => server?.once('listening', r));

    const res = await fetch(`${urlOf()}/metrics`, { method: 'POST' });
    expect(res.status).toBe(405);
  });

  it('onScrape hook appelé avant /metrics', async () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    const onScrape = vi.fn().mockResolvedValue(undefined);
    server = startMetricsServer({ port: 0, registry: buildRegistry(), logger, onScrape });
    await new Promise((r) => server?.once('listening', r));

    await fetch(`${urlOf()}/metrics`);
    expect(onScrape).toHaveBeenCalledTimes(1);
  });

  it('onScrape qui throw → /metrics répond quand même 200 (degraded mode)', async () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    const onScrape = vi.fn().mockRejectedValue(new Error('db down'));
    server = startMetricsServer({ port: 0, registry: buildRegistry(), logger, onScrape });
    await new Promise((r) => server?.once('listening', r));

    const res = await fetch(`${urlOf()}/metrics`);
    expect(res.status).toBe(200);
    expect(logger.error).toHaveBeenCalledWith(
      'onScrape hook failed (continuing)',
      expect.objectContaining({ error: 'db down' }),
    );
  });
});
