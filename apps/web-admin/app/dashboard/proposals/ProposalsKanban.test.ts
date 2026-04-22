import { describe, expect, it } from 'vitest';
import { computeRemainingMs, formatRemaining } from './ProposalsKanban.js';

describe('computeRemainingMs', () => {
  it('renvoie ms restantes vers la deadline', () => {
    const now = new Date('2026-04-22T08:00:00Z').getTime();
    const deadline = '2026-04-22T08:30:00.000Z';
    expect(computeRemainingMs(deadline, now)).toBe(30 * 60 * 1000);
  });

  it('renvoie négatif si la deadline est passée', () => {
    const now = new Date('2026-04-22T08:30:00Z').getTime();
    const deadline = '2026-04-22T08:00:00.000Z';
    expect(computeRemainingMs(deadline, now)).toBeLessThan(0);
  });

  it('renvoie null si pas de deadline', () => {
    expect(computeRemainingMs(null, Date.now())).toBeNull();
  });
});

describe('formatRemaining', () => {
  it('formate MM:SS', () => {
    expect(formatRemaining(15 * 60 * 1000)).toBe('15:00');
    expect(formatRemaining(5 * 60 * 1000 + 23_000)).toBe('05:23');
  });

  it('0 ms → 00:00', () => {
    expect(formatRemaining(0)).toBe('00:00');
  });
});
