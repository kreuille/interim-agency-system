import { describe, expect, it } from 'vitest';
import { computeAc, computeAvs, computeLaaNbu, DEFAULT_SOCIAL_RATES_2026 } from './social-rates.js';

const rates = DEFAULT_SOCIAL_RATES_2026;

describe('computeAvs', () => {
  it('5.30% linéaire sur brut', () => {
    // Brut hebdo 3000 CHF = 300_000 rappen × 5.3% = 15_900 rappen
    expect(computeAvs(300_000n, rates)).toBe(15_900n);
  });

  it('0 si brut 0', () => {
    expect(computeAvs(0n, rates)).toBe(0n);
  });

  it('pas de plafond : 10000 CHF/sem → 530 CHF AVS', () => {
    expect(computeAvs(1_000_000n, rates)).toBe(53_000n);
  });
});

describe('computeAc', () => {
  it('sous seuil hebdo (~ CHF 2850) → 1.10%', () => {
    // 2000 CHF = 200_000 rappen × 1.1% = 2200
    expect(computeAc(200_000n, rates)).toBe(2_200n);
  });

  it('au-delà seuil : 1.1% sur seuil + 0.5% sur excédent', () => {
    // Seuil = 148'200 / 52 = 2850 CHF/sem = 285_000 rappen
    // Brut 5000/sem = 500_000 rappen
    // Sur seuil : 285_000 × 1.1% = 3135
    // Excédent : (500_000 - 285_000) × 0.5% = 215_000 × 0.005 = 1075
    // Total : 4210
    expect(computeAc(500_000n, rates)).toBe(4_210n);
  });
});

describe('computeLaaNbu', () => {
  it('sous seuil → 1.40% sur brut', () => {
    expect(computeLaaNbu(200_000n, rates)).toBe(2_800n); // 1.4% × 200_000
  });

  it('au-delà seuil → 1.40% capé au seuil hebdo', () => {
    // Seuil 285_000 × 1.4% = 3990
    expect(computeLaaNbu(500_000n, rates)).toBe(3_990n);
  });
});
