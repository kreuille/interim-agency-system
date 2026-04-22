import {
  type AgencyId,
  type MissionProposal,
  type MissionProposalId,
  type MissionProposalPage,
  type MissionProposalRepository,
  type ListProposalsQuery,
} from '@interim/domain';
import type { Result } from '@interim/shared';
import { ProposalMpError, type ProposalMpResponsePort } from './proposal-mp-port.js';

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

/**
 * Port MP scriptable : produit pour chaque appel le résultat
 * pré-programmé. Permet de tester les cas ok / transient / permanent.
 */
export class ScriptedProposalMpResponsePort implements ProposalMpResponsePort {
  readonly acceptCalls: { externalRequestId: string; idempotencyKey: string }[] = [];
  readonly refuseCalls: {
    externalRequestId: string;
    idempotencyKey: string;
    reason: string;
  }[] = [];

  constructor(
    private readonly outcomes: readonly (
      | { kind: 'ok' }
      | { kind: 'transient' }
      | { kind: 'permanent' }
    )[] = [{ kind: 'ok' }],
    private callCount = 0,
  ) {}

  notifyAccepted(input: {
    externalRequestId: string;
    idempotencyKey: string;
    notes?: string;
  }): Promise<Result<{ recorded: true }, ProposalMpError>> {
    this.acceptCalls.push({
      externalRequestId: input.externalRequestId,
      idempotencyKey: input.idempotencyKey,
    });
    return Promise.resolve(this.consumeOutcome());
  }

  notifyRefused(input: {
    externalRequestId: string;
    idempotencyKey: string;
    reason: string;
  }): Promise<Result<{ recorded: true }, ProposalMpError>> {
    this.refuseCalls.push({
      externalRequestId: input.externalRequestId,
      idempotencyKey: input.idempotencyKey,
      reason: input.reason,
    });
    return Promise.resolve(this.consumeOutcome());
  }

  private consumeOutcome(): Result<{ recorded: true }, ProposalMpError> {
    const outcome = this.outcomes[Math.min(this.callCount, this.outcomes.length - 1)];
    this.callCount += 1;
    if (!outcome || outcome.kind === 'ok') {
      return { ok: true, value: { recorded: true } };
    }
    return {
      ok: false,
      error: new ProposalMpError(outcome.kind, `${outcome.kind}_mp_error`),
    };
  }
}
