import { describe, it, expect } from 'vitest';
import { Avs, InvalidAvs } from './avs.js';

describe('Avs', () => {
  it('accepts a valid AVS number with correct EAN-13 checksum', () => {
    // 7561234567897 — classic test AVS with valid checksum
    const avs = Avs.parse('756.1234.5678.97');
    expect(avs.toString()).toBe('756.1234.5678.97');
  });

  it('rejects AVS with an invalid checksum', () => {
    expect(() => Avs.parse('756.1234.5678.90')).toThrow(InvalidAvs);
  });

  it('rejects AVS with wrong format (no dots)', () => {
    expect(() => Avs.parse('7561234567897')).toThrow(InvalidAvs);
  });

  it('rejects AVS with wrong prefix (not 756)', () => {
    expect(() => Avs.parse('123.1234.5678.97')).toThrow(InvalidAvs);
  });

  it('rejects AVS with wrong length', () => {
    expect(() => Avs.parse('756.1234.5678.9')).toThrow(InvalidAvs);
  });

  it('trims surrounding whitespace', () => {
    expect(Avs.parse('  756.1234.5678.97  ').toString()).toBe('756.1234.5678.97');
  });

  it('isValid returns boolean without throwing', () => {
    expect(Avs.isValid('756.1234.5678.97')).toBe(true);
    expect(Avs.isValid('invalid')).toBe(false);
  });

  it('equals compares normalized form', () => {
    expect(Avs.parse('756.1234.5678.97').equals(Avs.parse('756.1234.5678.97'))).toBe(true);
  });
});
