import { describe, it, expect } from 'vitest';
import { FixedClock } from '@interim/shared';
import { asAgencyId, asStaffId } from '../shared/ids.js';
import { WorkerAvailability, asWorkerAvailabilityId, SlotNotFound } from './worker-availability.js';

const NOW = new Date('2026-04-22T08:00:00Z');
const clock = new FixedClock(NOW);

function build(): WorkerAvailability {
  return WorkerAvailability.create({
    id: asWorkerAvailabilityId('wa-1'),
    agencyId: asAgencyId('agency-a'),
    workerId: asStaffId('worker-1'),
    clock,
  });
}

describe('WorkerAvailability', () => {
  it('create initialises with no slots and TTL +4h', () => {
    const wa = build();
    const snap = wa.toSnapshot();
    expect(snap.slots).toEqual([]);
    expect(snap.ttlExpiresAt.getTime() - NOW.getTime()).toBe(4 * 3600 * 1000);
  });

  it('addSlot creates a slot and updates lastUpdatedAt', () => {
    const wa = build();
    const slot = wa.addSlot(
      {
        dateFrom: new Date('2026-04-22T08:00:00Z'),
        dateTo: new Date('2026-04-22T17:00:00Z'),
        status: 'available',
        source: 'internal',
      },
      clock,
    );
    expect(slot.id).toMatch(/^[0-9a-f-]+$/);
    expect(wa.toSnapshot().slots).toHaveLength(1);
  });

  it('addSlot rejects dateTo <= dateFrom', () => {
    const wa = build();
    expect(() => {
      wa.addSlot(
        {
          dateFrom: new Date('2026-04-22T17:00:00Z'),
          dateTo: new Date('2026-04-22T08:00:00Z'),
          status: 'available',
          source: 'internal',
        },
        clock,
      );
    }).toThrow();
  });

  it('removeSlot existing slot succeeds', () => {
    const wa = build();
    const s = wa.addSlot(
      {
        dateFrom: new Date('2026-04-22T08:00:00Z'),
        dateTo: new Date('2026-04-22T17:00:00Z'),
        status: 'available',
        source: 'internal',
      },
      clock,
    );
    wa.removeSlot(s.id, clock);
    expect(wa.toSnapshot().slots).toHaveLength(0);
  });

  it('removeSlot unknown id throws SlotNotFound', () => {
    const wa = build();
    expect(() => {
      wa.removeSlot('nope', clock);
    }).toThrow(SlotNotFound);
  });

  it('effectiveInstances: 1 dispo + 1 indispo qui chevauche → 3 segments', () => {
    const wa = build();
    wa.addSlot(
      {
        dateFrom: new Date('2026-04-22T08:00:00Z'),
        dateTo: new Date('2026-04-22T17:00:00Z'),
        status: 'available',
        source: 'internal',
      },
      clock,
    );
    wa.addSlot(
      {
        dateFrom: new Date('2026-04-22T12:00:00Z'),
        dateTo: new Date('2026-04-22T13:00:00Z'),
        status: 'unavailable',
        source: 'worker_self',
        reason: 'lunch',
      },
      clock,
    );
    const result = wa.effectiveInstances(
      new Date('2026-04-22T00:00:00Z'),
      new Date('2026-04-23T00:00:00Z'),
    );
    expect(result).toHaveLength(3);
    expect(result[1]?.status).toBe('unavailable');
  });

  it('effectiveInstances expands RRULE WEEKLY/WE for 4 weeks', () => {
    const wa = build();
    wa.addSlot(
      {
        dateFrom: new Date('2026-04-22T08:00:00Z'), // mercredi
        dateTo: new Date('2026-04-22T17:00:00Z'),
        status: 'available',
        source: 'internal',
        rrule: 'FREQ=WEEKLY;BYDAY=WE',
      },
      clock,
    );
    const result = wa.effectiveInstances(
      new Date('2026-04-22T00:00:00Z'),
      new Date('2026-05-13T23:59:00Z'),
    );
    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  it('freshness: just created → realtime', () => {
    const wa = build();
    expect(wa.freshness(clock)).toBe('realtime');
  });

  it('rehydrate then snapshot is frozen', () => {
    const wa = build();
    const snap = wa.toSnapshot();
    expect(Object.isFrozen(snap)).toBe(true);
    const copy = WorkerAvailability.rehydrate({ ...snap });
    expect(copy.id).toBe(wa.id);
  });

  it('exposes agencyId and workerId getters', () => {
    const wa = build();
    expect(wa.agencyId).toBe('agency-a');
    expect(wa.workerId).toBe('worker-1');
  });

  it('asWorkerAvailabilityId rejects empty', () => {
    expect(() => asWorkerAvailabilityId('')).toThrow();
  });

  it('effectiveInstances filters out instances strictly outside [from, to]', () => {
    const wa = build();
    wa.addSlot(
      {
        dateFrom: new Date('2026-04-22T08:00:00Z'),
        dateTo: new Date('2026-04-22T17:00:00Z'),
        status: 'available',
        source: 'internal',
      },
      clock,
    );
    // Fenêtre lendemain : aucune instance.
    const result = wa.effectiveInstances(
      new Date('2026-04-23T00:00:00Z'),
      new Date('2026-04-23T23:59:00Z'),
    );
    expect(result).toEqual([]);
  });
});
