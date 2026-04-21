import { describe, it, expect } from 'vitest';
import { Name, InvalidName } from './name.js';
import { Email, InvalidEmail } from './email.js';
import { Phone, InvalidPhone } from './phone.js';

describe('Name', () => {
  it('accepts a plain trimmed name', () => {
    expect(Name.parse('  Jean  ').toString()).toBe('Jean');
  });

  it('rejects empty name', () => {
    expect(() => Name.parse('   ')).toThrow(InvalidName);
  });

  it('rejects too long name (>80)', () => {
    expect(() => Name.parse('x'.repeat(81))).toThrow(InvalidName);
  });
});

describe('Email', () => {
  it('accepts and lowercases', () => {
    expect(Email.parse('Jean.Dupont@Example.COM').toString()).toBe('jean.dupont@example.com');
  });

  it('rejects no @', () => {
    expect(() => Email.parse('jeandupont')).toThrow(InvalidEmail);
  });

  it('rejects no tld', () => {
    expect(() => Email.parse('a@b')).toThrow(InvalidEmail);
  });

  it('isValid true/false without throwing', () => {
    expect(Email.isValid('x@y.ch')).toBe(true);
    expect(Email.isValid('bad')).toBe(false);
  });
});

describe('Name', () => {
  it('equals compares value strings', () => {
    expect(Name.parse('Jean').equals(Name.parse('Jean'))).toBe(true);
    expect(Name.parse('Jean').equals(Name.parse('Marc'))).toBe(false);
  });
});

describe('Phone', () => {
  it('equals compares E.164', () => {
    expect(Phone.parse('+41780000001').equals(Phone.parse('0780000001'))).toBe(true);
  });
});

describe('Phone', () => {
  it('accepts E.164', () => {
    expect(Phone.parse('+41 78 000 00 00').toString()).toBe('+41780000000');
  });

  it('converts CH local to E.164', () => {
    expect(Phone.parse('0780000000').toString()).toBe('+41780000000');
  });

  it('rejects garbage', () => {
    expect(() => Phone.parse('abcdef')).toThrow(InvalidPhone);
  });
});
