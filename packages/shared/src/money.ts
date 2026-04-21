export type Currency = 'CHF' | 'EUR';

export class Money {
  private constructor(
    public readonly rappen: bigint,
    public readonly currency: Currency,
  ) {}

  static fromRappen(rappen: bigint | number, currency: Currency = 'CHF'): Money {
    const asBigInt = typeof rappen === 'bigint' ? rappen : BigInt(Math.trunc(rappen));
    return new Money(asBigInt, currency);
  }

  static zero(currency: Currency = 'CHF'): Money {
    return new Money(0n, currency);
  }

  toCents(): bigint {
    return this.rappen;
  }

  toRappen(): bigint {
    return this.rappen;
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.rappen + other.rappen, this.currency);
  }

  sub(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.rappen - other.rappen, this.currency);
  }

  multiply(factor: bigint | number): Money {
    const asBigInt = typeof factor === 'bigint' ? factor : BigInt(Math.trunc(factor));
    return new Money(this.rappen * asBigInt, this.currency);
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.rappen === other.rappen;
  }

  isZero(): boolean {
    return this.rappen === 0n;
  }

  isNegative(): boolean {
    return this.rappen < 0n;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error(
        `Currency mismatch: ${this.currency} vs ${other.currency}. Money must be same currency.`,
      );
    }
  }
}
