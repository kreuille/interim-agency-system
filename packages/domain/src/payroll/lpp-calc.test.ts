import { describe, expect, it } from 'vitest';
import { computeLppEmployeeWeek } from './lpp-calc.js';
import { DEFAULT_SOCIAL_RATES_2026 } from './social-rates.js';

const rates = DEFAULT_SOCIAL_RATES_2026;

describe('computeLppEmployeeWeek', () => {
  it("< 25 ans → 0 (pas d'obligation LPP)", () => {
    const out = computeLppEmployeeWeek({
      grossWeekRappen: 100_000n,
      ageAtComputation: 23,
      rates,
    });
    expect(out.employeeWeekRappen).toBe(0n);
  });

  it('projection annuelle < franchise (22_050) → 0', () => {
    // Brut hebdo 400 CHF × 52 = 20_800 CHF/an < 22_050 franchise
    const out = computeLppEmployeeWeek({
      grossWeekRappen: 40_000n,
      ageAtComputation: 30,
      rates,
    });
    expect(out.coordinatedAnnualRappen).toBe(0n);
    expect(out.employeeWeekRappen).toBe(0n);
  });

  it('âge 30, brut 2000 CHF/sem → coord ~80_000 CHF/an, 7% total, part salariée 3.5%/52', () => {
    const out = computeLppEmployeeWeek({
      grossWeekRappen: 200_000n,
      ageAtComputation: 30,
      rates,
    });
    // Annual gross = 200_000 × 52 = 10_400_000 rappen = 104'000 CHF
    // > ceiling 88_200 → on prend ceiling - franchise = 88_200 - 22_050 = 66_150 CHF
    // = 6_615_000 rappen coord annuel
    expect(out.coordinatedAnnualRappen).toBe(6_615_000n);
    expect(out.totalBp).toBe(700);
    // Part salariée annuelle = coord × 7% / 2 = 6_615_000 × 0.035 = 231_525
    // Hebdo = 231_525 / 52 = 4_452 rappen (arrondi)
    expect(out.employeeWeekRappen).toBe(4_452n);
  });

  it('âge 50, brut 2000 → taux 15% (bracket 45-54)', () => {
    const out = computeLppEmployeeWeek({
      grossWeekRappen: 200_000n,
      ageAtComputation: 50,
      rates,
    });
    expect(out.totalBp).toBe(1500);
  });

  it('âge 60 → taux 18%', () => {
    const out = computeLppEmployeeWeek({
      grossWeekRappen: 200_000n,
      ageAtComputation: 60,
      rates,
    });
    expect(out.totalBp).toBe(1800);
  });

  it('âge 66 (retraité) → 0 (hors bracket)', () => {
    const out = computeLppEmployeeWeek({
      grossWeekRappen: 200_000n,
      ageAtComputation: 66,
      rates,
    });
    expect(out.employeeWeekRappen).toBe(0n);
  });

  it('salaire annuel entre franchise et ceiling → coord = annuel - franchise', () => {
    // Brut hebdo 600 CHF × 52 = 31_200 CHF/an (entre 22_050 et 88_200)
    // Coord = 31_200 - 22_050 = 9_150 CHF = 915_000 rappen
    const out = computeLppEmployeeWeek({
      grossWeekRappen: 60_000n,
      ageAtComputation: 35,
      rates,
    });
    expect(out.coordinatedAnnualRappen).toBe(915_000n);
    expect(out.totalBp).toBe(1000); // 10% bracket 35-44
  });
});
