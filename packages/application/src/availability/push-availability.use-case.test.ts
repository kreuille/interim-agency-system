import { describe, expect, it } from 'vitest';
import { FixedClock } from '@interim/shared';
import { asAgencyId, asStaffId } from '@interim/domain';
import { PushAvailabilityUseCase } from './push-availability.use-case.js';
import { OUTBOX_BACKOFF_SECONDS, type AvailabilityOutboxRow } from './availability-outbox.js';
import {
  InMemoryAvailabilityOutboxRepository,
  ScriptedAvailabilityPushPort,
} from './test-helpers.js';

const NOW = new Date('2026-04-22T08:00:00Z');

function buildRow(overrides: Partial<AvailabilityOutboxRow> = {}): AvailabilityOutboxRow {
  return {
    id: 'outbox-1',
    agencyId: asAgencyId('agency-a'),
    workerId: asStaffId('worker-1'),
    idempotencyKey: 'idem-1',
    payload: {
      slots: [
        {
          slotId: 's-1',
          dateFrom: '2026-04-22T08:00:00.000Z',
          dateTo: '2026-04-22T17:00:00.000Z',
          status: 'available',
          source: 'internal',
        },
      ],
    },
    status: 'pending',
    attempts: 0,
    nextAttemptAt: NOW,
    lastError: undefined,
    createdAt: NOW,
    ...overrides,
  };
}

describe('PushAvailabilityUseCase', () => {
  it("drain : succès → markSuccess + idempotencyKey passé à l'adapter", async () => {
    const outbox = new InMemoryAvailabilityOutboxRepository();
    await outbox.insert(buildRow());
    const port = new ScriptedAvailabilityPushPort([{ kind: 'ok', accepted: 1, rejected: 0 }]);
    const useCase = new PushAvailabilityUseCase(outbox, port, new FixedClock(NOW));
    const result = await useCase.execute();
    expect(result).toEqual({ processed: 1, succeeded: 1, failed: 0, dead: 0 });
    expect(port.calls[0]?.idempotencyKey).toBe('idem-1');
    expect(outbox.snapshot()[0]?.status).toBe('success');
  });

  it('échec transient → markFailure + nextAttemptAt selon backoff', async () => {
    const outbox = new InMemoryAvailabilityOutboxRepository();
    await outbox.insert(buildRow({ id: 'r-1' }));
    const port = new ScriptedAvailabilityPushPort([{ kind: 'transient', message: 'boom' }]);
    const useCase = new PushAvailabilityUseCase(outbox, port, new FixedClock(NOW));
    const result = await useCase.execute();
    expect(result.failed).toBe(1);
    const row = outbox.snapshot().find((r) => r.id === 'r-1');
    expect(row?.status).toBe('failed');
    expect(row?.attempts).toBe(1);
    expect(row?.nextAttemptAt?.getTime()).toBe(
      NOW.getTime() + (OUTBOX_BACKOFF_SECONDS[1] ?? 0) * 1000,
    );
  });

  it('échec permanent → status dead immédiat', async () => {
    const outbox = new InMemoryAvailabilityOutboxRepository();
    await outbox.insert(buildRow({ id: 'r-1' }));
    const port = new ScriptedAvailabilityPushPort([{ kind: 'permanent', message: '400 bad slot' }]);
    const useCase = new PushAvailabilityUseCase(outbox, port, new FixedClock(NOW));
    const result = await useCase.execute();
    expect(result.dead).toBe(1);
    const row = outbox.snapshot().find((r) => r.id === 'r-1');
    expect(row?.status).toBe('dead');
  });

  it('épuise les tentatives → status dead', async () => {
    const outbox = new InMemoryAvailabilityOutboxRepository();
    // Row déjà à `attempts = OUTBOX_BACKOFF_SECONDS.length - 1`
    await outbox.insert(buildRow({ id: 'r-1', attempts: OUTBOX_BACKOFF_SECONDS.length - 1 }));
    const port = new ScriptedAvailabilityPushPort([{ kind: 'transient' }]);
    const useCase = new PushAvailabilityUseCase(outbox, port, new FixedClock(NOW));
    await useCase.execute();
    const row = outbox.snapshot().find((r) => r.id === 'r-1');
    expect(row?.status).toBe('dead');
  });

  it('respecte batchSize et nextAttemptAt futur', async () => {
    const outbox = new InMemoryAvailabilityOutboxRepository();
    await outbox.insert(buildRow({ id: 'r-1' }));
    await outbox.insert(buildRow({ id: 'r-2', createdAt: new Date(NOW.getTime() + 1) }));
    await outbox.insert(
      buildRow({
        id: 'r-3',
        nextAttemptAt: new Date(NOW.getTime() + 3600 * 1000), // 1h plus tard
      }),
    );
    const port = new ScriptedAvailabilityPushPort([
      { kind: 'ok', accepted: 1, rejected: 0 },
      { kind: 'ok', accepted: 1, rejected: 0 },
    ]);
    const useCase = new PushAvailabilityUseCase(outbox, port, new FixedClock(NOW), 5);
    const result = await useCase.execute();
    expect(result.processed).toBe(2); // r-3 pas encore due
    expect(result.succeeded).toBe(2);
  });
});
