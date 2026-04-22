import {
  type AgencyId,
  type MissionProposal,
  type MissionProposalId,
  type MissionProposalPage,
  type MissionProposalRepository,
  type ListProposalsQuery,
} from '@interim/domain';

export class InMemoryMissionProposalRepository implements MissionProposalRepository {
  private readonly byId = new Map<string, MissionProposal>();

  save(proposal: MissionProposal): Promise<void> {
    this.byId.set(proposal.id, proposal);
    return Promise.resolve();
  }

  findById(agencyId: AgencyId, id: MissionProposalId): Promise<MissionProposal | undefined> {
    const p = this.byId.get(id);
    if (!p) return Promise.resolve(undefined);
    if (p.agencyId !== agencyId) return Promise.resolve(undefined);
    return Promise.resolve(p);
  }

  findByExternalRequestId(
    agencyId: AgencyId,
    externalRequestId: string,
  ): Promise<MissionProposal | undefined> {
    for (const p of this.byId.values()) {
      if (p.agencyId === agencyId && p.toSnapshot().externalRequestId === externalRequestId) {
        return Promise.resolve(p);
      }
    }
    return Promise.resolve(undefined);
  }

  list(query: ListProposalsQuery): Promise<MissionProposalPage> {
    let items = [...this.byId.values()].filter((p) => p.agencyId === query.agencyId);
    if (query.state !== undefined) {
      items = items.filter((p) => p.state === query.state);
    }
    items = items.sort((a, b) =>
      a.toSnapshot().proposedAt.getTime() < b.toSnapshot().proposedAt.getTime() ? 1 : -1,
    );
    const limit = query.limit ?? 50;
    const sliced = items.slice(0, limit);
    return Promise.resolve({
      items: sliced,
      nextCursor: items.length > limit ? sliced[sliced.length - 1]?.id : undefined,
    });
  }

  size(): number {
    return this.byId.size;
  }
}
