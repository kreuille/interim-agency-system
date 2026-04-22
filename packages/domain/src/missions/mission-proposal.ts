import type { Clock } from '@interim/shared';
import type { AgencyId, StaffId } from '../shared/ids.js';
import type { ClientId } from '../clients/client.js';
import { DomainError } from '../workers/errors.js';

export type MissionProposalId = string & { readonly __brand: 'MissionProposalId' };

export function asMissionProposalId(value: string): MissionProposalId {
  if (value.length === 0) throw new Error('MissionProposalId cannot be empty');
  return value as MissionProposalId;
}

/**
 * États de la machine à états `MissionProposal`.
 *
 * - `proposed`           : initialement reçu via webhook MP, en attente de
 *                          décision (routing mode encore non statué).
 * - `pass_through_sent`  : en mode pass-through, la proposition a été
 *                          transmise directement à l'intérimaire (SMS/push)
 *                          et on attend sa réponse.
 * - `agency_review`      : en mode agency-controlled, l'agence évalue
 *                          (vérif disponibilité + permis + CCT) avant
 *                          d'accepter.
 * - `accepted`           : intérimaire ou agence a accepté → un
 *                          `MissionContract` peut être créé (A4.1).
 * - `refused`            : refus explicite (intérimaire ou agence).
 * - `timeout`            : intérimaire n'a pas répondu dans le délai.
 * - `expired`            : la mission elle-même est expirée côté MP.
 *
 * Transitions (matrice) :
 *   proposed → pass_through_sent | agency_review | refused | expired
 *   pass_through_sent → accepted | refused | timeout | expired
 *   agency_review → accepted | refused | expired
 *   (états terminaux : accepted, refused, timeout, expired)
 */
export const PROPOSAL_STATES = [
  'proposed',
  'pass_through_sent',
  'agency_review',
  'accepted',
  'refused',
  'timeout',
  'expired',
] as const;

export type ProposalState = (typeof PROPOSAL_STATES)[number];

export const PROPOSAL_ROUTING_MODES = ['pass_through', 'agency_controlled'] as const;
export type ProposalRoutingMode = (typeof PROPOSAL_ROUTING_MODES)[number];

const TERMINAL: ReadonlySet<ProposalState> = new Set(['accepted', 'refused', 'timeout', 'expired']);

const TRANSITIONS: ReadonlyMap<ProposalState, ReadonlySet<ProposalState>> = new Map([
  [
    'proposed',
    new Set<ProposalState>(['pass_through_sent', 'agency_review', 'refused', 'expired']),
  ],
  ['pass_through_sent', new Set<ProposalState>(['accepted', 'refused', 'timeout', 'expired'])],
  ['agency_review', new Set<ProposalState>(['accepted', 'refused', 'expired'])],
  ['accepted', new Set<ProposalState>()],
  ['refused', new Set<ProposalState>()],
  ['timeout', new Set<ProposalState>()],
  ['expired', new Set<ProposalState>()],
]);

export class InvalidProposalTransition extends DomainError {
  constructor(from: ProposalState, to: ProposalState) {
    super('invalid_proposal_transition', `Transition interdite : ${from} → ${to}`);
  }
}

export class ProposalAlreadyTerminal extends DomainError {
  constructor(state: ProposalState) {
    super(
      'proposal_already_terminal',
      `Impossible de modifier une proposition dans l'état terminal "${state}"`,
    );
  }
}

export interface MissionSnapshot {
  readonly title: string;
  readonly clientName: string;
  readonly siteAddress: string;
  readonly canton: string;
  readonly cctReference?: string;
  readonly hourlyRateRappen: number;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly skillsRequired: readonly string[];
  /** Champs additionnels MP non normalisés. */
  readonly raw?: Record<string, unknown>;
}

export interface MissionProposalProps {
  readonly id: MissionProposalId;
  readonly agencyId: AgencyId;
  readonly externalRequestId: string;
  readonly workerId: StaffId | undefined;
  readonly clientId: ClientId | undefined;
  readonly state: ProposalState;
  readonly routingMode: ProposalRoutingMode | undefined;
  readonly missionSnapshot: MissionSnapshot;
  readonly proposedAt: Date;
  readonly responseDeadline: Date | undefined;
  readonly stateChangedAt: Date;
  readonly responseReason: string | undefined;
  readonly acceptedAt: Date | undefined;
  readonly refusedAt: Date | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateProposalInput {
  readonly id: MissionProposalId;
  readonly agencyId: AgencyId;
  readonly externalRequestId: string;
  readonly workerId?: StaffId;
  readonly clientId?: ClientId;
  readonly missionSnapshot: MissionSnapshot;
  readonly proposedAt: Date;
  readonly responseDeadline?: Date;
  readonly clock: Clock;
}

/**
 * Aggregat racine `MissionProposal`. Immuable côté snapshot ; chaque
 * transition produit un nouveau set de props.
 *
 * Utilisation typique :
 *   const proposal = MissionProposal.create({...});
 *   proposal.assignRoutingMode('agency_controlled', clock);
 *   proposal.transitionTo('agency_review', { reason: 'pending evaluation' }, clock);
 *   ...
 */
export class MissionProposal {
  private constructor(private props: MissionProposalProps) {}

  static create(input: CreateProposalInput): MissionProposal {
    if (input.missionSnapshot.endsAt.getTime() <= input.missionSnapshot.startsAt.getTime()) {
      throw new DomainError('invalid_mission_window', 'endsAt doit être après startsAt');
    }
    if (input.missionSnapshot.hourlyRateRappen <= 0) {
      throw new DomainError('invalid_rate', 'hourlyRateRappen doit être > 0');
    }
    const now = input.clock.now();
    return new MissionProposal({
      id: input.id,
      agencyId: input.agencyId,
      externalRequestId: input.externalRequestId,
      workerId: input.workerId,
      clientId: input.clientId,
      state: 'proposed',
      routingMode: undefined,
      missionSnapshot: input.missionSnapshot,
      proposedAt: input.proposedAt,
      responseDeadline: input.responseDeadline,
      stateChangedAt: now,
      responseReason: undefined,
      acceptedAt: undefined,
      refusedAt: undefined,
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(props: MissionProposalProps): MissionProposal {
    return new MissionProposal(props);
  }

  assignRoutingMode(mode: ProposalRoutingMode, clock: Clock): void {
    if (this.props.routingMode !== undefined) {
      throw new DomainError(
        'routing_mode_already_set',
        `Routing mode déjà défini (${this.props.routingMode})`,
      );
    }
    if (TERMINAL.has(this.props.state)) {
      throw new ProposalAlreadyTerminal(this.props.state);
    }
    this.props = {
      ...this.props,
      routingMode: mode,
      updatedAt: clock.now(),
    };
  }

  transitionTo(next: ProposalState, input: { readonly reason?: string }, clock: Clock): void {
    if (TERMINAL.has(this.props.state)) {
      throw new ProposalAlreadyTerminal(this.props.state);
    }
    const allowed = TRANSITIONS.get(this.props.state);
    if (!allowed?.has(next)) {
      throw new InvalidProposalTransition(this.props.state, next);
    }
    const now = clock.now();
    this.props = {
      ...this.props,
      state: next,
      stateChangedAt: now,
      updatedAt: now,
      ...(input.reason !== undefined ? { responseReason: input.reason } : {}),
      ...(next === 'accepted' ? { acceptedAt: now } : {}),
      ...(next === 'refused' ? { refusedAt: now } : {}),
    };
  }

  /**
   * Marque expired automatiquement si `responseDeadline` est passée.
   * Renvoie true si la transition a eu lieu. Ne throw pas si la
   * proposition est déjà terminale (idempotent côté worker cron).
   */
  expireIfDue(clock: Clock): boolean {
    if (TERMINAL.has(this.props.state)) return false;
    if (!this.props.responseDeadline) return false;
    if (clock.now().getTime() < this.props.responseDeadline.getTime()) return false;
    const now = clock.now();
    this.props = {
      ...this.props,
      state: 'timeout',
      stateChangedAt: now,
      updatedAt: now,
    };
    return true;
  }

  toSnapshot(): Readonly<MissionProposalProps> {
    return Object.freeze({ ...this.props });
  }

  get id(): MissionProposalId {
    return this.props.id;
  }
  get agencyId(): AgencyId {
    return this.props.agencyId;
  }
  get state(): ProposalState {
    return this.props.state;
  }
  get isTerminal(): boolean {
    return TERMINAL.has(this.props.state);
  }
}
