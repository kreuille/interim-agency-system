import { describe, it, expect } from 'vitest';
import { isExpired, nextCrossedThreshold, thresholdsFor } from './expiry-policy.js';

const NOW = new Date('2026-04-22T08:00:00Z');

describe('nextCrossedThreshold', () => {
  it('returns 60 for permit_work expiring in 45 days (≤ 60 threshold)', () => {
    const expires = new Date(NOW.getTime() + 45 * 24 * 3600 * 1000);
    expect(nextCrossedThreshold('permit_work', expires, NOW)).toBe(60);
  });

  it('returns 30 for permit_work expiring in 28 days (≤ 30 < 60)', () => {
    const expires = new Date(NOW.getTime() + 28 * 24 * 3600 * 1000);
    expect(nextCrossedThreshold('permit_work', expires, NOW)).toBe(30);
  });

  it('returns 7 for permit_work expiring in 5 days (≤ 7)', () => {
    const expires = new Date(NOW.getTime() + 5 * 24 * 3600 * 1000);
    expect(nextCrossedThreshold('permit_work', expires, NOW)).toBe(7);
  });

  it('returns undefined when expiry is far enough (> max threshold)', () => {
    const expires = new Date(NOW.getTime() + 365 * 24 * 3600 * 1000);
    expect(nextCrossedThreshold('permit_work', expires, NOW)).toBeUndefined();
  });

  it('returns undefined when already expired (negative days)', () => {
    const expires = new Date(NOW.getTime() - 24 * 3600 * 1000);
    expect(nextCrossedThreshold('permit_work', expires, NOW)).toBeUndefined();
  });

  it('CACES uses 90/60 thresholds', () => {
    expect(thresholdsFor('caces')).toEqual([90, 60]);
    const expires = new Date(NOW.getTime() + 75 * 24 * 3600 * 1000);
    expect(nextCrossedThreshold('caces', expires, NOW)).toBe(90);
  });

  it('SUVA SST uses 60/30 thresholds', () => {
    expect(thresholdsFor('suva_sst')).toEqual([60, 30]);
  });

  it('permit_driving uses 90/60/30 thresholds', () => {
    expect(thresholdsFor('permit_driving')).toEqual([90, 60, 30]);
  });
});

describe('isExpired', () => {
  it('returns false when expiresAt is undefined', () => {
    expect(isExpired(undefined, NOW)).toBe(false);
  });

  it('returns true when expiresAt is past', () => {
    expect(isExpired(new Date(NOW.getTime() - 1), NOW)).toBe(true);
  });

  it('returns false when expiresAt is future', () => {
    expect(isExpired(new Date(NOW.getTime() + 1), NOW)).toBe(false);
  });
});
