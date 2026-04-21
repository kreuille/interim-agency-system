import { describe, it, expect } from 'vitest';
import { err, isErr, isOk, ok, type Result } from './result.js';

describe('Result', () => {
  it('ok creates a success variant', () => {
    const r = ok(42);
    expect(r.ok).toBe(true);
    expect((r as { value: number }).value).toBe(42);
  });

  it('err creates a failure variant', () => {
    const r = err('boom');
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toBe('boom');
  });

  it('isOk / isErr are mutually exclusive narrowing guards', () => {
    const happy: Result<number, string> = ok(1);
    const sad: Result<number, string> = err('x');
    expect(isOk(happy)).toBe(true);
    expect(isErr(happy)).toBe(false);
    expect(isOk(sad)).toBe(false);
    expect(isErr(sad)).toBe(true);
  });
});
