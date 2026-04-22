import type { Prisma, PrismaClient } from '@prisma/client';
import {
  asAgencyId,
  asMissionProposalId,
  asStaffId,
  MissionProposal,
  type ListProposalsQuery,
  type MissionProposalId,
  type MissionProposalPage,
  type MissionProposalProps,
  type MissionProposalRepository,
  type MissionSnapshot,
  type ProposalRoutingMode,
  type ProposalState,
} from '@interim/domain';
import { asClientId, type AgencyId } from '@interim/domain';

/**
 * Adapter Postgres pour `mission_proposals`.
 *
 * Mapping enum domaine ↔ Prisma :
 *   proposed         ↔ PROPOSED
 *   pass_through_sent ↔ PASS_THROUGH_SENT
 *   agency_review    ↔ AGENCY_REVIEW
 *   accepted         ↔ ACCEPTED
 *   refused          ↔ REFUSED
 *   timeout          ↔ TIMEOUT
 *   expired          ↔ EXPIRED
 *
 * `missionSnapshot` est sérialisé en JSONB (slots du modèle Prisma
 * stockent `rawPayload`, mais on remplace pour avoir le snapshot
 * normalisé exposé au domaine).
 */
export class PrismaMissionProposalRepository implements MissionProposalRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(proposal: MissionProposal): Promise<void> {
    const snap = proposal.toSnapshot();
    await this.prisma.missionProposal.upsert({
      where: { id: snap.id },
      create: {
        id: snap.id,
        agencyId: snap.agencyId,
        externalRequestId: snap.externalRequestId,
        ...(snap.workerId !== undefined ? { workerId: snap.workerId } : {}),
        ...(snap.clientId !== undefined ? { clientId: snap.clientId } : {}),
        status: STATE_TO_PRISMA[snap.state],
        // routingMode est NOT NULL en base ; on défaut à PASS_THROUGH si undefined
        // (l'aggregat le définira à la prochaine sauvegarde via assignRoutingMode).
        routingMode:
          snap.routingMode !== undefined ? ROUTING_TO_PRISMA[snap.routingMode] : 'PASS_THROUGH',
        proposedAt: snap.proposedAt,
        responseDeadline: snap.responseDeadline ?? null,
        acceptedAt: snap.acceptedAt ?? null,
        refusedAt: snap.refusedAt ?? null,
        rawPayload: serializeSnapshot(snap.missionSnapshot, snap),
        createdAt: snap.createdAt,
      },
      update: {
        ...(snap.workerId !== undefined ? { workerId: snap.workerId } : {}),
        ...(snap.clientId !== undefined ? { clientId: snap.clientId } : {}),
        status: STATE_TO_PRISMA[snap.state],
        routingMode:
          snap.routingMode !== undefined ? ROUTING_TO_PRISMA[snap.routingMode] : 'PASS_THROUGH',
        responseDeadline: snap.responseDeadline ?? null,
        acceptedAt: snap.acceptedAt ?? null,
        refusedAt: snap.refusedAt ?? null,
        rawPayload: serializeSnapshot(snap.missionSnapshot, snap),
      },
    });
  }

  async findById(agencyId: AgencyId, id: MissionProposalId): Promise<MissionProposal | undefined> {
    const row = await this.prisma.missionProposal.findFirst({ where: { id, agencyId } });
    return row ? toDomain(row) : undefined;
  }

  async findByExternalRequestId(
    agencyId: AgencyId,
    externalRequestId: string,
  ): Promise<MissionProposal | undefined> {
    const row = await this.prisma.missionProposal.findFirst({
      where: { agencyId, externalRequestId },
    });
    return row ? toDomain(row) : undefined;
  }

  async list(query: ListProposalsQuery): Promise<MissionProposalPage> {
    const limit = query.limit ?? 50;
    const where: Prisma.MissionProposalWhereInput = { agencyId: query.agencyId };
    if (query.state !== undefined) {
      where.status = STATE_TO_PRISMA[query.state as ProposalState];
    }
    const rows = await this.prisma.missionProposal.findMany({
      where,
      orderBy: { proposedAt: 'desc' },
      take: limit + 1,
      ...(query.cursor !== undefined ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map(toDomain);
    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id : undefined,
    };
  }
}

interface RawRow {
  readonly id: string;
  readonly agencyId: string;
  readonly externalRequestId: string;
  readonly workerId: string | null;
  readonly clientId: string | null;
  readonly status: string;
  readonly routingMode: string;
  readonly proposedAt: Date;
  readonly responseDeadline: Date | null;
  readonly acceptedAt: Date | null;
  readonly refusedAt: Date | null;
  readonly rawPayload: unknown;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

interface SerializedRaw {
  readonly missionSnapshot: SerializedSnapshot;
  readonly stateChangedAt: string;
  readonly responseReason?: string;
}

interface SerializedSnapshot {
  readonly title: string;
  readonly clientName: string;
  readonly siteAddress: string;
  readonly canton: string;
  readonly cctReference?: string;
  readonly hourlyRateRappen: number;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly skillsRequired: readonly string[];
  readonly raw?: Record<string, unknown>;
}

function serializeSnapshot(
  snapshot: MissionSnapshot,
  props: MissionProposalProps,
): Prisma.InputJsonValue {
  const out: SerializedRaw = {
    missionSnapshot: {
      title: snapshot.title,
      clientName: snapshot.clientName,
      siteAddress: snapshot.siteAddress,
      canton: snapshot.canton,
      ...(snapshot.cctReference !== undefined ? { cctReference: snapshot.cctReference } : {}),
      hourlyRateRappen: snapshot.hourlyRateRappen,
      startsAt: snapshot.startsAt.toISOString(),
      endsAt: snapshot.endsAt.toISOString(),
      skillsRequired: snapshot.skillsRequired,
      ...(snapshot.raw !== undefined ? { raw: snapshot.raw } : {}),
    },
    stateChangedAt: props.stateChangedAt.toISOString(),
    ...(props.responseReason !== undefined ? { responseReason: props.responseReason } : {}),
  };
  return out as unknown as Prisma.InputJsonValue;
}

function deserializeSnapshot(payload: unknown): {
  snapshot: MissionSnapshot;
  stateChangedAt: Date;
  responseReason: string | undefined;
} {
  const raw = payload as SerializedRaw;
  const s = raw.missionSnapshot;
  return {
    snapshot: {
      title: s.title,
      clientName: s.clientName,
      siteAddress: s.siteAddress,
      canton: s.canton,
      ...(s.cctReference !== undefined ? { cctReference: s.cctReference } : {}),
      hourlyRateRappen: s.hourlyRateRappen,
      startsAt: new Date(s.startsAt),
      endsAt: new Date(s.endsAt),
      skillsRequired: s.skillsRequired,
      ...(s.raw !== undefined ? { raw: s.raw } : {}),
    },
    stateChangedAt: new Date(raw.stateChangedAt),
    responseReason: raw.responseReason,
  };
}

function toDomain(row: RawRow): MissionProposal {
  const { snapshot, stateChangedAt, responseReason } = deserializeSnapshot(row.rawPayload);
  const props: MissionProposalProps = {
    id: asMissionProposalId(row.id),
    agencyId: asAgencyId(row.agencyId),
    externalRequestId: row.externalRequestId,
    workerId: row.workerId !== null ? asStaffId(row.workerId) : undefined,
    clientId: row.clientId !== null ? asClientId(row.clientId) : undefined,
    state: STATE_FROM_PRISMA[row.status] ?? 'proposed',
    routingMode: ROUTING_FROM_PRISMA[row.routingMode],
    missionSnapshot: snapshot,
    proposedAt: row.proposedAt,
    responseDeadline: row.responseDeadline ?? undefined,
    stateChangedAt,
    responseReason,
    acceptedAt: row.acceptedAt ?? undefined,
    refusedAt: row.refusedAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  return MissionProposal.rehydrate(props);
}

const STATE_TO_PRISMA: Record<
  ProposalState,
  | 'PROPOSED'
  | 'PASS_THROUGH_SENT'
  | 'AGENCY_REVIEW'
  | 'ACCEPTED'
  | 'REFUSED'
  | 'TIMEOUT'
  | 'EXPIRED'
> = {
  proposed: 'PROPOSED',
  pass_through_sent: 'PASS_THROUGH_SENT',
  agency_review: 'AGENCY_REVIEW',
  accepted: 'ACCEPTED',
  refused: 'REFUSED',
  timeout: 'TIMEOUT',
  expired: 'EXPIRED',
};

const STATE_FROM_PRISMA: Record<string, ProposalState> = {
  PROPOSED: 'proposed',
  PASS_THROUGH_SENT: 'pass_through_sent',
  AGENCY_REVIEW: 'agency_review',
  ACCEPTED: 'accepted',
  REFUSED: 'refused',
  TIMEOUT: 'timeout',
  EXPIRED: 'expired',
};

const ROUTING_TO_PRISMA: Record<ProposalRoutingMode, 'PASS_THROUGH' | 'AGENCY_CONTROLLED'> = {
  pass_through: 'PASS_THROUGH',
  agency_controlled: 'AGENCY_CONTROLLED',
};

const ROUTING_FROM_PRISMA: Record<string, ProposalRoutingMode | undefined> = {
  PASS_THROUGH: 'pass_through',
  AGENCY_CONTROLLED: 'agency_controlled',
};
