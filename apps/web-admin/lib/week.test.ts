import { describe, expect, it } from 'vitest';
import { isoDateOnly, isoMondayOf, shiftWeek, weekDaysFromMonday } from './week.js';

describe('isoMondayOf', () => {
  it('mercredi → lundi de la même semaine', () => {
    const wed = new Date('2026-04-22T08:00:00Z');
    expect(isoDateOnly(isoMondayOf(wed))).toBe('2026-04-20');
  });

  it('dimanche → lundi 6 jours avant (ISO week)', () => {
    const sun = new Date('2026-04-26T20:00:00Z');
    expect(isoDateOnly(isoMondayOf(sun))).toBe('2026-04-20');
  });

  it('lundi → lui-même normalisé à 00:00 UTC', () => {
    const mon = new Date('2026-04-20T15:30:00Z');
    expect(isoMondayOf(mon).toISOString()).toBe('2026-04-20T00:00:00.000Z');
  });
});

describe('weekDaysFromMonday', () => {
  it('renvoie 7 dates consécutives depuis le lundi', () => {
    const mon = new Date('2026-04-20T00:00:00Z');
    const days = weekDaysFromMonday(mon);
    expect(days).toHaveLength(7);
    expect(isoDateOnly(days[0])).toBe('2026-04-20');
    expect(isoDateOnly(days[6])).toBe('2026-04-26');
  });
});

describe('shiftWeek', () => {
  it('+1 semaine', () => {
    const mon = new Date('2026-04-20T00:00:00Z');
    expect(isoDateOnly(shiftWeek(mon, 1))).toBe('2026-04-27');
  });
  it('-2 semaines', () => {
    const mon = new Date('2026-04-20T00:00:00Z');
    expect(isoDateOnly(shiftWeek(mon, -2))).toBe('2026-04-06');
  });
});
