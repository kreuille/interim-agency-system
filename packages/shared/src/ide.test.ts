import { describe, it, expect } from 'vitest';
import { Ide, InvalidIde } from './ide.js';

describe('Ide', () => {
  // IDE valides calculés via l'algo OFS (mod 11 sur 8 premiers chiffres,
  // poids [5,4,3,2,7,6,5,4]). Exemples synthétiques pour les tests.
  it('accepts a valid synthetic IDE', () => {
    expect(Ide.parse('CHE-100.000.006').toString()).toBe('CHE-100.000.006');
    expect(Ide.parse('CHE-200.000.001').toString()).toBe('CHE-200.000.001');
  });

  it('rejects wrong format (missing dots)', () => {
    expect(() => Ide.parse('CHE100000006')).toThrow(InvalidIde);
  });

  it('rejects wrong country prefix', () => {
    expect(() => Ide.parse('CHX-100.000.006')).toThrow(InvalidIde);
  });

  it('rejects invalid checksum', () => {
    expect(() => Ide.parse('CHE-100.000.007')).toThrow(InvalidIde);
  });

  it('isValid returns true/false without throwing', () => {
    expect(Ide.isValid('CHE-100.000.006')).toBe(true);
    expect(Ide.isValid('CHE-100.000.007')).toBe(false);
    expect(Ide.isValid('not-an-ide')).toBe(false);
  });

  it('trims surrounding whitespace and uppercases', () => {
    expect(Ide.parse('  che-100.000.006  ').toString()).toBe('CHE-100.000.006');
  });

  it('equals compares normalized form', () => {
    expect(Ide.parse('CHE-100.000.006').equals(Ide.parse('CHE-100.000.006'))).toBe(true);
  });
});
