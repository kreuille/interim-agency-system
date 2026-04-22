import { describe, it, expect } from 'vitest';
import { FixedClock } from '@interim/shared';
import { asAgencyId } from '../shared/ids.js';
import { asClientId } from './client.js';
import { RateCard, asRateCardId } from './rate-card.js';

const clock = new FixedClock(new Date('2026-04-22T08:00:00Z'));

function build(rappen = 3500n) {
  return RateCard.create(
    {
      id: asRateCardId('rate-1'),
      agencyId: asAgencyId('agency-a'),
      clientId: asClientId('client-1'),
      role: 'Déménageur',
      branch: 'transport',
      hourlyRappen: rappen,
      validFrom: new Date('2026-01-01'),
    },
    clock,
  );
}

describe('RateCard', () => {
  it('create with default premiums (25/50/25/50)', () => {
    const r = build();
    const snap = r.toSnapshot();
    expect(snap.nightPremiumBp).toBe(2500);
    expect(snap.sundayPremiumBp).toBe(5000);
    expect(snap.overtimePremiumBp).toBe(2500);
    expect(snap.holidayPremiumBp).toBe(5000);
  });

  it('rejects hourlyRappen <= 0', () => {
    expect(() => build(0n)).toThrow();
    expect(() => build(-100n)).toThrow();
  });

  it('rejects premium > 200% (20000 bp)', () => {
    expect(() =>
      RateCard.create(
        {
          id: asRateCardId('r'),
          agencyId: asAgencyId('a'),
          clientId: asClientId('c'),
          role: 'X',
          branch: 'x',
          hourlyRappen: 3000n,
          nightPremiumBp: 20_001,
          validFrom: new Date(),
        },
        clock,
      ),
    ).toThrow();
  });

  it('rejects validUntil before validFrom', () => {
    expect(() =>
      RateCard.create(
        {
          id: asRateCardId('r'),
          agencyId: asAgencyId('a'),
          clientId: asClientId('c'),
          role: 'X',
          branch: 'x',
          hourlyRappen: 3000n,
          validFrom: new Date('2026-12-01'),
          validUntil: new Date('2026-11-01'),
        },
        clock,
      ),
    ).toThrow();
  });

  it('isActiveAt covers the validity window', () => {
    const r = build();
    expect(r.isActiveAt(new Date('2025-12-31'))).toBe(false);
    expect(r.isActiveAt(new Date('2026-06-01'))).toBe(true);
  });

  it('snapshot frozen + rehydrate', () => {
    const r = build();
    expect(Object.isFrozen(r.toSnapshot())).toBe(true);
    const copy = RateCard.rehydrate({ ...r.toSnapshot() });
    expect(copy.id).toBe(r.id);
  });
});
