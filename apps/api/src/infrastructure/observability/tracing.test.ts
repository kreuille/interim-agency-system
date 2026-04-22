import { describe, expect, it } from 'vitest';
import { getTracer, traceMpCall } from './tracing.js';

describe('getTracer', () => {
  it('renvoie un Tracer OTel (no-op sans SDK wirée)', () => {
    const tracer = getTracer();
    expect(typeof tracer.startActiveSpan).toBe('function');
  });
});

describe('traceMpCall', () => {
  it('exécute fn et renvoie son résultat (chemin heureux)', async () => {
    const result = await traceMpCall(
      { endpoint: '/test', method: 'GET' },
      () => Promise.resolve({ ok: true as const, value: 42 }),
      (r) => ({ ok: r.ok }),
    );
    expect(result).toEqual({ ok: true, value: 42 });
  });

  it("propage l'exception thrown par fn", async () => {
    await expect(
      traceMpCall({ endpoint: '/x', method: 'POST' }, () => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');
  });

  it('interpretResult ok=false ne throw pas, renvoie la valeur', async () => {
    const result = await traceMpCall<{ ok: boolean; error?: string }>(
      { endpoint: '/x', method: 'GET' },
      () => Promise.resolve({ ok: false, error: 'nope' }),
      (r) => (r.ok ? { ok: true } : { ok: false, errorKind: r.error ?? 'unknown' }),
    );
    expect(result).toEqual({ ok: false, error: 'nope' });
  });
});
