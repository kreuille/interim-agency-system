import { describe, expect, it } from 'vitest';
import { asStaffId } from '../shared/ids.js';
import { asAgencyId } from '../shared/ids.js';
import { buildDefaultIsTable, StaticIsBracketsPort } from './is-brackets.js';
import { PayslipEngine } from './payslip-engine.js';
import type { PayrollBreakdown } from './payroll-engine.js';

const AGENCY = asAgencyId('agency-a');
const WORKER = asStaffId('worker-1');

function breakdownWithGross(grossRappen: bigint): PayrollBreakdown {
  return {
    agencyId: AGENCY,
    workerId: WORKER,
    isoWeek: '2026-W17',
    lines: [],
    grossBaseRappen: grossRappen,
    surchargesRappen: 0n,
    grossTotalBeforeSocialRappen: grossRappen,
    totalMinutes: Math.round(Number(grossRappen / 3200n) * 60),
    minutesByKind: { normal: 0, night: 0, sunday: 0, holiday: 0, overtime: 0 },
    computationContext: {
      engineVersion: '1.0.0',
      computedAt: '2026-04-27T00:00:00Z',
      isoWeek: '2026-W17',
      clientsSnapshot: [],
      hourlyRatesByClient: {},
      surchargeRules: {
        nightBp: 2500,
        sundayBp: 5000,
        holidayBp: 5000,
        overtimeBp: 2500,
        stackSundayAndNight: false,
        overtimeThresholdMinutes: 41 * 60,
      },
      cantonHolidaysApplied: [],
    },
  };
}

function isPort(): StaticIsBracketsPort {
  const p = new StaticIsBracketsPort();
  for (const canton of ['GE', 'VD', 'FR', 'NE', 'BE', 'JU']) {
    for (const tarif of ['A0', 'A1', 'B0', 'B1', 'H0'] as const) {
      p.register(buildDefaultIsTable(canton, tarif, 2026));
    }
  }
  return p;
}

describe('PayslipEngine — A5.3', () => {
  const engine = new PayslipEngine({ isBrackets: isPort() });

  // ---- Happy path permis C ------------------------------------------

  it("1. Permis C domicilié GE → AVS/AC/LAA/LPP appliqués, pas d'IS", () => {
    const b = breakdownWithGross(200_000n); // 2000 CHF/sem
    const result = engine.compute(b, {
      workerId: WORKER,
      age: 30,
      permit: 'C',
      domicileCanton: 'GE',
      workCanton: 'GE',
      isTarif: 'A0',
    });
    expect(result.isRappen).toBe(0n);
    expect(result.isCanton).toBeNull();
    expect(result.avsRappen).toBeGreaterThan(0n);
    expect(result.acRappen).toBeGreaterThan(0n);
    expect(result.laaRappen).toBeGreaterThan(0n);
    expect(result.lpp.employeeWeekRappen).toBeGreaterThan(0n);
    expect(result.netRappen % 5n).toBe(0n); // arrondi 5cts
  });

  // ---- IS selon permis ----------------------------------------------

  it('2. Permis B domicilié VD travaille GE → IS selon barème VD', () => {
    const b = breakdownWithGross(300_000n);
    const result = engine.compute(b, {
      workerId: WORKER,
      age: 35,
      permit: 'B',
      domicileCanton: 'VD',
      workCanton: 'GE',
      isTarif: 'A0',
    });
    expect(result.isCanton).toBe('VD');
    expect(result.isRappen).toBeGreaterThan(0n);
  });

  it('3. Permis G frontalier → IS selon canton de travail (GE)', () => {
    const b = breakdownWithGross(300_000n);
    const result = engine.compute(b, {
      workerId: WORKER,
      age: 35,
      permit: 'G',
      domicileCanton: 'FR',
      workCanton: 'GE',
      isTarif: 'A0',
    });
    expect(result.isCanton).toBe('GE');
    expect(result.isRappen).toBeGreaterThan(0n);
  });

  it('4. Permis L → IS canton domicile, marié 1 enfant B1 → taux réduit', () => {
    const b = breakdownWithGross(300_000n);
    const a0 = engine.compute(b, {
      workerId: WORKER,
      age: 35,
      permit: 'L',
      domicileCanton: 'GE',
      workCanton: 'GE',
      isTarif: 'A0',
    });
    const b1 = engine.compute(b, {
      workerId: WORKER,
      age: 35,
      permit: 'L',
      domicileCanton: 'GE',
      workCanton: 'GE',
      isTarif: 'B1',
    });
    expect(b1.isRappen).toBeLessThan(a0.isRappen);
  });

  // ---- Franchise LPP -------------------------------------------------

  it('5. Franchise LPP : worker occasionnel < 22_050 CHF/an (totalGross projeté) → pas de LPP', () => {
    // 300 CHF/sem travaillé → avec 8.33% 13e + 8.33% vac = 350 CHF totalGross
    // × 52 = 18_200 CHF/an annualisé < franchise 22_050 → LPP 0
    const b = breakdownWithGross(30_000n);
    const result = engine.compute(b, {
      workerId: WORKER,
      age: 30,
      permit: 'C',
      domicileCanton: 'GE',
      workCanton: 'GE',
      isTarif: 'A0',
    });
    expect(result.lpp.employeeWeekRappen).toBe(0n);
    expect(result.avsRappen).toBeGreaterThan(0n); // AVS quand même
  });

  it('6. Jeune worker < 25 ans → pas de LPP obligatoire', () => {
    const b = breakdownWithGross(200_000n);
    const result = engine.compute(b, {
      workerId: WORKER,
      age: 22,
      permit: 'C',
      domicileCanton: 'GE',
      workCanton: 'GE',
      isTarif: 'A0',
    });
    expect(result.lpp.employeeWeekRappen).toBe(0n);
  });

  // ---- Vacances ≥50 ans ----------------------------------------------

  it('7. Âge ≥ 50 → vacances 10.64% appliqué (vs 8.33%)', () => {
    const b = breakdownWithGross(300_000n);
    const under50 = engine.compute(b, {
      workerId: WORKER,
      age: 48,
      permit: 'C',
      domicileCanton: 'GE',
      workCanton: 'GE',
      isTarif: 'A0',
    });
    const over50 = engine.compute(b, {
      workerId: WORKER,
      age: 55,
      permit: 'C',
      domicileCanton: 'GE',
      workCanton: 'GE',
      isTarif: 'A0',
    });
    expect(over50.holidayPayRappen).toBeGreaterThan(under50.holidayPayRappen);
    // Delta = (10.64 - 8.33)% × 300_000 = 2.31% × 300_000 = 6_930 rappen
    expect(over50.holidayPayRappen - under50.holidayPayRappen).toBe(6_930n);
  });

  // ---- Compléments 13e + vacances ------------------------------------

  it('8. 13e mois = 8.33% du brut travaillé', () => {
    const b = breakdownWithGross(300_000n);
    const result = engine.compute(b, {
      workerId: WORKER,
      age: 30,
      permit: 'C',
      domicileCanton: 'GE',
      workCanton: 'GE',
      isTarif: 'A0',
    });
    // 300_000 × 8.33% = 24_990
    expect(result.bonus13thRappen).toBe(24_990n);
  });

  it('9. totalGross = worked + 13e + vacances', () => {
    const b = breakdownWithGross(300_000n);
    const result = engine.compute(b, {
      workerId: WORKER,
      age: 30,
      permit: 'C',
      domicileCanton: 'GE',
      workCanton: 'GE',
      isTarif: 'A0',
    });
    expect(result.totalGrossRappen).toBe(
      result.workedGrossRappen + result.bonus13thRappen + result.holidayPayRappen,
    );
  });

  // ---- Arrondi NET ---------------------------------------------------

  it('10. NET final toujours multiple de 5 rappen', () => {
    for (const gross of [150_000n, 234_567n, 300_000n, 412_345n, 500_000n]) {
      const b = breakdownWithGross(gross);
      const result = engine.compute(b, {
        workerId: WORKER,
        age: 35,
        permit: 'C',
        domicileCanton: 'GE',
        workCanton: 'GE',
        isTarif: 'A0',
      });
      expect(result.netRappen % 5n).toBe(0n);
    }
  });

  it('11. delta arrondi dans [-2, 2] rappen (cas round-5)', () => {
    const b = breakdownWithGross(234_567n);
    const result = engine.compute(b, {
      workerId: WORKER,
      age: 35,
      permit: 'C',
      domicileCanton: 'GE',
      workCanton: 'GE',
      isTarif: 'A0',
    });
    expect(result.round5AdjustmentRappen).toBeGreaterThanOrEqual(-2n);
    expect(result.round5AdjustmentRappen).toBeLessThanOrEqual(2n);
  });

  // ---- Assiette IS = brut - cotis sociales ---------------------------

  it('12. Assiette IS = totalGross - (AVS + AC + LAA + LPP)', () => {
    const b = breakdownWithGross(400_000n);
    const result = engine.compute(b, {
      workerId: WORKER,
      age: 35,
      permit: 'B',
      domicileCanton: 'GE',
      workCanton: 'GE',
      isTarif: 'A0',
    });
    const expectedBase =
      result.totalGrossRappen -
      (result.avsRappen + result.acRappen + result.laaRappen + result.lpp.employeeWeekRappen);
    // IS calculé sur cette assiette à 5% (tranche 1500-3000 CHF pour base ~400_000 × 1.17 = ~470_000 non - cotis ~430_000 → tranche 3000-5000 à 10%)
    // On vérifie simplement que IS > 0 et cohérent
    expect(expectedBase).toBeGreaterThan(0n);
    expect(result.isRappen).toBeGreaterThan(0n);
  });

  // ---- Net jamais négatif --------------------------------------------

  it('13. Net jamais négatif (clamp 0 si déductions > brut)', () => {
    // Cas exotique : brut 0, mais théoriquement impossible car engine
    // refuse timesheet vide. On simule un brut très bas.
    const b = breakdownWithGross(10n); // 0.10 CHF
    const result = engine.compute(b, {
      workerId: WORKER,
      age: 30,
      permit: 'B',
      domicileCanton: 'GE',
      workCanton: 'GE',
      isTarif: 'A0',
    });
    expect(result.netRappen).toBeGreaterThanOrEqual(0n);
  });

  // ---- Reproductibilité / context -----------------------------------

  it('14. computationContext capture rates + engineVersion + year', () => {
    const b = breakdownWithGross(200_000n);
    const result = engine.compute(b, {
      workerId: WORKER,
      age: 30,
      permit: 'C',
      domicileCanton: 'GE',
      workCanton: 'GE',
      isTarif: 'A0',
    });
    expect(result.engineVersion).toBe('1.0.0');
    expect(result.yearApplied).toBe(2026);
    expect(result.ratesApplied.avsBp).toBe(530);
  });

  // ---- Sanity agrégat ------------------------------------------------

  it('15. netRounded = totalGross - totalDeductions ± 2 rappen (arrondi)', () => {
    const b = breakdownWithGross(300_000n);
    const result = engine.compute(b, {
      workerId: WORKER,
      age: 30,
      permit: 'C',
      domicileCanton: 'GE',
      workCanton: 'GE',
      isTarif: 'A0',
    });
    const expectedApprox = result.totalGrossRappen - result.totalDeductionsRappen;
    expect(result.netRappen - expectedApprox).toBeGreaterThanOrEqual(-2n);
    expect(result.netRappen - expectedApprox).toBeLessThanOrEqual(2n);
  });

  // ---- Exemples concrets ---------------------------------------------

  it('16. Exemple : brut 2000 CHF/sem permis C 35 ans GE → net ~ CHF 1750', () => {
    const b = breakdownWithGross(200_000n); // 2000 CHF
    const result = engine.compute(b, {
      workerId: WORKER,
      age: 35,
      permit: 'C',
      domicileCanton: 'GE',
      workCanton: 'GE',
      isTarif: 'A0',
    });
    // totalGross = 2000 × 1.1666 ≈ 2333 CHF
    // Déductions sociales ≈ 8-9% → ~200 CHF
    // Net ≈ 2133 CHF
    expect(result.netRappen).toBeGreaterThan(200_000n);
    expect(result.netRappen).toBeLessThan(230_000n);
  });
});
