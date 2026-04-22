import {
  asMissionProposalId,
  type AgencyId,
  type MissionProposalRepository,
} from '@interim/domain';
import type { Clock, Result } from '@interim/shared';
import type { ProposalMpError, ProposalMpResponsePort } from './proposal-mp-port.js';
import { ProposalNotFound } from './assign-routing-mode.use-case.js';
import { formatRefusalReason, type RefusalReason } from './refusal-reason.js';

export interface RefuseOnBehalfInput {
  readonly agencyId: AgencyId;
  readonly proposalId: string;
  readonly idempotencyKey: string;
  readonly reason: RefusalReason;
  readonly counterproposal?: { readonly dateFrom: string; readonly dateTo: string };
}

export type RefuseOnBehalfError = ProposalNotFound | ProposalMpError;

/**
 * Pendant `AcceptOnBehalfUseCase` pour les refus.
 *
 * Validation : `reason.kind === 'other'` → `freeform` requis.
 */
export class RefuseOnBehalfUseCase {
  constructor(
    private readonly repo: MissionProposalRepository,
    private readonly mp: ProposalMpResponsePort,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: RefuseOnBehalfInput,
  ): Promise<Result<{ readonly state: string }, RefuseOnBehalfError>> {
    if (
      input.reason.kind === 'other' &&
      (!input.reason.freeform || input.reason.freeform.length === 0)
    ) {
      throw new Error('refusal_reason_freeform_required');
    }
    const proposal = await this.repo.findById(
      input.agencyId,
      asMissionProposalId(input.proposalId),
    );
    if (!proposal) return { ok: false, error: new ProposalNotFound(input.proposalId) };

    const formatted = formatRefusalReason(input.reason);
    const mpResult = await this.mp.notifyRefused({
      externalRequestId: proposal.toSnapshot().externalRequestId,
      idempotencyKey: input.idempotencyKey,
      reason: formatted,
      ...(input.counterproposal !== undefined ? { counterproposal: input.counterproposal } : {}),
    });
    if (!mpResult.ok) {
      return { ok: false, error: mpResult.error };
    }

    proposal.transitionTo('refused', { reason: formatted }, this.clock);
    await this.repo.save(proposal);
    return { ok: true, value: { state: proposal.state } };
  }
}
