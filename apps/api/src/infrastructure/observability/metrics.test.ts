import { describe, expect, it } from 'vitest';
import {
  buildCircuitBreakerPrometheusHook,
  metricsRegistry,
  mpCbState,
  mpRequestTotal,
  pathTemplate,
  statusBucket,
} from './metrics.js';

describe('statusBucket', () => {
  it('200 → 2xx', () => {
    expect(statusBucket(200)).toBe('2xx');
  });
  it('404 → 4xx', () => {
    expect(statusBucket(404)).toBe('4xx');
  });
  it('503 → 5xx', () => {
    expect(statusBucket(503)).toBe('5xx');
  });
  it('undefined → error', () => {
    expect(statusBucket(undefined)).toBe('error');
  });
  it('99 → unknown', () => {
    expect(statusBucket(99)).toBe('unknown');
  });
});

describe('pathTemplate', () => {
  it('remplace partnerId et staffId', () => {
    expect(pathTemplate('/api/v1/partners/agency-42/workers/staff-7/availability')).toBe(
      '/api/v1/partners/:partnerId/workers/:staffId/availability',
    );
  });
  it('remplace requestId', () => {
    expect(pathTemplate('/api/v1/partners/p/assignments/req-99/response')).toBe(
      '/api/v1/partners/:partnerId/assignments/:requestId/response',
    );
  });
  it('remplace timesheetId', () => {
    expect(pathTemplate('/api/v1/partners/p/timesheets/ts-1/sign')).toBe(
      '/api/v1/partners/:partnerId/timesheets/:timesheetId/sign',
    );
  });
  it('path sans ID → inchangé', () => {
    expect(pathTemplate('/api/v1/partners/p/timesheets')).toBe(
      '/api/v1/partners/:partnerId/timesheets',
    );
  });
});

describe('metricsRegistry', () => {
  it("incrémente mpRequestTotal et l'expose via metrics()", async () => {
    mpRequestTotal.inc({ endpoint: '/test', method: 'GET', status: '2xx' });
    const output = await metricsRegistry.metrics();
    expect(output).toContain('mp_request_total');
    expect(output).toContain('endpoint="/test"');
  });

  it('expose le prefix interim_api_ pour les métriques default process', async () => {
    const output = await metricsRegistry.metrics();
    expect(output).toContain('interim_api_process_cpu_user_seconds_total');
  });
});

describe('buildCircuitBreakerPrometheusHook', () => {
  it('mappe les états vers 0/1/2 dans la gauge', () => {
    const hook = buildCircuitBreakerPrometheusHook();
    hook({ name: 'cb-test', from: 'closed', to: 'open' });
    // Metric can be inspected via registry text output.
    return metricsRegistry.metrics().then((out) => {
      expect(out).toContain('mp_cb_state{name="cb-test"} 2');
    });
  });

  it('half-open → 1, closed → 0', async () => {
    const hook = buildCircuitBreakerPrometheusHook();
    hook({ name: 'cb-test', from: 'open', to: 'half-open' });
    expect(await metricsRegistry.metrics()).toContain('mp_cb_state{name="cb-test"} 1');
    hook({ name: 'cb-test', from: 'half-open', to: 'closed' });
    expect(await metricsRegistry.metrics()).toContain('mp_cb_state{name="cb-test"} 0');
  });
});

describe('mpCbState gauge direct API', () => {
  it('set() met la valeur', async () => {
    mpCbState.set({ name: 'direct' }, 2);
    expect(await metricsRegistry.metrics()).toContain('mp_cb_state{name="direct"} 2');
  });
});
