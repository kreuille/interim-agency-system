import type { Clock } from '@interim/shared';
import type { AgencyId } from '../shared/ids.js';
import { DomainError } from '../workers/errors.js';
import type { ClientContractId } from './client-contract.js';
import type { ClientId } from './client.js';

export type RateCardId = string & { readonly __brand: 'RateCardId' };

export function asRateCardId(value: string): RateCardId {
  if (value.length === 0) throw new Error('RateCardId cannot be empty');
  return value as RateCardId;
}

export interface RateCardProps {
  readonly id: RateCardId;
  readonly agencyId: AgencyId;
  readonly clientId: ClientId;
  readonly clientContractId?: ClientContractId;
  readonly role: string; // ex 'Déménageur', 'Chauffeur C1'
  readonly branch: string;
  readonly hourlyRappen: bigint; // taux client de base
  readonly nightPremiumBp: number; // basis points (25% = 2500)
  readonly sundayPremiumBp: number;
  readonly overtimePremiumBp: number;
  readonly holidayPremiumBp: number;
  readonly validFrom: Date;
  readonly validUntil?: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateRateCardInput {
  readonly id: RateCardId;
  readonly agencyId: AgencyId;
  readonly clientId: ClientId;
  readonly clientContractId?: ClientContractId;
  readonly role: string;
  readonly branch: string;
  readonly hourlyRappen: bigint;
  readonly nightPremiumBp?: number;
  readonly sundayPremiumBp?: number;
  readonly overtimePremiumBp?: number;
  readonly holidayPremiumBp?: number;
  readonly validFrom: Date;
  readonly validUntil?: Date;
}

const DEFAULT_NIGHT_PREMIUM_BP = 2500;
const DEFAULT_SUNDAY_PREMIUM_BP = 5000;
const DEFAULT_OVERTIME_PREMIUM_BP = 2500;
const DEFAULT_HOLIDAY_PREMIUM_BP = 5000;

export class RateCard {
  private constructor(private readonly props: RateCardProps) {}

  static create(input: CreateRateCardInput, clock: Clock): RateCard {
    if (input.hourlyRappen <= 0n) {
      throw new DomainError(
        'invalid_hourly_rate',
        `Taux horaire doit être > 0 Rappen, reçu ${input.hourlyRappen.toString()}`,
      );
    }
    for (const [field, value] of Object.entries({
      nightPremiumBp: input.nightPremiumBp,
      sundayPremiumBp: input.sundayPremiumBp,
      overtimePremiumBp: input.overtimePremiumBp,
      holidayPremiumBp: input.holidayPremiumBp,
    })) {
      if (value !== undefined && (value < 0 || value > 20_000)) {
        throw new DomainError(
          'invalid_premium',
          `${field} doit être 0..20000 bp (= 0..200%), reçu ${String(value)}`,
        );
      }
    }
    if (input.validUntil && input.validUntil.getTime() < input.validFrom.getTime()) {
      throw new DomainError(
        'invalid_validity_window',
        'validUntil ne peut pas être avant validFrom',
      );
    }
    const now = clock.now();
    return new RateCard({
      id: input.id,
      agencyId: input.agencyId,
      clientId: input.clientId,
      ...(input.clientContractId !== undefined ? { clientContractId: input.clientContractId } : {}),
      role: input.role,
      branch: input.branch,
      hourlyRappen: input.hourlyRappen,
      nightPremiumBp: input.nightPremiumBp ?? DEFAULT_NIGHT_PREMIUM_BP,
      sundayPremiumBp: input.sundayPremiumBp ?? DEFAULT_SUNDAY_PREMIUM_BP,
      overtimePremiumBp: input.overtimePremiumBp ?? DEFAULT_OVERTIME_PREMIUM_BP,
      holidayPremiumBp: input.holidayPremiumBp ?? DEFAULT_HOLIDAY_PREMIUM_BP,
      validFrom: input.validFrom,
      ...(input.validUntil !== undefined ? { validUntil: input.validUntil } : {}),
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(props: RateCardProps): RateCard {
    return new RateCard(props);
  }

  isActiveAt(date: Date): boolean {
    if (date.getTime() < this.props.validFrom.getTime()) return false;
    if (this.props.validUntil && date.getTime() >= this.props.validUntil.getTime()) return false;
    return true;
  }

  toSnapshot(): Readonly<RateCardProps> {
    return Object.freeze({ ...this.props });
  }

  get id(): RateCardId {
    return this.props.id;
  }

  get hourlyRappen(): bigint {
    return this.props.hourlyRappen;
  }
}
