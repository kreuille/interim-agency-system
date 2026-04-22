import { describe, expect, it } from 'vitest';
import { FixedClock } from '@interim/shared';
import { asAgencyId, asStaffId } from '@interim/domain';
import { AddSlotUseCase } from './add-slot.use-case.js';
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
  const useCase = new AddSlotUseCase(repo, publisher, clock, idFactory);
  return { repo, publisher, clock, useCase };
}

describe('AddSlotUseCase', () => {
  const agencyId = asAgencyId('agency-a');
  const workerId = asStaffId('worker-1');

  it('crée un nouvel aggrégat si absent et publie AvailabilityDeclared', async () => {
    const { repo, publisher, useCase } = setup();
    const result = await useCase.execute({
      agencyId,
      workerId,
      dateFrom: new Date('2026-04-22T08:00:00Z'),
      dateTo: new Date('2026-04-22T17:00:00Z'),
      status: 'available',
      source: 'internal',
    });
    expect(result.ok).toBe(true);
    expect(repo.size()).toBe(1);
    expect(publisher.published).toHaveLength(1);
    expect(publisher.published[0]?.kind).toBe('AvailabilityDeclared');
  });

  it("réutilise l'aggrégat existant pour ajouter un slot", async () => {
    const { repo, publisher, useCase } = setup();
    await useCase.execute({
      agencyId,
      workerId,
      dateFrom: new Date('2026-04-22T08:00:00Z'),
      dateTo: new Date('2026-04-22T12:00:00Z'),
      status: 'available',
      source: 'internal',
    });
    await useCase.execute({
      agencyId,
      workerId,
      dateFrom: new Date('2026-04-22T13:00:00Z'),
      dateTo: new Date('2026-04-22T17:00:00Z'),
      status: 'available',
      source: 'internal',
    });
    expect(repo.size()).toBe(1);
    expect(publisher.published).toHaveLength(2);
  });

  it('propage reason et rrule au slot', async () => {
    const { publisher, useCase } = setup();
    const result = await useCase.execute({
      agencyId,
      workerId,
      dateFrom: new Date('2026-04-22T08:00:00Z'),
      dateTo: new Date('2026-04-22T17:00:00Z'),
      status: 'unavailable',
      source: 'worker_self',
      reason: 'vacation',
      rrule: 'FREQ=WEEKLY;BYDAY=WE',
    });
    expect(result.ok).toBe(true);
    const evt = publisher.published[0];
    expect(evt?.kind).toBe('AvailabilityDeclared');
    if (evt?.kind === 'AvailabilityDeclared') {
      expect(evt.status).toBe('unavailable');
      expect(evt.source).toBe('worker_self');
    }
  });

  it('rejette dateTo <= dateFrom (validation domaine)', async () => {
    const { useCase } = setup();
    await expect(
      useCase.execute({
        agencyId,
        workerId,
        dateFrom: new Date('2026-04-22T17:00:00Z'),
        dateTo: new Date('2026-04-22T08:00:00Z'),
        status: 'available',
        source: 'internal',
      }),
    ).rejects.toThrow();
  });
});
