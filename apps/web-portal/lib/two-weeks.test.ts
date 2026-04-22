import { describe, expect, it } from 'vitest';
import { buildTwoWeeks, isoDateOnly, isoMondayOf, type SlotInstance } from './two-weeks.js';

describe('isoMondayOf', () => {
  it('renvoie le lundi de la semaine ISO', () => {
    const wed = new Date('2026-04-22T12:34:56Z');
    expect(isoDateOnly(isoMondayOf(wed))).toBe('2026-04-20');
  });
  it('dimanche → lundi 6 jours avant', () => {
    const sun = new Date('2026-04-26T22:00:00Z');
    expect(isoDateOnly(isoMondayOf(sun))).toBe('2026-04-20');
  });
});

describe('buildTwoWeeks', () => {
  const MONDAY = new Date('2026-04-20T00:00:00Z');

  it('renvoie 14 cellules avec status unknown si aucun slot', () => {
    const cells = buildTwoWeeks(MONDAY, []);
    expect(cells).toHaveLength(14);
    expect(cells.every((c) => c.status === 'unknown')).toBe(true);
  });

  it('marque available un jour entièrement couvert par un slot dispo', () => {
    const slots: SlotInstance[] = [
      {
        slotId: 's-1',
        dateFrom: '2026-04-22T00:00:00.000Z',
        dateTo: '2026-04-23T00:00:00.000Z',
        status: 'available',
      },
    ];
    const cells = buildTwoWeeks(MONDAY, slots);
    expect(cells[0]?.status).toBe('unknown'); // lundi
    expect(cells[2]?.status).toBe('available'); // mercredi
    expect(cells[2]?.slotIds).toEqual(['s-1']);
  });

  it('marque mixed si plusieurs statuts sur le même jour', () => {
    const slots: SlotInstance[] = [
      {
        slotId: 's-1',
        dateFrom: '2026-04-22T08:00:00.000Z',
        dateTo: '2026-04-22T12:00:00.000Z',
        status: 'available',
      },
      {
        slotId: 's-2',
        dateFrom: '2026-04-22T13:00:00.000Z',
        dateTo: '2026-04-22T17:00:00.000Z',
        status: 'unavailable',
      },
    ];
    const cells = buildTwoWeeks(MONDAY, slots);
    expect(cells[2]?.status).toBe('mixed');
    expect(cells[2]?.slotIds).toHaveLength(2);
  });

  it('marque tentative comme mixed (pour rester simple côté UI portail)', () => {
    const slots: SlotInstance[] = [
      {
        slotId: 's-1',
        dateFrom: '2026-04-22T00:00:00.000Z',
        dateTo: '2026-04-23T00:00:00.000Z',
        status: 'tentative',
      },
    ];
    const cells = buildTwoWeeks(MONDAY, slots);
    expect(cells[2]?.status).toBe('mixed');
  });
});
