import { describe, expect, it, vi } from 'vitest';
import { CircuitBreaker, CircuitOpenError } from './circuit-breaker.js';

let timeNow = 1_000_000;
const now = (): number => timeNow;
function advance(ms: number): void {
  timeNow += ms;
}

describe('CircuitBreaker', () => {
  it('reste closed sur succès', async () => {
    timeNow = 1_000_000;
    const cb = new CircuitBreaker({ name: 'test', now });
    for (let i = 0; i < 10; i++) {
      await cb.execute(() => Promise.resolve('ok'));
    }
    expect(cb.getState()).toBe('closed');
  });

  it('ouvre quand err% > seuil sur volume minimum', async () => {
    timeNow = 1_000_000;
    const events: { from: string; to: string }[] = [];
    const cb = new CircuitBreaker({
      name: 'test',
      volumeThreshold: 5,
      errorThresholdPercentage: 50,
      now,
      onStateChange: (e) => events.push({ from: e.from, to: e.to }),
    });
    // 5 échecs consécutifs → 100% err% → ouvert
    for (let i = 0; i < 5; i++) {
      await expect(cb.execute(() => Promise.reject(new Error('boom')))).rejects.toThrow();
    }
    expect(cb.getState()).toBe('open');
    expect(events.at(-1)).toEqual({ from: 'closed', to: 'open' });
  });

  it('CircuitOpenError quand open', async () => {
    timeNow = 1_000_000;
    const cb = new CircuitBreaker({
      name: 'test',
      volumeThreshold: 1,
      errorThresholdPercentage: 50,
      now,
    });
    await expect(cb.execute(() => Promise.reject(new Error('boom')))).rejects.toThrow();
    await expect(cb.execute(() => Promise.resolve('x'))).rejects.toBeInstanceOf(CircuitOpenError);
  });

  it('transition open → half-open après resetTimeoutMs', async () => {
    timeNow = 1_000_000;
    const events: { from: string; to: string }[] = [];
    const cb = new CircuitBreaker({
      name: 'test',
      volumeThreshold: 1,
      resetTimeoutMs: 30_000,
      now,
      onStateChange: (e) => events.push({ from: e.from, to: e.to }),
    });
    await expect(cb.execute(() => Promise.reject(new Error('boom')))).rejects.toThrow();
    expect(cb.getState()).toBe('open');
    advance(30_001);
    expect(cb.getState()).toBe('half-open');
    expect(events.map((e) => `${e.from}>${e.to}`)).toContain('open>half-open');
  });

  it('half-open succès → close', async () => {
    timeNow = 1_000_000;
    const cb = new CircuitBreaker({
      name: 'test',
      volumeThreshold: 1,
      resetTimeoutMs: 30_000,
      now,
    });
    await expect(cb.execute(() => Promise.reject(new Error('boom')))).rejects.toThrow();
    advance(30_001);
    await cb.execute(() => Promise.resolve('ok'));
    expect(cb.getState()).toBe('closed');
  });

  it('half-open échec → open avec nouveau timer', async () => {
    timeNow = 1_000_000;
    const cb = new CircuitBreaker({
      name: 'test',
      volumeThreshold: 1,
      resetTimeoutMs: 30_000,
      now,
    });
    await expect(cb.execute(() => Promise.reject(new Error('boom')))).rejects.toThrow();
    advance(30_001);
    expect(cb.getState()).toBe('half-open');
    await expect(cb.execute(() => Promise.reject(new Error('again')))).rejects.toThrow();
    expect(cb.getState()).toBe('open');
  });

  it('err% mesuré sur la fenêtre glissante (vieux échecs ignorés)', async () => {
    timeNow = 1_000_000;
    const cb = new CircuitBreaker({
      name: 'test',
      volumeThreshold: 5,
      errorThresholdPercentage: 50,
      rollingCountTimeoutMs: 30_000,
      rollingCountBuckets: 10,
      now,
    });
    // 4 échecs il y a longtemps
    for (let i = 0; i < 4; i++) {
      await expect(cb.execute(() => Promise.reject(new Error('old')))).rejects.toThrow();
    }
    advance(31_000); // au-delà de la fenêtre
    // 5 succès récents → err% = 0
    for (let i = 0; i < 5; i++) {
      await cb.execute(() => Promise.resolve('ok'));
    }
    expect(cb.getState()).toBe('closed');
  });

  it('onStateChange notifié à chaque changement', async () => {
    timeNow = 1_000_000;
    const onStateChange = vi.fn();
    const cb = new CircuitBreaker({
      name: 'mp-availability-push',
      volumeThreshold: 1,
      resetTimeoutMs: 1_000,
      now,
      onStateChange,
    });
    await expect(cb.execute(() => Promise.reject(new Error('x')))).rejects.toThrow();
    expect(onStateChange).toHaveBeenCalledWith({
      name: 'mp-availability-push',
      from: 'closed',
      to: 'open',
    });
    advance(1_001);
    cb.getState();
    expect(onStateChange).toHaveBeenCalledWith({
      name: 'mp-availability-push',
      from: 'open',
      to: 'half-open',
    });
    await cb.execute(() => Promise.resolve('ok'));
    expect(onStateChange).toHaveBeenCalledWith({
      name: 'mp-availability-push',
      from: 'half-open',
      to: 'closed',
    });
  });
});
