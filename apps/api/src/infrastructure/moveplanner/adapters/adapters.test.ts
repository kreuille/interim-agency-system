import { describe, expect, it, vi } from 'vitest';
import { MpClient } from '../mp-client.js';
import { StaticApiKeyProvider } from '../api-key-provider.js';
import { InMemoryOutboundIdempotencyStore } from '../outbound-idempotency.store.js';
import { WorkerPushAdapter } from './worker-push.adapter.js';
import { AvailabilityPushAdapter } from './availability-push.adapter.js';
import { AssignmentResponseAdapter } from './assignment-response.adapter.js';
import { TimesheetAdapter } from './timesheet.adapter.js';

interface FetchCall {
  readonly url: string;
  readonly init: RequestInit;
}

function buildClient(responseBody: unknown, status = 200) {
  const calls: FetchCall[] = [];
  const fetchFn = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(new Response(JSON.stringify(responseBody), { status }));
  }) as unknown as typeof fetch;
  const client = new MpClient({
    baseUrl: 'https://mp.example.test',
    apiKey: new StaticApiKeyProvider('k1'),
    idempotencyStore: new InMemoryOutboundIdempotencyStore(),
    fetchFn,
    sleepFn: vi.fn().mockResolvedValue(undefined),
  });
  return { client, calls };
}

describe('WorkerPushAdapter', () => {
  it('POST workers avec partnerId dans le path', async () => {
    const { client, calls } = buildClient({ accepted: true, staffId: 's1' });
    const adapter = new WorkerPushAdapter(client, 'agency-x');
    const result = await adapter.push({
      externalRef: 'w-1',
      firstName: 'Jean',
      lastName: 'Dupont',
      avs: '756.1234.5678.97',
      residenceCanton: 'GE',
    });
    expect(result.ok).toBe(true);
    expect(calls[0]?.url).toBe('https://mp.example.test/api/v1/partners/agency-x/workers');
    expect(calls[0]?.init.method).toBe('POST');
  });
});

describe('AvailabilityPushAdapter', () => {
  it('POST availability avec staffId', async () => {
    const { client, calls } = buildClient({ accepted: 1, rejected: 0 });
    const adapter = new AvailabilityPushAdapter(client, 'agency-x');
    const result = await adapter.push('staff-42', {
      slots: [
        {
          slotId: 's-1',
          dateFrom: '2026-04-22T08:00:00.000Z',
          dateTo: '2026-04-22T17:00:00.000Z',
          status: 'available',
          source: 'internal',
        },
      ],
    });
    expect(result.ok).toBe(true);
    expect(calls[0]?.url).toBe(
      'https://mp.example.test/api/v1/partners/agency-x/workers/staff-42/availability',
    );
  });
});

describe('AssignmentResponseAdapter', () => {
  it('POST decision = accepted', async () => {
    const { client, calls } = buildClient({ recorded: true });
    const adapter = new AssignmentResponseAdapter(client, 'agency-x');
    const result = await adapter.respond('req-99', { decision: 'accepted' });
    expect(result.ok).toBe(true);
    expect(calls[0]?.url).toBe(
      'https://mp.example.test/api/v1/partners/agency-x/assignments/req-99/response',
    );
  });
});

describe('TimesheetAdapter', () => {
  it('GET list', async () => {
    const { client, calls } = buildClient({ data: [] });
    const adapter = new TimesheetAdapter(client, 'agency-x');
    const result = await adapter.list();
    expect(result.ok).toBe(true);
    expect(calls[0]?.init.method).toBe('GET');
    expect(calls[0]?.url).toBe('https://mp.example.test/api/v1/partners/agency-x/timesheets');
  });

  it('POST sign', async () => {
    const { client, calls } = buildClient({ signed: true, signedAt: '2026-04-22T10:00:00Z' });
    const adapter = new TimesheetAdapter(client, 'agency-x');
    const result = await adapter.sign('ts-1', {
      approvedBy: 'admin-1',
      approvedAt: '2026-04-22T10:00:00Z',
    });
    expect(result.ok).toBe(true);
    expect(calls[0]?.url).toBe(
      'https://mp.example.test/api/v1/partners/agency-x/timesheets/ts-1/sign',
    );
  });
});
