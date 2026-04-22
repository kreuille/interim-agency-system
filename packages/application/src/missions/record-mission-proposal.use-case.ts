import { randomUUID } from 'node:crypto';
import {
  asMissionProposalId,
  MissionProposal,
  type AgencyId,
  type ClientId,
  type MissionProposalRepository,
  type MissionSnapshot,
  type StaffId,
} from '@interim/domain';
import type { Clock, Result } from '@interim/shared';

/**
 * Use case appelé par le webhook handler `worker.assignment.proposed`.
 *
 * Idempotent : si une proposition existe déjà pour le même
 * `(agencyId, externalRequestId)` (rejeu MP), renvoie la proposition
 * existante sans modifier ni recréer. Cela complète la double protection
 * idempotency : niveau webhook (eventId unique) + niveau métier
 * (externalRequestId unique).
 */
export interface RecordMissionProposalInput {
  readonly agencyId: AgencyId;
  readonly externalRequestId: string;
  readonly workerId?: StaffId;
  readonly clientId?: ClientId;
  readonly missionSnapshot: MissionSnapshot;
  readonly proposedAt: Date;
  readonly responseDeadline?: Date;
}

export type RecordMissionProposalResult =
  | { readonly status: 'created'; readonly proposalId: string }
  | { readonly status: 'duplicate'; readonly proposalId: string };

export class RecordMissionProposalUseCase {
  constructor(
    private readonly repo: MissionProposalRepository,
    private readonly clock: Clock,
    private readonly idFactory: () => string = randomUUID,
  ) {}

  async execute(
    input: RecordMissionProposalInput,
  ): Promise<Result<RecordMissionProposalResult, never>> {
    const existing = await this.repo.findByExternalRequestId(
      input.agencyId,
      input.externalRequestId,
    );
    if (existing) {
      return { ok: true, value: { status: 'duplicate', proposalId: existing.id } };
    }
    const proposal = MissionProposal.create({
      id: asMissionProposalId(this.idFactory()),
      agencyId: input.agencyId,
      externalRequestId: input.externalRequestId,
      ...(input.workerId !== undefined ? { workerId: input.workerId } : {}),
      ...(input.clientId !== undefined ? { clientId: input.clientId } : {}),
      missionSnapshot: input.missionSnapshot,
      proposedAt: input.proposedAt,
      ...(input.responseDeadline !== undefined ? { responseDeadline: input.responseDeadline } : {}),
      clock: this.clock,
    });
    await this.repo.save(proposal);
    return { ok: true, value: { status: 'created', proposalId: proposal.id } };
  }
}
