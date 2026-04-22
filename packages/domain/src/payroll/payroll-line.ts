import type { PayrollSurchargeKind } from './surcharge-rules.js';

/**
 * Une ligne de décompte = un segment continu d'un timesheet auquel
 * s'applique une combinaison unique de catégories de surcharge.
 *
 * Exemple : 8h-17h jour ouvré normal → 1 ligne `kinds: ['normal']`.
 * Exemple : dim 22h-23h + dim 23h-lundi 06h
 *   → 2 lignes : `[sunday]` 60 min + `[sunday, night]` 7h.
 *
 * Rappens utilisés partout (CLAUDE.md §3.1). `bigint` pour éviter
 * tout dépassement sur les agrégats > CHF 21M sur l'année (cas
 * d'agence multi-sites avec ~100 workers).
 */
export interface PayrollLine {
  readonly date: string; // YYYY-MM-DD (UTC) du segment
  readonly minutes: number;
  readonly kinds: readonly PayrollSurchargeKind[];
  readonly baseHourlyRappen: bigint;
  /** Multiplier en basis points (10000 = +100%). 0 = pas de majo. */
  readonly surchargeBp: number;
  /** Total ligne en rappen, déjà majoré : minutes/60 × base × (1 + bp/10000). */
  readonly totalRappen: bigint;
  /** Référence au timesheet d'origine (audit + reproductibilité). */
  readonly sourceTimesheetId: string;
  readonly sourceClientId: string;
}

/**
 * Calcule le total rappen d'une ligne sans flotter (arithmétique
 * entière exacte). Formule :
 *
 *   total = baseHourly × minutes × (10000 + surchargeBp) / (60 × 10000)
 *
 * Arrondi : on calcule en numérateur entier puis arrondi banker (ties
 * to even) au rappen le plus proche pour éviter le biais cumulé.
 */
export function computeLineTotalRappen(input: {
  baseHourlyRappen: bigint;
  minutes: number;
  surchargeBp: number;
}): bigint {
  if (input.minutes <= 0) return 0n;
  const numerator =
    input.baseHourlyRappen * BigInt(input.minutes) * BigInt(10000 + input.surchargeBp);
  const denominator = 600000n; // 60 minutes × 10000 bp
  return roundBankers(numerator, denominator);
}

/**
 * Arrondi "banker's rounding" (round-half-to-even) sur entiers bigint.
 * Réduit le biais cumulé sur des milliers de lignes vs round-half-up.
 *
 * Si le reste vaut exactement la moitié du diviseur, on arrondit au
 * pair le plus proche.
 */
function roundBankers(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error('denominator must be positive');
  const sign = numerator < 0n ? -1n : 1n;
  const absNum = sign === -1n ? -numerator : numerator;
  const quotient = absNum / denominator;
  const remainder = absNum % denominator;
  const twiceRem = remainder * 2n;
  if (twiceRem < denominator) return sign * quotient;
  if (twiceRem > denominator) return sign * (quotient + 1n);
  // exactement à mi-chemin → pair le plus proche
  if (quotient % 2n === 0n) return sign * quotient;
  return sign * (quotient + 1n);
}

export const _internalRoundBankers = roundBankers;
