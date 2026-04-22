import type { Clock } from '@interim/shared';
import type { AgencyId, StaffId } from '../shared/ids.js';
import type { ClientId } from '../clients/client.js';
import { DomainError } from '../workers/errors.js';

export type MissionContractId = string & { readonly __brand: 'MissionContractId' };

export function asMissionContractId(value: string): MissionContractId {
  if (value.length === 0) throw new Error('MissionContractId cannot be empty');
  return value as MissionContractId;
}

/**
 * Statuts contrat (alignés enum Prisma `MissionContractStatus`).
 *
 *   draft               : créé, non envoyé en signature.
 *   sent_for_signature  : envoyé via ZertES, attente signatures.
 *   signed              : signé par toutes les parties.
 *   cancelled           : annulé avant signature ou résolu.
 *
 * Note : le prompt mentionne `terminated` qui n'est pas encore en base
 * (migration future si rupture anticipée nécessite un état distinct).
 */
export const CONTRACT_STATES = ['draft', 'sent_for_signature', 'signed', 'cancelled'] as const;
export type ContractState = (typeof CONTRACT_STATES)[number];

const TERMINAL: ReadonlySet<ContractState> = new Set(['signed', 'cancelled']);

const TRANSITIONS: ReadonlyMap<ContractState, ReadonlySet<ContractState>> = new Map([
  ['draft', new Set<ContractState>(['sent_for_signature', 'cancelled'])],
  ['sent_for_signature', new Set<ContractState>(['signed', 'cancelled'])],
  ['signed', new Set<ContractState>()],
  ['cancelled', new Set<ContractState>()],
]);

export class InvalidContractTransition extends DomainError {
  constructor(from: ContractState, to: ContractState) {
    super('invalid_contract_transition', `Transition contrat interdite : ${from} → ${to}`);
  }
}

export class ContractAlreadyTerminal extends DomainError {
  constructor(state: ContractState) {
    super(
      'contract_already_terminal',
      `Impossible de modifier un contrat dans l'état terminal "${state}"`,
    );
  }
}

/**
 * Snapshot des champs légaux LSE obligatoires (cf.
 * `skills/compliance/lse-authorization/SKILL.md`).
 *
 * Inclut le numéro d'autorisation LSE de l'agence (visible sur tous les
 * contrats de mission) et les détails de la mission gelés au moment de
 * la création (toute modification ultérieure → nouveau contrat).
 */
export interface ContractLegalSnapshot {
  // Identité agence
  readonly agencyName: string;
  readonly agencyIde: string; // CHE-XXX.XXX.XXX
  readonly agencyLseAuthorization: string; // Format cantonal
  readonly agencyLseExpiresAt: Date;
  // Identité client (entreprise utilisatrice)
  readonly clientName: string;
  readonly clientIde: string;
  // Identité worker (intérimaire)
  readonly workerFirstName: string;
  readonly workerLastName: string;
  readonly workerAvs: string; // 756.XXXX.XXXX.XX
  // Mission
  readonly missionTitle: string;
  readonly siteAddress: string;
  readonly canton: string; // 2-letter
  readonly cctReference: string; // Ex. "CCT Construction"
  readonly hourlyRateRappen: number; // Strict > 0, déjà ≥ CCT min
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly weeklyHours: number; // Heures hebdo prévues
}

export interface MissionContractProps {
  readonly id: MissionContractId;
  readonly agencyId: AgencyId;
  readonly workerId: StaffId;
  readonly clientId: ClientId | undefined;
  readonly proposalId: string;
  readonly reference: string; // Ex. "MC-2026-04-0001"
  readonly branch: string; // Branche CCT (snapshot pour audit)
  readonly state: ContractState;
  readonly legal: ContractLegalSnapshot;
  readonly stateChangedAt: Date;
  readonly sentForSignatureAt: Date | undefined;
  readonly signedAt: Date | undefined;
  readonly cancelledAt: Date | undefined;
  readonly cancelReason: string | undefined;
  readonly signedPdfKey: string | undefined;
  readonly zertesEnvelopeId: string | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateContractInput {
  readonly id: MissionContractId;
  readonly agencyId: AgencyId;
  readonly workerId: StaffId;
  readonly clientId?: ClientId;
  readonly proposalId: string;
  readonly reference: string;
  readonly branch: string;
  readonly legal: ContractLegalSnapshot;
  readonly clock: Clock;
}

/**
 * Aggregat racine `MissionContract`. Validation pré-création des
 * invariants légaux (LSE, permis worker, CCT, LTr) faite par le use case
 * `GenerateMissionContractUseCase` AVANT d'appeler `create`.
 *
 * `create` ne valide que les invariants intrinsèques (dates, taux > 0,
 * weeklyHours > 0). Les invariants externes (LSE active, etc.) restent
 * la responsabilité du use case qui a accès aux ports nécessaires.
 */
export class MissionContract {
  private constructor(private props: MissionContractProps) {}

  static create(input: CreateContractInput): MissionContract {
    if (input.legal.endsAt.getTime() <= input.legal.startsAt.getTime()) {
      throw new DomainError('invalid_contract_window', 'endsAt doit être après startsAt');
    }
    if (input.legal.hourlyRateRappen <= 0) {
      throw new DomainError('invalid_rate', 'hourlyRateRappen doit être > 0');
    }
    if (input.legal.weeklyHours <= 0 || input.legal.weeklyHours > 50) {
      throw new DomainError(
        'invalid_weekly_hours',
        `weeklyHours doit être > 0 et ≤ 50 (LTr), got ${String(input.legal.weeklyHours)}`,
      );
    }
    if (input.legal.agencyLseExpiresAt.getTime() <= input.legal.endsAt.getTime()) {
      throw new DomainError(
        'lse_authorization_expires_before_mission_end',
        "L'autorisation LSE de l'agence expire avant la fin de mission",
      );
    }
    const now = input.clock.now();
    return new MissionContract({
      id: input.id,
      agencyId: input.agencyId,
      workerId: input.workerId,
      clientId: input.clientId,
      proposalId: input.proposalId,
      reference: input.reference,
      branch: input.branch,
      state: 'draft',
      legal: input.legal,
      stateChangedAt: now,
      sentForSignatureAt: undefined,
      signedAt: undefined,
      cancelledAt: undefined,
      cancelReason: undefined,
      signedPdfKey: undefined,
      zertesEnvelopeId: undefined,
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(props: MissionContractProps): MissionContract {
    return new MissionContract(props);
  }

  sendForSignature(zertesEnvelopeId: string, clock: Clock): void {
    this.transition('sent_for_signature', clock);
    this.props = {
      ...this.props,
      sentForSignatureAt: clock.now(),
      zertesEnvelopeId,
    };
  }

  markSigned(input: { signedPdfKey: string }, clock: Clock): void {
    this.transition('signed', clock);
    const now = clock.now();
    this.props = {
      ...this.props,
      signedAt: now,
      signedPdfKey: input.signedPdfKey,
    };
  }

  cancel(reason: string, clock: Clock): void {
    if (TERMINAL.has(this.props.state)) {
      throw new ContractAlreadyTerminal(this.props.state);
    }
    this.transition('cancelled', clock);
    this.props = {
      ...this.props,
      cancelledAt: clock.now(),
      cancelReason: reason,
    };
  }

  private transition(next: ContractState, clock: Clock): void {
    if (TERMINAL.has(this.props.state)) {
      throw new ContractAlreadyTerminal(this.props.state);
    }
    const allowed = TRANSITIONS.get(this.props.state);
    if (!allowed?.has(next)) {
      throw new InvalidContractTransition(this.props.state, next);
    }
    const now = clock.now();
    this.props = {
      ...this.props,
      state: next,
      stateChangedAt: now,
      updatedAt: now,
    };
  }

  toSnapshot(): Readonly<MissionContractProps> {
    return Object.freeze({ ...this.props });
  }

  get id(): MissionContractId {
    return this.props.id;
  }
  get agencyId(): AgencyId {
    return this.props.agencyId;
  }
  get state(): ContractState {
    return this.props.state;
  }
  get reference(): string {
    return this.props.reference;
  }
  get isTerminal(): boolean {
    return TERMINAL.has(this.props.state);
  }
}
