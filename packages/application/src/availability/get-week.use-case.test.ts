import { describe, expect, it } from 'vitest';
import { FixedClock } from '@interim/shared';
import { asAgencyId, asStaffId } from '@interim/domain';
import { AddSlotUseCase } from './add-slot.use-case.js';
import { GetWeekAvailabilityUseCase } from './get-week.use-case.js';
import {
  InMemoryAvailabilityEventPublisher,
  InMemoryWorkerAvailabilityRepository,
} from './test-helpers.js';

const NOW = new Date('2026-04-22T08:00:00Z'); // mercredi
const MONDAY = new Date('2026-04-20T00:00:00Z');

function setup() {
  const repo = new InMemoryWorkerAvailabilityRepository();
  const publisher = new InMemoryAvailabilityEventPublisher();
  const clock = new FixedClock(NOW);
  let counter = 0;
  const idFactory = (): string => `wa-${String(++counter)}`;
  const add = new AddSlotUseCase(repo, publisher, clock, idFactory);
  const getWeek = new GetWeekAvailabilityUseCase(repo, clock);
  return { repo, add, getWeek };
}

describe('GetWeekAvailabilityUseCase', () => {
  const agencyId = asAgencyId('agency-a');
  const workerId = asStaffId('worker-1');

  it('retourne stale + tableau vide si aucun aggrégat', async () => {
    const { getWeek } = setup();
    const view = await getWeek.execute({ agencyId, workerId, weekStart: MONDAY });
    expect(view.instances).toEqual([]);
    expect(view.freshness).toBe('stale');
    expect(view.weekEnd.getTime() - view.weekStart.getTime()).toBe(7 * 24 * 3600 * 1000);
  });

  it('retourne realtime juste après création', async () => {
    const { add, getWeek } = setup();
    await add.execute({
      agencyId,
      workerId,
      dateFrom: new Date('2026-04-22T08:00:00Z'),
      dateTo: new Date('2026-04-22T17:00:00Z'),
      status: 'available',
      source: 'internal',
    });
    const view = await getWeek.execute({ agencyId, workerId, weekStart: MONDAY });
    expect(view.freshness).toBe('realtime');
    expect(view.instances).toHaveLength(1);
  });
});
