import { describe, expect, it } from 'vitest';
import {
  combinedSurchargeBp,
  DEFAULT_SURCHARGE_RULES,
  loadSurchargeRulesForBranch,
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
