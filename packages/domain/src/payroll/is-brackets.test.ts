import { describe, expect, it } from 'vitest';
import {
  buildDefaultIsTable,
  computeIs,
  NoIsBracketsFound,
  permitIsTaxedAtSource,
  selectIsCanton,
  StaticIsBracketsPort,
} from './is-brackets.js';

describe('permitIsTaxedAtSource', () => {
  it('L/B/G → taxé', () => {
    expect(permitIsTaxedAtSource('L')).toBe(true);
    expect(permitIsTaxedAtSource('B')).toBe(true);
    expect(permitIsTaxedAtSource('G')).toBe(true);
  });

  it('C / CH → non taxé à la source', () => {
    expect(permitIsTaxedAtSource('C')).toBe(false);
    expect(permitIsTaxedAtSource('CH')).toBe(false);
  });
});

describe('selectIsCanton', () => {
  it('G → canton de travail', () => {
    expect(selectIsCanton({ permit: 'G', domicileCanton: 'FR', workCanton: 'GE' })).toBe('GE');
  });

  it('L → canton de domicile', () => {
    expect(selectIsCanton({ permit: 'L', domicileCanton: 'VD', workCanton: 'GE' })).toBe('VD');
  });

  it('B → canton de domicile', () => {
    expect(selectIsCanton({ permit: 'B', domicileCanton: 'NE', workCanton: 'GE' })).toBe('NE');
  });
});

describe('computeIs avec barème GE A0 défaut', () => {
  const table = buildDefaultIsTable('GE', 'A0', 2026);

  it('sous 1500 CHF/sem → 0%', () => {
    expect(computeIs(100_000n, table)).toBe(0n);
  });

  it('1500-3000 CHF/sem → 5% (500 bp)', () => {
    // 2000 CHF = 200_000 rappen × 5% = 10_000
    expect(computeIs(200_000n, table)).toBe(10_000n);
  });

  it('3000-5000 CHF/sem → 10%', () => {
    expect(computeIs(400_000n, table)).toBe(40_000n);
  });

  it('> 5000 CHF/sem → 15%', () => {
    expect(computeIs(600_000n, table)).toBe(90_000n);
  });

  it('0 rappen ou négatif → 0', () => {
    expect(computeIs(0n, table)).toBe(0n);
    expect(computeIs(-100n, table)).toBe(0n);
  });
});

describe('buildDefaultIsTable', () => {
  it('B0 (marié sans enfant) → -2% sur chaque tranche', () => {
    const table = buildDefaultIsTable('GE', 'B0', 2026);
    // Bracket 1500-3000 : 5% - 2% = 3%
    expect(table.brackets[1]?.rateBp).toBe(300);
  });

  it('B1 (marié + 1 enfant) → -3% cumul (B -2% + enfant -1%)', () => {
    const table = buildDefaultIsTable('GE', 'B1', 2026);
    expect(table.brackets[1]?.rateBp).toBe(200);
  });

  it('H0 (monoparental) → -3%', () => {
    const table = buildDefaultIsTable('GE', 'H0', 2026);
    expect(table.brackets[1]?.rateBp).toBe(200);
  });

  it('pas de taux négatif (min 0)', () => {
    const table = buildDefaultIsTable('GE', 'H0', 2026);
    expect(table.brackets[0]?.rateBp).toBe(0); // 0 - 300 clampé à 0
  });
});

describe('StaticIsBracketsPort', () => {
  it('register + load → même table', () => {
    const port = new StaticIsBracketsPort();
    const table = buildDefaultIsTable('VD', 'A0', 2026);
    port.register(table);
    expect(port.load({ canton: 'VD', tarif: 'A0', year: 2026 })).toBe(table);
  });

  it('load table inconnue → NoIsBracketsFound', () => {
    const port = new StaticIsBracketsPort();
    expect(() => port.load({ canton: 'ZZ', tarif: 'A0', year: 2026 })).toThrow(NoIsBracketsFound);
  });
});
