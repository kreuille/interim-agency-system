/**
 * Taux des cotisations sociales suisses 2026 — part **salariale**.
 *
 * Tous les taux en **basis points** (10000 = 100%). bigint pour les
 * seuils annuels en rappen.
 *
 * Sources :
 *   - AVS/AI/APG : OFAS, taux 2026 = 5.30% salarié (10.60% total)
 *   - AC : 1.10% jusqu'à 148'200 CHF/an, +0.50% au-delà (sur l'excédent)
 *   - LAA non-prof. (NBU) : ~1.4% — payée par l'employé. Varie selon
 *     contrat suvA (placeholder ici, vrai taux à charger via port en
 *     production — DETTE-064).
 *   - LPP : franchise annuelle = 22'050 CHF (3/4 rente AVS max), taux
 *     dégressif par tranche d'âge (cf. `lpp-calc.ts`).
 *
 * Ces valeurs sont versionnées dans `config/social-rates/2026.json`
 * en production (loaded par `SocialRatesPort`). Ici, MVP avec
 * constantes — port surchargeable pour tests.
 */

export interface SocialRates2026 {
  /** AVS/AI/APG salarié (5.30%). */
  readonly avsBp: number;
  /** AC salarié niveau 1 (1.10%). */
  readonly acLevel1Bp: number;
  /** AC salarié niveau 2 sur excédent (0.50%). */
  readonly acLevel2Bp: number;
  /** Plafond annuel AC niveau 1 en rappen (148'200 CHF = 14_820_000 rappen). */
  readonly acThresholdAnnualRappen: bigint;
  /** LAA non-professionnel (NBU) — ex. 1.4%. */
  readonly laaNbuBp: number;
  /** Franchise LPP annuelle en rappen (22'050 CHF). */
  readonly lppFranchiseAnnualRappen: bigint;
  /** Plafond LPP annuel coordonné (88'200 CHF = 8'820_000 rappen). */
  readonly lppCeilingAnnualRappen: bigint;
}

export const DEFAULT_SOCIAL_RATES_2026: SocialRates2026 = {
  avsBp: 530, // 5.30%
  acLevel1Bp: 110, // 1.10%
  acLevel2Bp: 50, // 0.50%
  acThresholdAnnualRappen: 14_820_000n, // CHF 148'200
  laaNbuBp: 140, // 1.40% (placeholder)
  lppFranchiseAnnualRappen: 2_205_000n, // CHF 22'050
  lppCeilingAnnualRappen: 8_820_000n, // CHF 88'200
};

/**
 * Calcule la déduction AVS/AI/APG part salariale.
 * Pas de plafond : appliqué linéairement au salaire brut.
 */
export function computeAvs(grossRappen: bigint, rates: SocialRates2026): bigint {
  if (grossRappen <= 0n) return 0n;
  return (grossRappen * BigInt(rates.avsBp)) / 10000n;
}

/**
 * Calcule la déduction AC. À l'échelle hebdo, on convertit le seuil
 * annuel en seuil hebdo via `weeksInYear`. Pour MVP : on suppose
 * 52 semaines (le pro-rata exact ISO 53 sem est fait au niveau année
 * en A5.7 — DETTE-065).
 *
 * Méthode défensive :
 *   - jusqu'à seuil hebdo (148'200/52 ≈ 2'850.- CHF brut/sem) → 1.10%
 *   - au-delà → 1.10% sur seuil + 0.50% sur excédent
 */
export function computeAc(grossRappen: bigint, rates: SocialRates2026): bigint {
  if (grossRappen <= 0n) return 0n;
  const weekThreshold = rates.acThresholdAnnualRappen / 52n;
  if (grossRappen <= weekThreshold) {
    return (grossRappen * BigInt(rates.acLevel1Bp)) / 10000n;
  }
  const onThreshold = (weekThreshold * BigInt(rates.acLevel1Bp)) / 10000n;
  const excedent = grossRappen - weekThreshold;
  const onExcedent = (excedent * BigInt(rates.acLevel2Bp)) / 10000n;
  return onThreshold + onExcedent;
}

/**
 * LAA non-professionnel (assurance accident hors travail) — taux fixe
 * sur le salaire brut. Plafond annuel 148'200 (même que AC) appliqué
 * en hebdo.
 */
export function computeLaaNbu(grossRappen: bigint, rates: SocialRates2026): bigint {
  if (grossRappen <= 0n) return 0n;
  const weekThreshold = rates.acThresholdAnnualRappen / 52n;
  const taxable = grossRappen <= weekThreshold ? grossRappen : weekThreshold;
  return (taxable * BigInt(rates.laaNbuBp)) / 10000n;
}
