import { describe, it, expect } from 'vitest';
import { FixedClock } from '@interim/shared';
import {
  expandSlot,
  freshnessFromUpdate,
  resolveOverlaps,
  InvalidSlotWindow,
  type AvailabilitySlotProps,
} from './availability-slot.js';

const NOW = new Date('2026-04-22T08:00:00Z'); // mercredi
const clock = new FixedClock(NOW);

function slot(overrides: Partial<AvailabilitySlotProps> = {}): AvailabilitySlotProps {
  return {
    id: 'slot-1',
    dateFrom: new Date('2026-04-22T08:00:00Z'),
    dateTo: new Date('2026-04-22T17:00:00Z'),
    status: 'available',
    source: 'internal',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('expandSlot', () => {
  it('returns the base instance when no rrule', () => {
    const result = expandSlot(slot(), new Date('2026-05-22'));
    expect(result).toHaveLength(1);
  });

  it('expands FREQ=WEEKLY;BYDAY=WE for 4 weeks → 4 instances', () => {
    const s = slot({ rrule: 'FREQ=WEEKLY;BYDAY=WE' });
    const result = expandSlot(s, new Date('2026-05-13T08:00:00Z'));
    expect(result).toHaveLength(4); // base + 3 mercredis suivants
  });

  it('expands BYDAY=MO,TU,TH and respects COUNT', () => {
    const monday = new Date('2026-04-20T08:00:00Z'); // lundi
    const s = slot({
      dateFrom: monday,
      dateTo: new Date('2026-04-20T17:00:00Z'),
      rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,TH;COUNT=5',
    });
    const result = expandSlot(s, new Date('2026-12-31T00:00:00Z'));
    expect(result.length).toBe(5);
  });

  it('expands until UNTIL=...Z', () => {
    const s = slot({ rrule: 'FREQ=WEEKLY;BYDAY=WE;UNTIL=20260513T080000Z' });
    const result = expandSlot(s, new Date('2099-12-31'));
    expect(result.length).toBeGreaterThanOrEqual(4);
    expect(result.length).toBeLessThan(10);
  });

  it('throws InvalidSlotWindow if dateTo <= dateFrom', () => {
    expect(() =>
      expandSlot(
        slot({
          dateFrom: new Date('2026-04-22T17:00:00Z'),
          dateTo: new Date('2026-04-22T08:00:00Z'),
        }),
        new Date('2026-05-22'),
      ),
    ).toThrow(InvalidSlotWindow);
  });

  it('ignores invalid rrule (returns base)', () => {
    const result = expandSlot(slot({ rrule: 'NOT_A_RRULE' }), new Date('2026-05-22'));
    expect(result).toHaveLength(1);
  });

  it('ignores rrule with unsupported FREQ', () => {
    const result = expandSlot(slot({ rrule: 'FREQ=DAILY;BYDAY=MO' }), new Date('2026-05-22'));
    expect(result).toHaveLength(1);
  });

  it('ignores rrule with empty BYDAY', () => {
    const result = expandSlot(slot({ rrule: 'FREQ=WEEKLY;BYDAY=' }), new Date('2026-05-22'));
    expect(result).toHaveLength(1);
  });

  it('ignores invalid COUNT (NaN) and applies BYDAY only', () => {
    const s = slot({ rrule: 'FREQ=WEEKLY;BYDAY=WE;COUNT=abc' });
    const result = expandSlot(s, new Date('2026-05-13T08:00:00Z'));
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('expands with reason propagated on each instance', () => {
    const s = slot({ rrule: 'FREQ=WEEKLY;BYDAY=WE;COUNT=2', reason: 'training' });
    const result = expandSlot(s, new Date('2026-05-22T08:00:00Z'));
    expect(result.length).toBe(2);
    expect(result[0]?.reason).toBe('training');
    expect(result[1]?.reason).toBe('training');
  });
});

describe('resolveOverlaps', () => {
  it('unavailable prime sur available sur la même plage', () => {
    const a = {
      slotId: 'a',
      dateFrom: new Date('2026-04-22T08:00:00Z'),
      dateTo: new Date('2026-04-22T17:00:00Z'),
      status: 'available' as const,
      source: 'internal' as const,
    };
    const b = {
      slotId: 'b',
      dateFrom: new Date('2026-04-22T12:00:00Z'),
      dateTo: new Date('2026-04-22T13:00:00Z'),
      status: 'unavailable' as const,
      source: 'worker_self' as const,
      reason: 'lunch',
    };
    const lastUpdated = new Map<string, Date>([
      ['a', new Date('2026-04-22T07:00:00Z')],
      ['b', new Date('2026-04-22T11:30:00Z')],
    ]);
    const result = resolveOverlaps([a, b], lastUpdated);
    // 3 segments : avail [08-12], unavail [12-13], avail [13-17]
    expect(result).toHaveLength(3);
    expect(result[1]?.status).toBe('unavailable');
    expect(result[1]?.reason).toBe('lunch');
  });

  it('à statut égal, last updated wins', () => {
    const a = {
      slotId: 'a',
      dateFrom: new Date('2026-04-22T08:00:00Z'),
      dateTo: new Date('2026-04-22T17:00:00Z'),
      status: 'available' as const,
      source: 'internal' as const,
    };
    const b = {
      slotId: 'b',
      dateFrom: new Date('2026-04-22T10:00:00Z'),
      dateTo: new Date('2026-04-22T15:00:00Z'),
      status: 'available' as const,
      source: 'worker_self' as const,
    };
    const lastUpdated = new Map<string, Date>([
      ['a', new Date('2026-04-22T07:00:00Z')],
      ['b', new Date('2026-04-22T09:00:00Z')], // plus récent
    ]);
    const result = resolveOverlaps([a, b], lastUpdated);
    // sur le segment central (10-15), le winner doit être 'b' (worker_self)
    const middle = result.find(
      (r) => r.dateFrom.getTime() === new Date('2026-04-22T10:00:00Z').getTime(),
    );
    expect(middle?.source).toBe('worker_self');
  });

  it('returns empty for empty input', () => {
    expect(resolveOverlaps([], new Map())).toEqual([]);
  });

  it('merge adjacent slots with same identity', () => {
    const a = {
      slotId: 'a',
      dateFrom: new Date('2026-04-22T08:00:00Z'),
      dateTo: new Date('2026-04-22T12:00:00Z'),
      status: 'available' as const,
      source: 'internal' as const,
    };
    const b = {
      slotId: 'a',
      dateFrom: new Date('2026-04-22T12:00:00Z'),
      dateTo: new Date('2026-04-22T17:00:00Z'),
      status: 'available' as const,
      source: 'internal' as const,
    };
    const result = resolveOverlaps([a, b], new Map([['a', NOW]]));
    expect(result).toHaveLength(1);
    expect(result[0]?.dateTo.toISOString()).toBe('2026-04-22T17:00:00.000Z');
  });
});

describe('freshnessFromUpdate', () => {
  it('< 30 min → realtime', () => {
    expect(freshnessFromUpdate(new Date(NOW.getTime() - 10 * 60 * 1000), clock)).toBe('realtime');
  });

  it('30 min..4 h → cached', () => {
    expect(freshnessFromUpdate(new Date(NOW.getTime() - 2 * 3600 * 1000), clock)).toBe('cached');
  });

  it('> 4 h → stale', () => {
    expect(freshnessFromUpdate(new Date(NOW.getTime() - 5 * 3600 * 1000), clock)).toBe('stale');
  });
});
