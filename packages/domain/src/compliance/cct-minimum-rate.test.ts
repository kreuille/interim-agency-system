import { describe, it, expect } from 'vitest';
import {
  BelowCctMinimum,
  CctMinimumRate,
  NoCctMinimumFound,
  findApplicableMinimum,
  validateRateAboveMinimum,
} from './cct-minimum-rate.js';

const FEDERAL_TRANSPORT_DEMENAGEUR = new CctMinimumRate({
  branch: 'transport',
  qualification: 'demenageur',
  minHourlyRappen: 2700n,
  validFrom: new Date('2026-01-01'),
});

const GE_TRANSPORT_DEMENAGEUR = new CctMinimumRate({
  branch: 'transport',
  qualification: 'demenageur',
  canton: 'GE',
  minHourlyRappen: 2900n,
  validFrom: new Date('2026-01-01'),
});

const RATES = [FEDERAL_TRANSPORT_DEMENAGEUR, GE_TRANSPORT_DEMENAGEUR];
const NOW = new Date('2026-04-22T08:00:00Z');

describe('CctMinimumRate', () => {
  it('findApplicableMinimum returns cantonal when canton matches (priorité)', () => {
    const m = findApplicableMinimum(RATES, {
      branch: 'transport',
      qualification: 'demenageur',
      canton: 'GE',
      at: NOW,
    });
    expect(m.minHourlyRappen).toBe(2900n);
  });

  it('findApplicableMinimum falls back to federal when canton has no specific rate', () => {
    const m = findApplicableMinimum(RATES, {
      branch: 'transport',
      qualification: 'demenageur',
      canton: 'BE',
      at: NOW,
    });
    expect(m.minHourlyRappen).toBe(2700n);
  });

  it('throws NoCctMinimumFound when nothing matches', () => {
    expect(() =>
      findApplicableMinimum(RATES, {
        branch: 'btp',
        qualification: 'macon',
        at: NOW,
      }),
    ).toThrow(NoCctMinimumFound);
  });

  it('throws when date is before validFrom', () => {
    expect(() =>
      findApplicableMinimum(RATES, {
        branch: 'transport',
        qualification: 'demenageur',
        at: new Date('2025-12-31'),
      }),
    ).toThrow(NoCctMinimumFound);
  });

  it('validateRateAboveMinimum: equal to min → OK', () => {
    expect(() =>
      validateRateAboveMinimum(RATES, {
        branch: 'transport',
        qualification: 'demenageur',
        canton: 'GE',
        proposedRappen: 2900n,
        at: NOW,
      }),
    ).not.toThrow();
  });

  it('validateRateAboveMinimum: 1 Rp below GE cantonal → BelowCctMinimum', () => {
    expect(() =>
      validateRateAboveMinimum(RATES, {
        branch: 'transport',
        qualification: 'demenageur',
        canton: 'GE',
        proposedRappen: 2899n,
        at: NOW,
      }),
    ).toThrow(BelowCctMinimum);
  });

  it('validateRateAboveMinimum: cantonal > federal → cantonal applies', () => {
    // Taux qui passe le minimum fédéral mais pas le cantonal GE.
    expect(() =>
      validateRateAboveMinimum(RATES, {
        branch: 'transport',
        qualification: 'demenageur',
        canton: 'GE',
        proposedRappen: 2800n, // > federal 2700, < GE 2900
        at: NOW,
      }),
    ).toThrow(BelowCctMinimum);
  });

  it('validateRateAboveMinimum returns the matched rate (audit trail)', () => {
    const matched = validateRateAboveMinimum(RATES, {
      branch: 'transport',
      qualification: 'demenageur',
      canton: 'GE',
      proposedRappen: 3000n,
      at: NOW,
    });
    expect(matched.minHourlyRappen).toBe(2900n);
  });
});
