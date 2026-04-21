import { describe, it, expect } from 'vitest';
import { WeekIso } from './week-iso.js';

describe('WeekIso', () => {
  it('fromDate returns 2026-W19 for 2026-05-04 (a Monday)', () => {
    const d = new Date(Date.UTC(2026, 4, 4));
    expect(WeekIso.fromDate(d).toString()).toBe('2026-W19');
  });

  it('firstDayOf("2026-W19") returns 2026-05-04 UTC', () => {
    const first = WeekIso.firstDayOf('2026-W19');
    expect(first.getUTCFullYear()).toBe(2026);
    expect(first.getUTCMonth()).toBe(4);
    expect(first.getUTCDate()).toBe(4);
  });

  it('of rejects out-of-range week', () => {
    expect(() => WeekIso.of(2026, 54)).toThrow();
  });

  it('equals compares year + week', () => {
    expect(WeekIso.of(2026, 19).equals(WeekIso.of(2026, 19))).toBe(true);
    expect(WeekIso.of(2026, 19).equals(WeekIso.of(2026, 20))).toBe(false);
  });
});
