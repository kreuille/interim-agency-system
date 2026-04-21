import { describe, it, expect } from 'vitest';
import { asUuid, asAgencyId, asStaffId } from './ids.js';

describe('ids', () => {
  it('asUuid accepts a valid v4 UUID', () => {
    const uuid = asUuid('3f1b6b5e-6b4a-4b6a-9b4a-1b6a4b6a9b4a');
    expect(typeof uuid).toBe('string');
  });

  it('asUuid rejects an invalid UUID', () => {
    expect(() => asUuid('not-a-uuid')).toThrow();
  });

  it('asAgencyId rejects empty string', () => {
    expect(() => asAgencyId('')).toThrow();
  });

  it('asStaffId rejects empty string', () => {
    expect(() => asStaffId('')).toThrow();
  });
});
