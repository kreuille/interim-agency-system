import type { Clock } from '@interim/shared';
import type { AgencyId } from '../shared/ids.js';
import { DomainError } from '../workers/errors.js';
import type { ClientId } from './client.js';

export type ClientContractId = string & { readonly __brand: 'ClientContractId' };

export function asClientContractId(value: string): ClientContractId {
  if (value.length === 0) throw new Error('ClientContractId cannot be empty');
  return value as ClientContractId;
}

export interface ClientContractProps {
  readonly id: ClientContractId;
  readonly agencyId: AgencyId;
  readonly clientId: ClientId;
  readonly version: number;
  readonly branch: string;
  readonly billingFrequencyDays: number; // ex 30 = mensuel
  readonly agencyCoefficientBp: number; // basis points (165% = 16500)
  readonly notes?: string;
  readonly validFrom: Date;
  readonly validUntil?: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateClientContractInput {
  readonly id: ClientContractId;
  readonly agencyId: AgencyId;
  readonly clientId: ClientId;
  readonly branch: string;
  readonly billingFrequencyDays?: number;
  readonly agencyCoefficientBp: number;
  readonly notes?: string;
  readonly validFrom: Date;
  readonly validUntil?: Date;
}

export class ClientContractRetroactiveModification extends DomainError {
  constructor() {
    super(
      'client_contract_retroactive_modification',
      'Un contrat actif ne peut pas être muté ; créer une nouvelle version',
    );
  }
}

const DEFAULT_BILLING_FREQUENCY_DAYS = 30;

/**
 * Contrat cadre client. Versionné : toute modification métier (coef agence,
 * billing frequency) doit créer une nouvelle version, pas muter.
 *
 * Le `validFrom` ne peut être dans le passé (sauf à la création initiale,
 * pour reprendre l'historique d'un client existant).
 */
export class ClientContract {
  private constructor(private readonly props: ClientContractProps) {}

  static create(input: CreateClientContractInput, clock: Clock): ClientContract {
    if (input.validUntil && input.validUntil.getTime() < input.validFrom.getTime()) {
      throw new DomainError(
        'invalid_validity_window',
        'validUntil ne peut pas être avant validFrom',
      );
    }
    if (input.agencyCoefficientBp < 10_000) {
      throw new DomainError(
        'invalid_agency_coefficient',
        `Coefficient agence ${String(input.agencyCoefficientBp)} bp < 100% (10000) — l'agence ne peut pas être déficitaire`,
      );
    }
    const now = clock.now();
    return new ClientContract({
      id: input.id,
      agencyId: input.agencyId,
      clientId: input.clientId,
      version: 1,
      branch: input.branch,
      billingFrequencyDays: input.billingFrequencyDays ?? DEFAULT_BILLING_FREQUENCY_DAYS,
      agencyCoefficientBp: input.agencyCoefficientBp,
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      validFrom: input.validFrom,
      ...(input.validUntil !== undefined ? { validUntil: input.validUntil } : {}),
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(props: ClientContractProps): ClientContract {
    return new ClientContract(props);
  }

  /**
   * Crée une nouvelle version (immutabilité). Le contrat précédent garde son
   * `validUntil` à la date de bascule.
   */
  supersede(input: {
    nextId: ClientContractId;
    branch?: string;
    agencyCoefficientBp?: number;
    billingFrequencyDays?: number;
    notes?: string | undefined;
    validFrom: Date;
    clock: Clock;
  }): { previous: ClientContract; next: ClientContract } {
    if (input.validFrom.getTime() <= this.props.validFrom.getTime()) {
      throw new ClientContractRetroactiveModification();
    }
    const previousClosed = new ClientContract({
      ...this.props,
      validUntil: input.validFrom,
      updatedAt: input.clock.now(),
    });
    const next = ClientContract.create(
      {
        id: input.nextId,
        agencyId: this.props.agencyId,
        clientId: this.props.clientId,
        branch: input.branch ?? this.props.branch,
        billingFrequencyDays: input.billingFrequencyDays ?? this.props.billingFrequencyDays,
        agencyCoefficientBp: input.agencyCoefficientBp ?? this.props.agencyCoefficientBp,
        ...(input.notes !== undefined
          ? { notes: input.notes }
          : this.props.notes !== undefined
            ? { notes: this.props.notes }
            : {}),
        validFrom: input.validFrom,
      },
      input.clock,
    );
    // Bump version
    const versioned = new ClientContract({ ...next.toSnapshot(), version: this.props.version + 1 });
    return { previous: previousClosed, next: versioned };
  }

  isActiveAt(date: Date): boolean {
    if (date.getTime() < this.props.validFrom.getTime()) return false;
    if (this.props.validUntil && date.getTime() >= this.props.validUntil.getTime()) return false;
    return true;
  }

  toSnapshot(): Readonly<ClientContractProps> {
    return Object.freeze({ ...this.props });
  }

  get id(): ClientContractId {
    return this.props.id;
  }

  get clientId(): ClientId {
    return this.props.clientId;
  }

  get version(): number {
    return this.props.version;
  }
}
