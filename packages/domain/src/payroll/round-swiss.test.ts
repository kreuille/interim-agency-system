import { describe, expect, it } from 'vitest';
import { round5Rappen, round5RappenDelta } from './round-swiss.js';

describe('round5Rappen', () => {
  it('multiple de 5 inchangé', () => {
    expect(round5Rappen(432_160n)).toBe(432_160n); // CHF 4321.60
    expect(round5Rappen(432_165n)).toBe(432_165n); // CHF 4321.65
  });

  it('reste 1 → vers le bas', () => {
    expect(round5Rappen(432_161n)).toBe(432_160n);
  });

  it('reste 2 → vers le bas', () => {
    expect(round5Rappen(432_162n)).toBe(432_160n);
  });

  it('reste 3 → vers le haut', () => {
    expect(round5Rappen(432_163n)).toBe(432_165n);
  });

  it('reste 4 → vers le haut', () => {
    expect(round5Rappen(432_164n)).toBe(432_165n);
  });

  it('reste 7 → 5 (vers le bas)', () => {
    // 4321.67 = 432167 → reste 2 → 432165
    expect(round5Rappen(432_167n)).toBe(432_165n);
  });

  it('reste 8 → 0 (vers le haut +10)', () => {
    // 4321.68 = 432168 → reste 3 → 432170
    expect(round5Rappen(432_168n)).toBe(432_170n);
  });

  it('zero → zero', () => {
    expect(round5Rappen(0n)).toBe(0n);
  });

  it('montants négatifs arrondis symétriquement', () => {
    expect(round5Rappen(-432_163n)).toBe(-432_165n);
    expect(round5Rappen(-432_161n)).toBe(-432_160n);
  });
});

describe('round5RappenDelta', () => {
  it('delta 0 si déjà multiple', () => {
    expect(round5RappenDelta(432_160n)).toBe(0n);
  });

  it('reste 3 → +2', () => {
    expect(round5RappenDelta(432_163n)).toBe(2n);
  });

  it('reste 2 → -2', () => {
    expect(round5RappenDelta(432_162n)).toBe(-2n);
  });
});
