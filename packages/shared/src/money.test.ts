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

  it('isNegative detects negative amounts', () => {
    expect(Money.fromRappen(-100).isNegative()).toBe(true);
    expect(Money.fromRappen(100).isNegative()).toBe(false);
  });

  it('toRappen equals toCents', () => {
    expect(Money.fromRappen(250).toRappen()).toBe(250n);
  });

  it('accepts bigint input for fromRappen and multiply', () => {
    expect(Money.fromRappen(100n).toCents()).toBe(100n);
    expect(Money.fromRappen(10).multiply(3n).toCents()).toBe(30n);
  });

  it('add/sub throws on currency mismatch', () => {
    const chf = Money.fromRappen(100, 'CHF');
    const eur = Money.fromRappen(100, 'EUR');
    expect(() => chf.add(eur)).toThrow(/Currency mismatch/);
    expect(() => chf.sub(eur)).toThrow(/Currency mismatch/);
  });
});
