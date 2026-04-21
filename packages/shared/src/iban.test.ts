import { describe, it, expect } from 'vitest';
import { Iban, InvalidIban } from './iban.js';

describe('Iban', () => {
  it('accepts a valid CH IBAN', () => {
    // IBAN valide PostFinance test
    const iban = Iban.parse('CH9300762011623852957');
    expect(iban.toString()).toBe('CH9300762011623852957');
  });

  it('accepts IBAN with spaces', () => {
    const iban = Iban.parse('CH93 0076 2011 6238 5295 7');
    expect(iban.toString()).toBe('CH9300762011623852957');
  });

  it('formats in human readable groups of 4', () => {
    expect(Iban.parse('CH9300762011623852957').toHumanFormat()).toBe('CH93 0076 2011 6238 5295 7');
  });

  it('rejects IBAN with invalid mod 97', () => {
    expect(() => Iban.parse('CH9300762011623852950')).toThrow(InvalidIban);
  });

  it('rejects non-CH IBAN', () => {
    expect(() => Iban.parse('DE89370400440532013000')).toThrow(InvalidIban);
  });

  it('rejects IBAN with wrong length', () => {
    expect(() => Iban.parse('CH930076201162385')).toThrow(InvalidIban);
  });

  it('is case-insensitive on the country code', () => {
    expect(Iban.parse('ch9300762011623852957').toString()).toBe('CH9300762011623852957');
  });
});
