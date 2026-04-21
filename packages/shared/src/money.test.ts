import { describe, it, expect } from 'vitest';
import { Money } from './money.js';

describe('Money', () => {
  it('fromRappen stores the raw amount', () => {
    expect(Money.fromRappen(100).toCents()).toBe(100n);
  });

  it('add sums two amounts in same currency', () => {
    const total = Money.fromRappen(100).add(Money.fromRappen(50));
    expect(total.toCents()).toBe(150n);
  });

  it('sub subtracts amounts', () => {
    const diff = Money.fromRappen(200).sub(Money.fromRappen(75));
    expect(diff.toCents()).toBe(125n);
  });

  it('multiply scales by an integer factor', () => {
    expect(Money.fromRappen(100).multiply(3).toCents()).toBe(300n);
  });

  it('equals compares both amount and currency', () => {
    expect(Money.fromRappen(100).equals(Money.fromRappen(100))).toBe(true);
    expect(Money.fromRappen(100).equals(Money.fromRappen(50))).toBe(false);
  });

  it('zero factory returns a Money of 0', () => {
    expect(Money.zero().isZero()).toBe(true);
  });
});
