import type { AgencyId } from '../shared/ids.js';
import type { MissionProposal, MissionProposalId } from './mission-proposal.js';

export interface MissionProposalRepository {
  save(proposal: MissionProposal): Promise<void>;

  findById(agencyId: AgencyId, id: MissionProposalId): Promise<MissionProposal | undefined>;

  /**
   * Lookup par identifiant externe MP — utilisé pour idempotency
   * (un même `worker.assignment.proposed` rejoué ne doit pas créer
   * deux propositions).
   */
  findByExternalRequestId(
    agencyId: AgencyId,
    externalRequestId: string,
  ): Promise<MissionProposal | undefined>;

  /**
   * Liste paginée pour le dashboard agence (A3.6).
   */
  list(query: ListProposalsQuery): Promise<MissionProposalPage>;
}

export interface ListProposalsQuery {
  readonly agencyId: AgencyId;
  readonly state?: string;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface MissionProposalPage {
  readonly items: readonly MissionProposal[];
  readonly nextCursor: string | undefined;
}
