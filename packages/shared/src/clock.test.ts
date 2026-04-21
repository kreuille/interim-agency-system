import { describe, it, expect } from 'vitest';
import { FixedClock, SystemClock } from './clock.js';

describe('SystemClock', () => {
  it('returns a Date close to now', () => {
    const clock = new SystemClock();
    const before = Date.now();
    const time = clock.now().getTime();
    const after = Date.now();
    expect(time).toBeGreaterThanOrEqual(before);
    expect(time).toBeLessThanOrEqual(after);
  });
});

describe('FixedClock', () => {
  it('always returns the same fixed instant', () => {
    const fixed = new Date('2026-04-21T08:00:00Z');
    const clock = new FixedClock(fixed);
    expect(clock.now().toISOString()).toBe(fixed.toISOString());
    expect(clock.now().toISOString()).toBe(fixed.toISOString());
  });

  it('returns a fresh Date instance to prevent mutation', () => {
    const fixed = new Date('2026-04-21T08:00:00Z');
    const clock = new FixedClock(fixed);
    const first = clock.now();
    first.setFullYear(2050);
    expect(clock.now().toISOString()).toBe(fixed.toISOString());
  });
});
