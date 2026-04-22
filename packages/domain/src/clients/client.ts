import type { Clock, Email, Ide, Money, Name, Phone } from '@interim/shared';
import type { AgencyId } from '../shared/ids.js';
import { DomainError } from '../workers/errors.js';

export type ClientId = string & { readonly __brand: 'ClientId' };

export function asClientId(value: string): ClientId {
  if (value.length === 0) {
    throw new Error('ClientId cannot be empty');
  }
  return value as ClientId;
}

export const CLIENT_STATUSES = ['prospect', 'active', 'suspended', 'churned'] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

/**
 * Transitions de statut autorisées (machine à états explicite) :
 *  prospect → active
 *  active → suspended → active (réactivation)
 *  active → churned (perte client)
 *  suspended → churned
 *  churned est terminal.
 */
const ALLOWED_TRANSITIONS: Readonly<Record<ClientStatus, readonly ClientStatus[]>> = {
  prospect: ['active'],
  active: ['suspended', 'churned'],
  suspended: ['active', 'churned'],
  churned: [],
};

export class InvalidClientTransition extends DomainError {
  constructor(from: ClientStatus, to: ClientStatus) {
    super('invalid_client_transition', `Transition client invalide ${from} → ${to}`);
  }
}

export const CONTACT_ROLES = ['signatory', 'billing', 'ops', 'escalation_24_7'] as const;
export type ContactRole = (typeof CONTACT_ROLES)[number];

export interface ClientContact {
  readonly id: string;
  readonly role: ContactRole;
  readonly firstName: Name;
  readonly lastName: Name;
  readonly email?: Email;
  readonly phone?: Phone;
}

export interface ClientProps {
  readonly id: ClientId;
  readonly agencyId: AgencyId;
  readonly legalName: Name;
  readonly ide?: Ide;
  readonly addressLine1?: string;
  readonly addressLine2?: string;
  readonly zipCode?: string;
  readonly city?: string;
  readonly canton?: string;
  readonly status: ClientStatus;
  readonly creditLimit?: Money;
  readonly paymentTermDays: number;
  readonly notes?: string;
  readonly contacts: readonly ClientContact[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly archivedAt?: Date;
}

export interface CreateClientInput {
  readonly id: ClientId;
  readonly agencyId: AgencyId;
  readonly legalName: Name;
  readonly ide?: Ide;
  readonly paymentTermDays?: number;
  readonly creditLimit?: Money;
  readonly notes?: string;
  readonly contacts?: readonly ClientContact[];
}

const DEFAULT_PAYMENT_TERM_DAYS = 30;

export class Client {
  private constructor(private props: ClientProps) {}

  static create(input: CreateClientInput, clock: Clock): Client {
    const now = clock.now();
    const props: ClientProps = {
      id: input.id,
      agencyId: input.agencyId,
      legalName: input.legalName,
      ...(input.ide !== undefined ? { ide: input.ide } : {}),
      status: 'prospect',
      paymentTermDays: input.paymentTermDays ?? DEFAULT_PAYMENT_TERM_DAYS,
      ...(input.creditLimit !== undefined ? { creditLimit: input.creditLimit } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      contacts: input.contacts ?? [],
      createdAt: now,
      updatedAt: now,
    };
    return new Client(props);
  }

  static rehydrate(props: ClientProps): Client {
    return new Client(props);
  }

  get id(): ClientId {
    return this.props.id;
  }

  get agencyId(): AgencyId {
    return this.props.agencyId;
  }

  get status(): ClientStatus {
    return this.props.status;
  }

  get isArchived(): boolean {
    return this.props.archivedAt !== undefined;
  }

  transitionTo(target: ClientStatus, clock: Clock): void {
    const allowed = ALLOWED_TRANSITIONS[this.props.status];
    if (!allowed.includes(target)) {
      throw new InvalidClientTransition(this.props.status, target);
    }
    this.props = {
      ...this.props,
      status: target,
      updatedAt: clock.now(),
    };
  }

  rename(legalName: Name, clock: Clock): void {
    this.props = { ...this.props, legalName, updatedAt: clock.now() };
  }

  changeIde(ide: Ide | undefined, clock: Clock): void {
    const next: ClientProps = { ...this.props, updatedAt: clock.now() };
    if (ide === undefined) {
      delete (next as { ide?: Ide }).ide;
    } else {
      (next as { ide?: Ide }).ide = ide;
    }
    this.props = next;
  }

  changePaymentTerms(days: number, clock: Clock): void {
    if (days < 0 || days > 365) {
      throw new DomainError(
        'invalid_payment_term',
        `paymentTermDays doit être 0..365, reçu ${String(days)}`,
      );
    }
    this.props = { ...this.props, paymentTermDays: days, updatedAt: clock.now() };
  }

  changeCreditLimit(limit: Money | undefined, clock: Clock): void {
    const next: ClientProps = { ...this.props, updatedAt: clock.now() };
    if (limit === undefined) {
      delete (next as { creditLimit?: Money }).creditLimit;
    } else {
      (next as { creditLimit?: Money }).creditLimit = limit;
    }
    this.props = next;
  }

  setContacts(contacts: readonly ClientContact[], clock: Clock): void {
    this.props = { ...this.props, contacts, updatedAt: clock.now() };
  }

  archive(clock: Clock): void {
    if (this.props.archivedAt) return;
    const now = clock.now();
    this.props = { ...this.props, archivedAt: now, updatedAt: now };
  }

  toSnapshot(): Readonly<ClientProps> {
    return Object.freeze({ ...this.props });
  }
}

export class ClientNotFound extends DomainError {
  constructor(id: string) {
    super('client_not_found', `Client ${id} introuvable dans le tenant courant`);
  }
}

export class DuplicateClientIde extends DomainError {
  constructor(ide: string) {
    super('duplicate_client_ide', `Un client avec l'IDE ${ide} existe déjà dans cette agence`);
  }
}
