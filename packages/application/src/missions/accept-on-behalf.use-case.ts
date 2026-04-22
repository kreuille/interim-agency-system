import {
  asMissionProposalId,
  type AgencyId,
  type MissionProposalRepository,
} from '@interim/domain';
import type { Clock, Result } from '@interim/shared';
import type { ProposalMpError, ProposalMpResponsePort } from './proposal-mp-port.js';
import { ProposalNotFound } from './assign-routing-mode.use-case.js';

export interface AcceptOnBehalfInput {
  readonly agencyId: AgencyId;
  readonly proposalId: string;
  readonly idempotencyKey: string;
  readonly notes?: string;
}

export type AcceptOnBehalfError = ProposalNotFound | ProposalMpError;

/**
 * Use case agence : accepter une proposition (pour le compte de
 * l'intérimaire ou en mode `agency_controlled`).
 *
 * Ordre :
 *   1. Charge la proposal, vérifie qu'elle peut transitionner vers `accepted`.
 *   2. Notifie MP (idempotent par `idempotencyKey`).
 *   3. Si MP ok → transition + save.
 *   4. Si MP error transient → renvoie l'erreur sans modifier la proposal
 *      (le caller peut retry avec la même idempotencyKey).
 *
 * Le port MP doit être idempotent côté infra (cf. `MpClient`
 * `outbound-idempotency.store`).
 */
export class AcceptOnBehalfUseCase {
  constructor(
    private readonly repo: MissionProposalRepository,
    private readonly mp: ProposalMpResponsePort,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: AcceptOnBehalfInput,
  ): Promise<Result<{ readonly state: string }, AcceptOnBehalfError>> {
    const proposal = await this.repo.findById(
      input.agencyId,
      asMissionProposalId(input.proposalId),
    );
    if (!proposal) return { ok: false, error: new ProposalNotFound(input.proposalId) };

    const mpResult = await this.mp.notifyAccepted({
      externalRequestId: proposal.toSnapshot().externalRequestId,
      idempotencyKey: input.idempotencyKey,
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    });
    if (!mpResult.ok) {
      return { ok: false, error: mpResult.error };
    }

    // MP a accepté → transition locale.
    proposal.transitionTo(
      'accepted',
      input.notes !== undefined ? { reason: input.notes } : {},
      this.clock,
    );
    await this.repo.save(proposal);
    return { ok: true, value: { state: proposal.state } };
  }
}
