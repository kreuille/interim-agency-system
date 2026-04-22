import { describe, it, expect } from 'vitest';
import { FixedClock } from '@interim/shared';
import { asAgencyId } from '../shared/ids.js';
import { asClientId } from './client.js';
import {
  ClientContract,
  ClientContractRetroactiveModification,
  asClientContractId,
} from './client-contract.js';

const clock = new FixedClock(new Date('2026-04-22T08:00:00Z'));

function build(): ClientContract {
  return ClientContract.create(
    {
      id: asClientContractId('contract-1'),
      agencyId: asAgencyId('agency-a'),
      clientId: asClientId('client-1'),
      branch: 'transport',
      agencyCoefficientBp: 16_500, // 165%
      validFrom: new Date('2026-01-01'),
    },
    clock,
  );
}

describe('ClientContract', () => {
  it('create initialises version 1 with default billingFrequency 30', () => {
    const c = build();
    const snap = c.toSnapshot();
    expect(snap.version).toBe(1);
    expect(snap.billingFrequencyDays).toBe(30);
    expect(snap.agencyCoefficientBp).toBe(16_500);
  });

  it('rejects coefficient < 10000 (100%)', () => {
    expect(() =>
      ClientContract.create(
        {
          id: asClientContractId('c'),
          agencyId: asAgencyId('a'),
          clientId: asClientId('cl'),
          branch: 'transport',
          agencyCoefficientBp: 9_999,
          validFrom: new Date(),
        },
        clock,
      ),
    ).toThrow();
  });

  it('rejects validUntil before validFrom', () => {
    expect(() =>
      ClientContract.create(
        {
          id: asClientContractId('c'),
          agencyId: asAgencyId('a'),
          clientId: asClientId('cl'),
          branch: 'transport',
          agencyCoefficientBp: 16_500,
          validFrom: new Date('2026-06-01'),
          validUntil: new Date('2026-05-01'),
        },
        clock,
      ),
    ).toThrow();
  });

  it('isActiveAt: covers validFrom..validUntil', () => {
    const c = build();
    expect(c.isActiveAt(new Date('2025-12-31'))).toBe(false);
    expect(c.isActiveAt(new Date('2026-01-01'))).toBe(true);
    expect(c.isActiveAt(new Date('2099-01-01'))).toBe(true);
  });

  it('supersede creates a new version + closes the previous', () => {
    const c = build();
    const result = c.supersede({
      nextId: asClientContractId('contract-2'),
      agencyCoefficientBp: 18_000,
      validFrom: new Date('2026-07-01'),
      clock,
    });
    expect(result.previous.toSnapshot().validUntil?.toISOString()).toBe(
      new Date('2026-07-01').toISOString(),
    );
    expect(result.next.version).toBe(2);
    expect(result.next.toSnapshot().agencyCoefficientBp).toBe(18_000);
  });

  it('supersede with retroactive validFrom is refused', () => {
    const c = build();
    expect(() =>
      c.supersede({
        nextId: asClientContractId('contract-2'),
        validFrom: new Date('2025-12-01'), // antérieur à 2026-01-01
        clock,
      }),
    ).toThrow(ClientContractRetroactiveModification);
  });

  it('snapshot is frozen', () => {
    expect(Object.isFrozen(build().toSnapshot())).toBe(true);
  });
});
