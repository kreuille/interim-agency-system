import {
  asMissionProposalId,
  type AgencyId,
  type MissionProposalRepository,
  type ProposalRoutingMode,
} from '@interim/domain';
import type { Clock, Result } from '@interim/shared';

export interface AssignRoutingModeInput {
  readonly agencyId: AgencyId;
  readonly proposalId: string;
  readonly mode: ProposalRoutingMode;
  /** Si pass-through, transition immédiate vers `pass_through_sent`. */
  readonly transitionImmediately?: boolean;
}

export class ProposalNotFound extends Error {
  constructor(id: string) {
    super(`Proposition ${id} introuvable`);
    this.name = 'ProposalNotFound';
  }
}

export class AssignRoutingModeUseCase {
  constructor(
    private readonly repo: MissionProposalRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: AssignRoutingModeInput,
  ): Promise<Result<{ readonly state: string }, ProposalNotFound>> {
    const proposal = await this.repo.findById(
      input.agencyId,
      asMissionProposalId(input.proposalId),
    );
    if (!proposal) return { ok: false, error: new ProposalNotFound(input.proposalId) };

    proposal.assignRoutingMode(input.mode, this.clock);
    if (input.mode === 'pass_through' && input.transitionImmediately !== false) {
      proposal.transitionTo('pass_through_sent', {}, this.clock);
    } else if (input.mode === 'agency_controlled') {
      proposal.transitionTo('agency_review', {}, this.clock);
    }
    await this.repo.save(proposal);
    return { ok: true, value: { state: proposal.state } };
  }
}
