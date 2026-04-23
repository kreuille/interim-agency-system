import { describe, expect, it } from 'vitest';
import {
  applyContractOverrides,
  combinedSurchargeBp,
  DEFAULT_SURCHARGE_RULES,
  loadSurchargeRulesForBranch,
  type PayrollSurchargeRules,
  UnknownBranchSurchargeRules,
} from './surcharge-rules.js';

describe('loadSurchargeRulesForBranch', () => {
  it('demenagement → DEFAULT_SURCHARGE_RULES', () => {
    expect(loadSurchargeRulesForBranch('demenagement')).toEqual(DEFAULT_SURCHARGE_RULES);
  });

  it('btp_gros_oeuvre → holiday 100%, threshold 50h', () => {
    const r = loadSurchargeRulesForBranch('btp_gros_oeuvre');
    expect(r.holidayBp).toBe(10000);
    expect(r.overtimeThresholdMinutes).toBe(50 * 60);
  });

  it('logistique → threshold 42h', () => {
    expect(loadSurchargeRulesForBranch('logistique').overtimeThresholdMinutes).toBe(42 * 60);
  });

  it('branche inconnue → UnknownBranchSurchargeRules', () => {
    expect(() => loadSurchargeRulesForBranch('inconnu')).toThrow(UnknownBranchSurchargeRules);
  });
});

describe('combinedSurchargeBp', () => {
  it('aucune kind → 0', () => {
    expect(combinedSurchargeBp([], DEFAULT_SURCHARGE_RULES)).toBe(0);
  });

  it('normal seul → 0 (pas de majo)', () => {
    expect(combinedSurchargeBp(['normal'], DEFAULT_SURCHARGE_RULES)).toBe(0);
  });

  it('night seul → nightBp', () => {
    expect(combinedSurchargeBp(['night'], DEFAULT_SURCHARGE_RULES)).toBe(2500);
  });

  it('sunday seul → sundayBp', () => {
    expect(combinedSurchargeBp(['sunday'], DEFAULT_SURCHARGE_RULES)).toBe(5000);
  });

  it('night + sunday sans stack → max', () => {
    expect(combinedSurchargeBp(['night', 'sunday'], DEFAULT_SURCHARGE_RULES)).toBe(5000);
  });

  it('night + sunday avec stack → addition', () => {
    const stacked = { ...DEFAULT_SURCHARGE_RULES, stackSundayAndNight: true };
    expect(combinedSurchargeBp(['night', 'sunday'], stacked)).toBe(7500);
  });

  it('overtime cumule toujours sur les autres', () => {
    expect(combinedSurchargeBp(['night', 'overtime'], DEFAULT_SURCHARGE_RULES)).toBe(5000); // 25 + 25
  });

  it('holiday + sunday → max (pas de double majo, art. 20a LTr)', () => {
    expect(combinedSurchargeBp(['holiday', 'sunday'], DEFAULT_SURCHARGE_RULES)).toBe(5000);
  });

  it('overtime + sunday → 75%', () => {
    expect(combinedSurchargeBp(['sunday', 'overtime'], DEFAULT_SURCHARGE_RULES)).toBe(7500);
  });
});

describe('applyContractOverrides — règle "plus favorable"', () => {
  const cct: PayrollSurchargeRules = DEFAULT_SURCHARGE_RULES; // night=25%, sunday=50%, holiday=50%, overtime=25%

  it('sans overrides → règles CCT inchangées', () => {
    expect(applyContractOverrides(cct, undefined)).toEqual(cct);
  });

  it('overrides vides {} → règles CCT inchangées (Math.max avec 0)', () => {
    expect(applyContractOverrides(cct, {})).toEqual(cct);
  });

  it('contrat stipule nuit +30%, CCT dit +25% → +30% appliqué (plus favorable au worker)', () => {
    const result = applyContractOverrides(cct, { nightBp: 3000 });
    expect(result.nightBp).toBe(3000);
    // les autres règles CCT restent inchangées
    expect(result.sundayBp).toBe(5000);
    expect(result.holidayBp).toBe(5000);
    expect(result.overtimeBp).toBe(2500);
  });

  it('contrat stipule nuit +20%, CCT dit +25% → +25% appliqué (CCT = plancher légal protégé)', () => {
    const result = applyContractOverrides(cct, { nightBp: 2000 });
    expect(result.nightBp).toBe(2500);
  });

  it('contrat stipule dim +60%, CCT dit +50% → +60% appliqué', () => {
    const result = applyContractOverrides(cct, { sundayBp: 6000 });
    expect(result.sundayBp).toBe(6000);
  });

  it('contrat stipule férié +120%, CCT dit +50% → +120% appliqué', () => {
    const result = applyContractOverrides(cct, { holidayBp: 12000 });
    expect(result.holidayBp).toBe(12000);
  });

  it('contrat stipule overtime +35%, CCT dit +25% → +35% appliqué', () => {
    const result = applyContractOverrides(cct, { overtimeBp: 3500 });
    expect(result.overtimeBp).toBe(3500);
  });

  it('overrides multiples : nuit +30% (favorable) + dim +30% (CCT plus favorable) → mix', () => {
    const result = applyContractOverrides(cct, { nightBp: 3000, sundayBp: 3000 });
    expect(result.nightBp).toBe(3000); // contrat
    expect(result.sundayBp).toBe(5000); // CCT (50% > 30%)
  });

  it('stackSundayAndNight et overtimeThresholdMinutes ne sont pas overridables (CCT branche)', () => {
    const cctStacked: PayrollSurchargeRules = {
      ...cct,
      stackSundayAndNight: true,
      overtimeThresholdMinutes: 50 * 60,
    };
    const result = applyContractOverrides(cctStacked, { nightBp: 3000 });
    expect(result.stackSundayAndNight).toBe(true);
    expect(result.overtimeThresholdMinutes).toBe(50 * 60);
  });

  it("application transitive : combinedSurchargeBp(['night'], applyOverrides(cct, {nightBp: 3000})) = 3000", () => {
    const effective = applyContractOverrides(cct, { nightBp: 3000 });
    expect(combinedSurchargeBp(['night'], effective)).toBe(3000);
  });

  it("application transitive : combinedSurchargeBp(['holiday'], applyOverrides(cct, {holidayBp: 1000})) = 5000 (CCT protège)", () => {
    const effective = applyContractOverrides(cct, { holidayBp: 1000 });
    expect(combinedSurchargeBp(['holiday'], effective)).toBe(5000);
  });
});
