import type { Money } from '@interim/shared';
import { DomainError } from '../workers/errors.js';

/**
 * Référentiel des minima horaires CCT (Convention Collective de Travail) :
 * Location de Services Suisse + DTA cantonales le cas échéant.
 *
 * Source : Swissstaffing publie chaque année les barèmes par branche, par
 * qualification, par tranche d'âge, parfois par canton (les cantons GE/VD
 * ont des minimums supérieurs au minimum fédéral pour certains métiers).
 *
 * Le scan de paie A.5 lira `cct_minimum_rates` (table Prisma à seeder via
 * `prisma/seeds/cct-rates-2026.ts`). Cette entité représente une ligne du
 * barème, value-object immutable.
 */
export interface CctMinimumRateProps {
  readonly branch: string;
  readonly qualification: string;
  readonly canton?: string; // undefined = barème fédéral
  readonly ageBracket?: 'under_20' | 'twenty_plus' | 'fifty_plus';
  readonly minHourlyRappen: bigint;
  readonly validFrom: Date;
  readonly validUntil?: Date;
}

export class CctMinimumRate {
  constructor(public readonly props: CctMinimumRateProps) {}

  matches(input: {
    branch: string;
    qualification: string;
    canton?: string;
    ageBracket?: 'under_20' | 'twenty_plus' | 'fifty_plus';
    at: Date;
  }): boolean {
    if (this.props.branch !== input.branch) return false;
    if (this.props.qualification !== input.qualification) return false;
    if (this.props.canton !== undefined && this.props.canton !== input.canton) return false;
    if (this.props.ageBracket !== undefined && this.props.ageBracket !== input.ageBracket) {
      return false;
    }
    if (input.at.getTime() < this.props.validFrom.getTime()) return false;
    if (this.props.validUntil && input.at.getTime() > this.props.validUntil.getTime()) return false;
    return true;
  }

  isCantonalSpecific(): boolean {
    return this.props.canton !== undefined;
  }

  get minHourlyRappen(): bigint {
    return this.props.minHourlyRappen;
  }
}

export class BelowCctMinimum extends DomainError {
  constructor(
    public readonly branch: string,
    public readonly qualification: string,
    public readonly proposedRappen: bigint,
    public readonly minimumRappen: bigint,
  ) {
    super(
      'below_cct_minimum',
      `Taux ${proposedRappen.toString()} Rp/h < minimum CCT ${minimumRappen.toString()} Rp/h pour ${branch}/${qualification}`,
    );
  }
}

export class NoCctMinimumFound extends DomainError {
  constructor(branch: string, qualification: string) {
    super(
      'no_cct_minimum_found',
      `Aucun barème CCT défini pour ${branch} / ${qualification} à cette date`,
    );
  }
}

/**
 * Renvoie le minimum applicable (cantonal en priorité s'il existe).
 * @throws NoCctMinimumFound si aucune ligne ne matche
 */
export function findApplicableMinimum(
  rates: readonly CctMinimumRate[],
  query: {
    branch: string;
    qualification: string;
    canton?: string;
    ageBracket?: 'under_20' | 'twenty_plus' | 'fifty_plus';
    at: Date;
  },
): CctMinimumRate {
  const matching = rates.filter((r) => r.matches(query));
  if (matching.length === 0) {
    throw new NoCctMinimumFound(query.branch, query.qualification);
  }
  // Prioriser cantonal s'il existe (peut être plus élevé que fédéral).
  const cantonal = matching.filter((r) => r.isCantonalSpecific());
  if (cantonal.length > 0 && cantonal[0]) {
    // Renvoyer le plus élevé parmi les cantonaux applicables.
    return cantonal.reduce((max, r) => (r.minHourlyRappen > max.minHourlyRappen ? r : max));
  }
  return matching.reduce((max, r) => (r.minHourlyRappen > max.minHourlyRappen ? r : max));
}

export interface RateValidationInput {
  readonly branch: string;
  readonly qualification: string;
  readonly canton?: string;
  readonly ageBracket?: 'under_20' | 'twenty_plus' | 'fifty_plus';
  readonly proposedRappen: bigint;
  readonly at: Date;
}

/**
 * @throws BelowCctMinimum si le taux proposé est inférieur au minimum applicable
 * @throws NoCctMinimumFound si aucun barème ne matche
 */
export function validateRateAboveMinimum(
  rates: readonly CctMinimumRate[],
  input: RateValidationInput,
): CctMinimumRate {
  const minimum = findApplicableMinimum(rates, input);
  if (input.proposedRappen < minimum.minHourlyRappen) {
    throw new BelowCctMinimum(
      input.branch,
      input.qualification,
      input.proposedRappen,
      minimum.minHourlyRappen,
    );
  }
  return minimum;
}

export type _Money = Money; // re-exposition typée pour le re-export `Money` utilisé par les callers
