import { describe, it, expect } from 'vitest';
import { CANTONS, InvalidCanton, isCanton, parseCanton } from './canton.js';

describe('Canton', () => {
  it('lists all 26 Swiss cantons', () => {
    expect(CANTONS).toHaveLength(26);
  });

  it('parses valid canton codes (case insensitive, trimmed)', () => {
    expect(parseCanton('GE')).toBe('GE');
    expect(parseCanton('  vd  ')).toBe('VD');
  });

  it('rejects unknown canton codes', () => {
    expect(() => parseCanton('XX')).toThrow(InvalidCanton);
    expect(() => parseCanton('')).toThrow(InvalidCanton);
  });

  it('isCanton narrows strings', () => {
    expect(isCanton('ZH')).toBe(true);
    expect(isCanton('zh')).toBe(false);
  });
});
