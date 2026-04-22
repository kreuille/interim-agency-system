import { DomainError } from '../workers/errors.js';

/**
 * Catégories de majoration applicables à un segment de travail.
 *
 * - `normal`     : heures ouvrées de jour, jour ouvrable, semaine sous quota
 *                  → pas de majoration (multiplier 1.0).
 * - `night`      : 23h-06h en semaine (LTr art. 17b).
 * - `sunday`     : dimanche (LTr art. 19).
 * - `holiday`    : férié cantonal (CCT-spécifique).
 * - `overtime`   : heures > quota hebdomadaire contractuel (CCT, ex. 41h).
 *                  Note : > maxWeeklyMinutes (50h) est un blocker LTr,
 *                  pas une majoration — refusé en amont par
 *                  `RecordInboundTimesheetUseCase`.
 */
export const PAYROLL_SURCHARGE_KINDS = [
  'normal',
  'night',
  'sunday',
  'holiday',
  'overtime',
] as const;
export type PayrollSurchargeKind = (typeof PAYROLL_SURCHARGE_KINDS)[number];

/**
 * Règles de majoration par branche CCT. Multipliers exprimés en
 * **basis points** (10000 = +100%). Exemple : 1250 = +12.5%, 5000 = +50%.
 * Stockage entier strict pour éviter erreurs flottantes (CLAUDE.md §3.1).
 *
 * Les valeurs ci-dessous reflètent les CCT 2024-2026 majoritaires
 * (Swissstaffing). À adapter par canton dans `loadSurchargeRulesForBranch`
 * si CCT cantonale impose un minimum supérieur.
 *
 * Référence légale :
 *   - LTr art. 17b : nuit régulière 10%, occasionnelle 25%.
 *   - LTr art. 19  : dimanche occasionnel 50%.
 *   - LTr art. 20a : férié assimilé dimanche.
 */
export interface PayrollSurchargeRules {
  readonly nightBp: number; // basis points sur taux base
  readonly sundayBp: number;
  readonly holidayBp: number;
  readonly overtimeBp: number;
  /**
   * Si true, dimanche ET nuit cumulent (sundayBp + nightBp).
   * Si false, on prend le max des deux (politique défensive).
   * Default : false (CCT majoritaire).
   */
  readonly stackSundayAndNight: boolean;
  /** Seuil hebdo en minutes au-delà duquel on applique `overtimeBp`. */
  readonly overtimeThresholdMinutes: number;
}

export class UnknownBranchSurchargeRules extends DomainError {
  constructor(branch: string) {
    super(
      'unknown_branch_surcharge_rules',
      `Aucune règle de majoration définie pour la branche "${branch}"`,
    );
  }
}

/**
 * Politique par défaut "occasionnelle" — la plus protectrice. Override
 * via la table CCT si l'agence a négocié des majos régulières <25% pour
 * du travail de nuit récurrent (LTr art. 17b autorise 10% si régulier
 * + plan compensatoire — out of scope MVP).
 */
export const DEFAULT_SURCHARGE_RULES: PayrollSurchargeRules = {
  nightBp: 2500, // +25%
  sundayBp: 5000, // +50%
  holidayBp: 5000, // +50% (LTr art. 20a assimile au dimanche)
  overtimeBp: 2500, // +25%
  stackSundayAndNight: false,
  overtimeThresholdMinutes: 41 * 60, // 41h = quota hebdo CCT majoritaire
};

/**
 * Catalogue par branche CCT. Étend selon besoins agence.
 * `bâtiment gros œuvre` (CN 2024-2028) : 50h max + nuit 25% + dim 50%.
 * `logistique` : 41h quota, nuit majorée 25%.
 * `déménagement` : pas de CCT nationale spécifique → DEFAULT.
 */
const RULES_BY_BRANCH: Readonly<Record<string, PayrollSurchargeRules>> = {
  demenagement: DEFAULT_SURCHARGE_RULES,
  btp_gros_oeuvre: {
    ...DEFAULT_SURCHARGE_RULES,
    holidayBp: 10000, // +100% en CN bâtiment
    overtimeThresholdMinutes: 50 * 60, // 50h dans le bâtiment
  },
  btp_second_oeuvre: DEFAULT_SURCHARGE_RULES,
  logistique: {
    ...DEFAULT_SURCHARGE_RULES,
    overtimeThresholdMinutes: 42 * 60, // 42h logistique
  },
};

export function loadSurchargeRulesForBranch(branch: string): PayrollSurchargeRules {
  const rules = RULES_BY_BRANCH[branch];
  if (!rules) throw new UnknownBranchSurchargeRules(branch);
  return rules;
}

/**
 * Renvoie le multiplier (en basis points) pour la combinaison des
 * catégories applicables à un segment. Si plusieurs catégories
 * s'appliquent (ex. dim + nuit), applique la politique `stackSundayAndNight`.
 *
 * `overtime` se cumule TOUJOURS aux autres (heure sup + nuit = nuit + sup).
 */
export function combinedSurchargeBp(
  kinds: readonly PayrollSurchargeKind[],
  rules: PayrollSurchargeRules,
): number {
  let base = 0;
  const hasNight = kinds.includes('night');
  const hasSunday = kinds.includes('sunday');
  const hasHoliday = kinds.includes('holiday');
  const hasOvertime = kinds.includes('overtime');

  // Holiday assimilé dimanche (LTr art. 20a) — on ne cumule pas
  // sunday + holiday (ce serait déjà dim + dim).
  if (hasHoliday) base = Math.max(base, rules.holidayBp);
  if (hasSunday) base = Math.max(base, rules.sundayBp);

  if (hasNight) {
    if (rules.stackSundayAndNight && (hasSunday || hasHoliday)) {
      base += rules.nightBp;
    } else {
      base = Math.max(base, rules.nightBp);
    }
  }
  if (hasOvertime) base += rules.overtimeBp;
  return base;
}
