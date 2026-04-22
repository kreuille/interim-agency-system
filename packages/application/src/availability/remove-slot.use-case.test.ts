import { describe, expect, it } from 'vitest';
import { FixedClock } from '@interim/shared';
import { asAgencyId, asStaffId, SlotNotFound } from '@interim/domain';
import { AddSlotUseCase } from './add-slot.use-case.js';
import { RemoveSlotUseCase, WorkerAvailabilityNotFound } from './remove-slot.use-case.js';
import {
  InMemoryAvailabilityEventPublisher,
  InMemoryWorkerAvailabilityRepository,
} from './test-helpers.js';

const NOW = new Date('2026-04-22T08:00:00Z');

function setup() {
  const repo = new InMemoryWorkerAvailabilityRepository();
  const publisher = new InMemoryAvailabilityEventPublisher();
  const clock = new FixedClock(NOW);
  let counter = 0;
  const idFactory = (): string => `wa-${String(++counter)}`;
  const add = new AddSlotUseCase(repo, publisher, clock, idFactory);
  const remove = new RemoveSlotUseCase(repo, publisher, clock);
  return { repo, publisher, add, remove };
}

describe('RemoveSlotUseCase', () => {
  const agencyId = asAgencyId('agency-a');
  const workerId = asStaffId('worker-1');

  it("retourne WorkerAvailabilityNotFound si l'agg n'existe pas", async () => {
    const { remove } = setup();
    const result = await remove.execute({ agencyId, workerId, slotId: 'nope' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(WorkerAvailabilityNotFound);
  });

  it('retourne SlotNotFound si le slotId est inconnu', async () => {
    const { add, remove } = setup();
    await add.execute({
      agencyId,
      workerId,
      dateFrom: new Date('2026-04-22T08:00:00Z'),
      dateTo: new Date('2026-04-22T17:00:00Z'),
      status: 'available',
      source: 'internal',
    });
    const result = await remove.execute({ agencyId, workerId, slotId: 'nope' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(SlotNotFound);
  });

  it('supprime un slot existant et publie AvailabilityChanged action=removed', async () => {
    const { add, remove, publisher } = setup();
    const created = await add.execute({
      agencyId,
      workerId,
      dateFrom: new Date('2026-04-22T08:00:00Z'),
      dateTo: new Date('2026-04-22T17:00:00Z'),
      status: 'available',
      source: 'internal',
    });
    if (!created.ok) throw new Error('expected ok');
    const result = await remove.execute({ agencyId, workerId, slotId: created.value.slotId });
    expect(result.ok).toBe(true);
    expect(publisher.published.at(-1)?.kind).toBe('AvailabilityChanged');
    if (publisher.published.at(-1)?.kind === 'AvailabilityChanged') {
      expect((publisher.published.at(-1) as { action: string }).action).toBe('removed');
    }
  });
});
