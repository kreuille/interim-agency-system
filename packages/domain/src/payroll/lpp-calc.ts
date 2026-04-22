import type { SocialRates2026 } from './social-rates.js';

/**
 * Calcul LPP (Prévoyance professionnelle) — part salariale.
 *
 * **Rappel légal** :
 *   - Franchise annuelle : 22'050 CHF (3/4 rente AVS max 2026).
 *     Salaire annuel < franchise → pas de cotisation LPP obligatoire.
 *   - Plafond annuel coordonné : 88'200 CHF.
 *     Salaire entre franchise et plafond → salaire coordonné =
 *     `salaire annuel projeté - franchise`.
 *   - Salaire annuel > plafond → on prend `plafond - franchise` = 66'150 CHF.
 *   - Taux par âge (LPP minimum, employé) :
 *     - 25-34 : 7%   → 3.5% salarié, 3.5% employeur
 *     - 35-44 : 10%  → 5%
 *     - 45-54 : 15%  → 7.5%
 *     - 55-64/65 : 18% → 9%
 *
 * **Méthode hebdo MVP** :
 *   1. Projeter brut hebdo × 52 = brut annuel théorique.
 *   2. Si projection < franchise → 0n (intérimaire occasionnel).
 *   3. Sinon, salaire coordonné annuel = min(projection, plafond) - franchise.
 *   4. Cotisation annuelle = salaireCoord × tauxAge × 0.5 (part salarié).
 *   5. Cotisation hebdo = cotisationAnnuelle / 52.
 *
 * Note : les caisses LPP (Profond, Swisscanto, etc.) ont des plans
 * sur-obligatoires plus généreux. Ici on calcule le **minimum LPP** —
 * l'agence peut augmenter via DETTE-066 (charge config par caisse).
 */

export const LPP_AGE_BRACKETS = [
  { from: 25, to: 34, totalBp: 700 }, // 7%
  { from: 35, to: 44, totalBp: 1000 }, // 10%
  { from: 45, to: 54, totalBp: 1500 }, // 15%
  { from: 55, to: 65, totalBp: 1800 }, // 18%
] as const;

export interface LppInput {
  readonly grossWeekRappen: bigint;
  readonly ageAtComputation: number;
  readonly rates: SocialRates2026;
}

export interface LppOutput {
  /** Salaire coordonné annuel (peut être 0 si sous franchise). */
  readonly coordinatedAnnualRappen: bigint;
  /** Taux total LPP appliqué (employé + employeur), en bp. */
  readonly totalBp: number;
  /** Part salariale hebdo en rappen (= cotisationAnnuelle / 2 / 52). */
  readonly employeeWeekRappen: bigint;
}

export function computeLppEmployeeWeek(input: LppInput): LppOutput {
  if (input.grossWeekRappen <= 0n || input.ageAtComputation < 25) {
    return { coordinatedAnnualRappen: 0n, totalBp: 0, employeeWeekRappen: 0n };
  }
  const annualGross = input.grossWeekRappen * 52n;
  if (annualGross < input.rates.lppFranchiseAnnualRappen) {
    return { coordinatedAnnualRappen: 0n, totalBp: 0, employeeWeekRappen: 0n };
  }
  const ceiling =
    annualGross > input.rates.lppCeilingAnnualRappen
      ? input.rates.lppCeilingAnnualRappen
      : annualGross;
  const coordinated = ceiling - input.rates.lppFranchiseAnnualRappen;
  if (coordinated <= 0n) {
    return { coordinatedAnnualRappen: 0n, totalBp: 0, employeeWeekRappen: 0n };
  }
  const bracket = LPP_AGE_BRACKETS.find(
    (b) => input.ageAtComputation >= b.from && input.ageAtComputation <= b.to,
  );
  if (!bracket) {
    return { coordinatedAnnualRappen: coordinated, totalBp: 0, employeeWeekRappen: 0n };
  }
  // Part salariée = totalBp / 2 (employeur paie l'autre moitié).
  const employeeAnnualRappen = (coordinated * BigInt(bracket.totalBp)) / 10000n / 2n;
  const employeeWeekRappen = employeeAnnualRappen / 52n;
  return {
    coordinatedAnnualRappen: coordinated,
    totalBp: bracket.totalBp,
    employeeWeekRappen,
  };
}
