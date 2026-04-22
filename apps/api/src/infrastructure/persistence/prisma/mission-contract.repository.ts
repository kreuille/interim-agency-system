import type { Prisma, PrismaClient } from '@prisma/client';
import {
  asAgencyId,
  asMissionContractId,
  asStaffId,
  MissionContract,
  type AgencyId,
  type ContractLegalSnapshot,
  type ContractState,
  type MissionContractId,
  type MissionContractProps,
  type MissionContractRepository,
} from '@interim/domain';
import { asClientId } from '@interim/domain';

/**
 * Adapter Postgres pour `mission_contracts`. Le snapshot légal et les
 * timestamps sont sérialisés en JSONB \`metadata\`. Le statut est mappé
 * 1:1 avec l'enum Prisma `MissionContractStatus`.
 */
export class PrismaMissionContractRepository implements MissionContractRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(contract: MissionContract): Promise<void> {
    const snap = contract.toSnapshot();
    const metadata = serializeMetadata(snap);
    await this.prisma.missionContract.upsert({
      where: { id: snap.id },
      create: {
        id: snap.id,
        agencyId: snap.agencyId,
        workerId: snap.workerId,
        proposalId: snap.proposalId,
        branch: snap.branch,
        reference: snap.reference,
        status: STATE_TO_PRISMA[snap.state],
        signedAt: snap.signedAt ?? null,
        signedPdfKey: snap.signedPdfKey ?? null,
        zertesEnvelopeId: snap.zertesEnvelopeId ?? null,
        metadata,
        createdAt: snap.createdAt,
      },
      update: {
        status: STATE_TO_PRISMA[snap.state],
        signedAt: snap.signedAt ?? null,
        signedPdfKey: snap.signedPdfKey ?? null,
        zertesEnvelopeId: snap.zertesEnvelopeId ?? null,
        metadata,
      },
    });
  }

  async findById(agencyId: AgencyId, id: MissionContractId): Promise<MissionContract | undefined> {
    const row = await this.prisma.missionContract.findFirst({ where: { id, agencyId } });
    return row ? toDomain(row) : undefined;
  }

  async findByProposalId(
    agencyId: AgencyId,
    proposalId: string,
  ): Promise<MissionContract | undefined> {
    const row = await this.prisma.missionContract.findFirst({
      where: { agencyId, proposalId },
    });
    return row ? toDomain(row) : undefined;
  }

  async findByReference(
    agencyId: AgencyId,
    reference: string,
  ): Promise<MissionContract | undefined> {
    const row = await this.prisma.missionContract.findUnique({
      where: { agencyId_reference: { agencyId, reference } },
    });
    return row ? toDomain(row) : undefined;
  }
}

interface RawRow {
  readonly id: string;
  readonly agencyId: string;
  readonly workerId: string;
  readonly proposalId: string;
  readonly branch: string;
  readonly reference: string;
  readonly status: string;
  readonly signedAt: Date | null;
  readonly signedPdfKey: string | null;
  readonly zertesEnvelopeId: string | null;
  readonly metadata: unknown;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

interface SerializedMetadata {
  readonly clientId?: string;
  readonly legal: SerializedLegal;
  readonly stateChangedAt: string;
  readonly sentForSignatureAt?: string;
  readonly cancelledAt?: string;
  readonly cancelReason?: string;
}

interface SerializedLegal {
  readonly agencyName: string;
  readonly agencyIde: string;
  readonly agencyLseAuthorization: string;
  readonly agencyLseExpiresAt: string;
  readonly clientName: string;
  readonly clientIde: string;
  readonly workerFirstName: string;
  readonly workerLastName: string;
  readonly workerAvs: string;
  readonly missionTitle: string;
  readonly siteAddress: string;
  readonly canton: string;
  readonly cctReference: string; // requis
  readonly hourlyRateRappen: number;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly weeklyHours: number;
}

function serializeMetadata(snap: MissionContractProps): Prisma.InputJsonValue {
  const out: SerializedMetadata = {
    ...(snap.clientId !== undefined ? { clientId: snap.clientId } : {}),
    legal: {
      agencyName: snap.legal.agencyName,
      agencyIde: snap.legal.agencyIde,
      agencyLseAuthorization: snap.legal.agencyLseAuthorization,
      agencyLseExpiresAt: snap.legal.agencyLseExpiresAt.toISOString(),
      clientName: snap.legal.clientName,
      clientIde: snap.legal.clientIde,
      workerFirstName: snap.legal.workerFirstName,
      workerLastName: snap.legal.workerLastName,
      workerAvs: snap.legal.workerAvs,
      missionTitle: snap.legal.missionTitle,
      siteAddress: snap.legal.siteAddress,
      canton: snap.legal.canton,
      cctReference: snap.legal.cctReference,
      hourlyRateRappen: snap.legal.hourlyRateRappen,
      startsAt: snap.legal.startsAt.toISOString(),
      endsAt: snap.legal.endsAt.toISOString(),
      weeklyHours: snap.legal.weeklyHours,
    },
    stateChangedAt: snap.stateChangedAt.toISOString(),
    ...(snap.sentForSignatureAt !== undefined
      ? { sentForSignatureAt: snap.sentForSignatureAt.toISOString() }
      : {}),
    ...(snap.cancelledAt !== undefined ? { cancelledAt: snap.cancelledAt.toISOString() } : {}),
    ...(snap.cancelReason !== undefined ? { cancelReason: snap.cancelReason } : {}),
  };
  return out as unknown as Prisma.InputJsonValue;
}

function deserializeMetadata(meta: unknown): SerializedMetadata {
  return meta as SerializedMetadata;
}

function legalFromMeta(legal: SerializedLegal): ContractLegalSnapshot {
  return {
    agencyName: legal.agencyName,
    agencyIde: legal.agencyIde,
    agencyLseAuthorization: legal.agencyLseAuthorization,
    agencyLseExpiresAt: new Date(legal.agencyLseExpiresAt),
    clientName: legal.clientName,
    clientIde: legal.clientIde,
    workerFirstName: legal.workerFirstName,
    workerLastName: legal.workerLastName,
    workerAvs: legal.workerAvs,
    missionTitle: legal.missionTitle,
    siteAddress: legal.siteAddress,
    canton: legal.canton,
    cctReference: legal.cctReference,
    hourlyRateRappen: legal.hourlyRateRappen,
    startsAt: new Date(legal.startsAt),
    endsAt: new Date(legal.endsAt),
    weeklyHours: legal.weeklyHours,
  };
}

function toDomain(row: RawRow): MissionContract {
  const meta = deserializeMetadata(row.metadata);
  const props: MissionContractProps = {
    id: asMissionContractId(row.id),
    agencyId: asAgencyId(row.agencyId),
    workerId: asStaffId(row.workerId),
    clientId: meta.clientId !== undefined ? asClientId(meta.clientId) : undefined,
    proposalId: row.proposalId,
    reference: row.reference,
    branch: row.branch,
    state: STATE_FROM_PRISMA[row.status] ?? 'draft',
    legal: legalFromMeta(meta.legal),
    stateChangedAt: new Date(meta.stateChangedAt),
    sentForSignatureAt:
      meta.sentForSignatureAt !== undefined ? new Date(meta.sentForSignatureAt) : undefined,
    signedAt: row.signedAt ?? undefined,
    cancelledAt: meta.cancelledAt !== undefined ? new Date(meta.cancelledAt) : undefined,
    cancelReason: meta.cancelReason,
    signedPdfKey: row.signedPdfKey ?? undefined,
    zertesEnvelopeId: row.zertesEnvelopeId ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  return MissionContract.rehydrate(props);
}

const STATE_TO_PRISMA: Record<
  ContractState,
  'DRAFT' | 'SENT_FOR_SIGNATURE' | 'SIGNED' | 'CANCELLED'
> = {
  draft: 'DRAFT',
  sent_for_signature: 'SENT_FOR_SIGNATURE',
  signed: 'SIGNED',
  cancelled: 'CANCELLED',
};

const STATE_FROM_PRISMA: Record<string, ContractState> = {
  DRAFT: 'draft',
  SENT_FOR_SIGNATURE: 'sent_for_signature',
  SIGNED: 'signed',
  CANCELLED: 'cancelled',
};
