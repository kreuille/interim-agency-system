import type { StaffId } from '../shared/ids.js';
import {
  computeIs,
  permitIsTaxedAtSource,
  selectIsCanton,
  type IsBracketsPort,
  type IsTarifCode,
  type PermitType,
} from './is-brackets.js';
import { computeLppEmployeeWeek, type LppOutput } from './lpp-calc.js';
import type { PayrollBreakdown } from './payroll-engine.js';
import { round5Rappen, round5RappenDelta } from './round-swiss.js';
import {
  computeAc,
  computeAvs,
  computeLaaNbu,
  DEFAULT_SOCIAL_RATES_2026,
  type SocialRates2026,
} from './social-rates.js';

/**
 * Moteur de bulletin de paie — sprint A5.3.
 *
 * Prend le `PayrollBreakdown` produit par `PayrollEngine` (A5.1) et
 * applique :
 *   1. Compléments : +13ᵉ (8.33%) + vacances (8.33% ou 10.64% ≥50ans)
 *      → augmente la base brute (ces compléments sont versés
 *      hebdomadairement à l'intérimaire, pas capitalisés).
 *   2. Déductions sociales : AVS / AC / LAA-NBU / LPP / IS.
 *   3. Arrondi 5cts au NET final (CO art. 84).
 *
 * Ordre de calcul (important pour assiettes) :
 *   a. grossBrutAvecComplements = breakdown.grossTotal + 13e + vac
 *   b. AVS / AC / LAA : assiettes = grossBrutAvecComplements
 *   c. LPP : assiette = grossBrutAvecComplements (projeté annuel)
 *   d. IS : assiette = grossBrutAvecComplements - (AVS + AC + LAA + LPP)
 *     (normalement le salaire déterminant IS est brut moins cotisations
 *      sociales déductibles fiscalement — on applique cette règle simple)
 *   e. net = grossBrut + complements - déductions - IS
 *   f. netRounded = round5Rappen(net)
 *   g. adjustment = netRounded - net (audit)
 *
 * Pas de salaire net négatif : si déductions > brut (cas exotique
 * workers < 25 + IS élevé), on clamp à 0n et log warning (DETTE-069).
 */

export const PAYSLIP_ENGINE_VERSION = '1.0.0';

/** Complément 13e mois au prorata hebdo (1/12). */
export const BONUS_13TH_BP = 833; // 8.33%

/** Complément vacances standard (≥ 2 ans d'ancienneté ou intérim). */
export const HOLIDAY_BP_UNDER_50 = 833; // 8.33% (4 semaines)
/** Complément vacances ≥ 50 ans (5 semaines). */
export const HOLIDAY_BP_50_PLUS = 1064; // 10.64%

export interface PayslipWorkerInfo {
  readonly workerId: StaffId;
  readonly age: number;
  readonly permit: PermitType;
  readonly domicileCanton: string;
  readonly workCanton: string;
  readonly isTarif: IsTarifCode;
}

export interface PayslipEngineDeps {
  readonly isBrackets: IsBracketsPort;
  readonly rates?: SocialRates2026;
  readonly year?: number;
  /** Override pour tests — defaults: BONUS_13TH_BP, HOLIDAY_BP_UNDER_50, HOLIDAY_BP_50_PLUS. */
  readonly bonus13thBp?: number;
  readonly holidayBpUnder50?: number;
  readonly holidayBp50Plus?: number;
}

export interface PayslipBreakdown {
  readonly workerId: StaffId;
  readonly isoWeek: string;
  /** Brut travaillé (avant compléments). */
  readonly workedGrossRappen: bigint;
  /** +8.33% 13ᵉ mois. */
  readonly bonus13thRappen: bigint;
  /** +8.33% ou +10.64% vacances. */
  readonly holidayPayRappen: bigint;
  /** Total brut avec compléments = assiette cotisations sociales. */
  readonly totalGrossRappen: bigint;
  /** Retenue AVS/AI/APG salarié. */
  readonly avsRappen: bigint;
  /** Retenue AC salarié. */
  readonly acRappen: bigint;
  /** Retenue LAA non-professionnel salarié. */
  readonly laaRappen: bigint;
  /** Retenue LPP salarié + contexte. */
  readonly lpp: LppOutput;
  /** Retenue Impôt à la source (0 si non applicable). */
  readonly isRappen: bigint;
  readonly isCanton: string | null;
  /** Total des déductions. */
  readonly totalDeductionsRappen: bigint;
  /** Net avant arrondi 5cts. */
  readonly netBeforeRoundingRappen: bigint;
  /** Delta arrondi 5cts (positif = worker gagne, négatif = worker perd). */
  readonly round5AdjustmentRappen: bigint;
  /** Net final versé au worker (multiple de 5 rappen). */
  readonly netRappen: bigint;
  readonly engineVersion: string;
  readonly ratesApplied: SocialRates2026;
  readonly yearApplied: number;
}

export class PayslipEngine {
  constructor(private readonly deps: PayslipEngineDeps) {}

  compute(breakdown: PayrollBreakdown, worker: PayslipWorkerInfo): PayslipBreakdown {
    const rates = this.deps.rates ?? DEFAULT_SOCIAL_RATES_2026;
    const year = this.deps.year ?? Number.parseInt(breakdown.isoWeek.slice(0, 4), 10);

    const bonus13thBp = this.deps.bonus13thBp ?? BONUS_13TH_BP;
    const holidayBp =
      worker.age >= 50
        ? (this.deps.holidayBp50Plus ?? HOLIDAY_BP_50_PLUS)
        : (this.deps.holidayBpUnder50 ?? HOLIDAY_BP_UNDER_50);

    const workedGross = breakdown.grossTotalBeforeSocialRappen;
    const bonus13th = (workedGross * BigInt(bonus13thBp)) / 10000n;
    const holidayPay = (workedGross * BigInt(holidayBp)) / 10000n;
    const totalGross = workedGross + bonus13th + holidayPay;

    const avs = computeAvs(totalGross, rates);
    const ac = computeAc(totalGross, rates);
    const laa = computeLaaNbu(totalGross, rates);
    const lpp = computeLppEmployeeWeek({
      grossWeekRappen: totalGross,
      ageAtComputation: worker.age,
      rates,
    });

    // Assiette IS = brut - cotisations sociales déductibles
    const socialDeductions = avs + ac + laa + lpp.employeeWeekRappen;
    const isBase = totalGross - socialDeductions;
    let isCanton: string | null = null;
    let isRappen = 0n;
    if (permitIsTaxedAtSource(worker.permit)) {
      isCanton = selectIsCanton({
        permit: worker.permit,
        domicileCanton: worker.domicileCanton,
        workCanton: worker.workCanton,
      });
      const table = this.deps.isBrackets.load({
        canton: isCanton,
        tarif: worker.isTarif,
        year,
      });
      isRappen = computeIs(isBase > 0n ? isBase : 0n, table);
    }

    const totalDeductions = socialDeductions + isRappen;
    let netBeforeRounding = totalGross - totalDeductions;
    if (netBeforeRounding < 0n) netBeforeRounding = 0n;

    const netRounded = round5Rappen(netBeforeRounding);
    const roundDelta = round5RappenDelta(netBeforeRounding);

    return {
      workerId: worker.workerId,
      isoWeek: breakdown.isoWeek,
      workedGrossRappen: workedGross,
      bonus13thRappen: bonus13th,
      holidayPayRappen: holidayPay,
      totalGrossRappen: totalGross,
      avsRappen: avs,
      acRappen: ac,
      laaRappen: laa,
      lpp,
      isRappen,
      isCanton,
      totalDeductionsRappen: totalDeductions,
      netBeforeRoundingRappen: netBeforeRounding,
      round5AdjustmentRappen: roundDelta,
      netRappen: netRounded,
      engineVersion: PAYSLIP_ENGINE_VERSION,
      ratesApplied: rates,
      yearApplied: year,
    };
  }
}
