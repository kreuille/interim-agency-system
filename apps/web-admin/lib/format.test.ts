import { describe, it, expect } from 'vitest';
import { formatBytes, formatDateCh, formatDateTimeCh, formatMoneyChf } from './format.js';

describe('formatDateCh', () => {
  it('formats ISO string to dd.MM.yyyy Europe/Zurich', () => {
    expect(formatDateCh('2026-04-22T10:00:00Z')).toMatch(/^22\.04\.2026$/);
  });

  it('returns dash for null/undefined/invalid', () => {
    expect(formatDateCh(null)).toBe('—');
    expect(formatDateCh(undefined)).toBe('—');
    expect(formatDateCh('not-a-date')).toBe('—');
  });
});

describe('formatDateTimeCh', () => {
  it('includes hour:minute', () => {
    // 10:00 UTC = 12:00 Europe/Zurich (été) ou 11:00 (hiver). On teste juste la présence d'une heure.
    expect(formatDateTimeCh('2026-04-22T10:00:00Z')).toMatch(/22\.04\.2026.*\d{2}:\d{2}/);
  });

  it('returns dash for empty', () => {
    expect(formatDateTimeCh(null)).toBe('—');
  });
});

describe('formatMoneyChf', () => {
  it('formats Rappen string to CHF with 2 decimals', () => {
    // 12'345.67 CHF → format fr-CH (le séparateur des milliers est un espace insécable et la virgule décimale)
    expect(formatMoneyChf('1234567')).toMatch(/12.345.+67/);
    expect(formatMoneyChf('1234567')).toContain('CHF');
  });

  it('handles bigint input', () => {
    expect(formatMoneyChf(100n)).toMatch(/1[.,]00/);
  });

  it('handles negative amounts', () => {
    expect(formatMoneyChf(-500n)).toContain('-');
  });

  it('returns dash for null/undefined/empty', () => {
    expect(formatMoneyChf(null)).toBe('—');
    expect(formatMoneyChf(undefined)).toBe('—');
    expect(formatMoneyChf('')).toBe('—');
  });
});

describe('formatBytes', () => {
  it('B / kB / MB', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(2048)).toBe('2.0 kB');
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB');
  });
});
