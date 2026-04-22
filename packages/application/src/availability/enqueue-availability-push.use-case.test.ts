import { describe, expect, it } from 'vitest';
import { FixedClock } from '@interim/shared';
import { asAgencyId, asStaffId, asWorkerAvailabilityId, WorkerAvailability } from '@interim/domain';
import { EnqueueAvailabilityPushUseCase } from './enqueue-availability-push.use-case.js';
import { InMemoryAvailabilityOutboxRepository } from './test-helpers.js';

const NOW = new Date('2026-04-22T08:00:00Z');

describe('EnqueueAvailabilityPushUseCase', () => {
  const agencyId = asAgencyId('agency-a');
  const workerId = asStaffId('worker-1');
  const clock = new FixedClock(NOW);

  function buildAggWithSlot() {
    const wa = WorkerAvailability.create({
      id: asWorkerAvailabilityId('wa-1'),
      agencyId,
      workerId,
      clock,
    });
    wa.addSlot(
      {
        dateFrom: new Date('2026-04-22T08:00:00Z'),
        dateTo: new Date('2026-04-22T17:00:00Z'),
        status: 'available',
        source: 'internal',
      },
      clock,
    );
    return wa;
  }

  it('insère une row outbox `pending` avec idempotencyKey unique', async () => {
    const outbox = new InMemoryAvailabilityOutboxRepository();
    let count = 0;
    const idFactory = (): string => `id-${String(++count)}`;
    const useCase = new EnqueueAvailabilityPushUseCase(outbox, clock, idFactory);
    const agg = buildAggWithSlot();
    const result = await useCase.execute({ agencyId, workerId, aggregate: agg });
    expect(result.outboxId).toBe('id-1');
    expect(result.idempotencyKey).toBe('id-2');
    const row = outbox.snapshot()[0];
    expect(row?.status).toBe('pending');
    expect(row?.payload.slots).toHaveLength(1);
    expect(row?.payload.slots[0]?.status).toBe('available');
  });

  it("propage reason s'il est défini sur le slot", async () => {
    const outbox = new InMemoryAvailabilityOutboxRepository();
    const useCase = new EnqueueAvailabilityPushUseCase(outbox, clock);
    const agg = WorkerAvailability.create({
      id: asWorkerAvailabilityId('wa-1'),
      agencyId,
      workerId,
      clock,
    });
    agg.addSlot(
      {
        dateFrom: new Date('2026-04-22T08:00:00Z'),
        dateTo: new Date('2026-04-22T17:00:00Z'),
        status: 'unavailable',
        source: 'worker_self',
        reason: 'vacation',
      },
      clock,
    );
    await useCase.execute({ agencyId, workerId, aggregate: agg });
    expect(outbox.snapshot()[0]?.payload.slots[0]?.reason).toBe('vacation');
  });
});
