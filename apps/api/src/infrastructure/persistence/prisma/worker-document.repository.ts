import type {
  PrismaClient,
  WorkerDocument as PrismaDoc,
  WorkerDocumentType as PrismaDocType,
} from '@prisma/client';
import {
  asAgencyId,
  asStaffId,
  WorkerDocument,
  type AgencyId,
  type DocumentListPage,
  type DocumentRepository,
  type ListDocumentsQuery,
  type WorkerDocumentStatus,
  type WorkerDocumentType,
} from '@interim/domain';

export class PrismaWorkerDocumentRepository implements DocumentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(doc: WorkerDocument): Promise<void> {
    const snap = doc.toSnapshot();
    await this.prisma.workerDocument.upsert({
      where: { id: snap.id },
      create: {
        id: snap.id,
        agencyId: snap.agencyId,
        workerId: snap.workerId,
        type: toPrismaType(snap.type),
        status: toPrismaStatus(snap.status),
        fileKey: snap.fileKey,
        mimeType: snap.mimeType,
        sizeBytes: snap.sizeBytes,
        issuedAt: snap.issuedAt ?? null,
        expiresAt: snap.expiresAt ?? null,
        createdAt: snap.createdAt,
        updatedAt: snap.updatedAt,
        metadata: JSON.parse(JSON.stringify(buildMetadata(snap))) as never,
      },
      update: {
        status: toPrismaStatus(snap.status),
        updatedAt: snap.updatedAt,
        metadata: JSON.parse(JSON.stringify(buildMetadata(snap))) as never,
      },
    });
  }

  async findById(agencyId: AgencyId, id: string): Promise<WorkerDocument | null> {
    const row = await this.prisma.workerDocument.findFirst({ where: { agencyId, id } });
    return row ? rehydrate(row) : null;
  }

  async listByWorker(query: ListDocumentsQuery): Promise<DocumentListPage> {
    const rows = await this.prisma.workerDocument.findMany({
      where: {
        agencyId: query.agencyId,
        workerId: query.workerId,
        ...(query.includeArchived ? {} : { status: { not: 'MISSING' } }),
      },
      orderBy: [{ createdAt: 'desc' }],
      take: query.limit,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const lastRow = rows.length === query.limit ? rows[rows.length - 1] : undefined;
    return {
      items: rows.map(rehydrate),
      ...(lastRow ? { nextCursor: lastRow.id } : {}),
    };
  }
}

function toPrismaType(t: WorkerDocumentType): PrismaDocType {
  switch (t) {
    case 'permit_work':
      return 'WORK_PERMIT';
    case 'permit_driving':
      return 'OTHER';
    case 'avs_card':
      return 'AVS_CARD';
    case 'lamal_cert':
      return 'LAMAL_ATTESTATION';
    case 'diploma':
      return 'DIPLOMA';
    case 'suva_sst':
    case 'caces':
      return 'CERTIFICATION';
    case 'other':
      return 'OTHER';
  }
}

function fromPrismaType(t: PrismaDocType): WorkerDocumentType {
  switch (t) {
    case 'WORK_PERMIT':
      return 'permit_work';
    case 'AVS_CARD':
      return 'avs_card';
    case 'LAMAL_ATTESTATION':
      return 'lamal_cert';
    case 'DIPLOMA':
      return 'diploma';
    case 'CERTIFICATION':
      return 'suva_sst';
    case 'ID_CARD':
    case 'CV':
    case 'OTHER':
      return 'other';
  }
}

type PrismaStatus = 'VALID' | 'EXPIRING_SOON' | 'EXPIRED' | 'MISSING';

function toPrismaStatus(s: WorkerDocumentStatus): PrismaStatus {
  switch (s) {
    case 'VALID':
      return 'VALID';
    case 'EXPIRED':
      return 'EXPIRED';
    case 'PENDING_SCAN':
    case 'PENDING_VALIDATION':
    case 'REJECTED':
    case 'ARCHIVED':
      return 'MISSING';
  }
}

function fromPrismaStatus(s: PrismaStatus, archived: boolean): WorkerDocumentStatus {
  if (archived) return 'ARCHIVED';
  switch (s) {
    case 'VALID':
      return 'VALID';
    case 'EXPIRED':
      return 'EXPIRED';
    case 'EXPIRING_SOON':
      return 'VALID';
    case 'MISSING':
      return 'PENDING_VALIDATION';
  }
}

interface DocMetadata {
  domainStatus: WorkerDocumentStatus;
  domainType: WorkerDocumentType;
  validatedBy?: string;
  validatedAt?: string;
  rejectionReason?: string;
  archivedAt?: string;
}

function buildMetadata(snap: ReturnType<WorkerDocument['toSnapshot']>): DocMetadata {
  return {
    domainStatus: snap.status,
    domainType: snap.type,
    ...(snap.validatedBy !== undefined ? { validatedBy: snap.validatedBy } : {}),
    ...(snap.validatedAt !== undefined ? { validatedAt: snap.validatedAt.toISOString() } : {}),
    ...(snap.rejectionReason !== undefined ? { rejectionReason: snap.rejectionReason } : {}),
    ...(snap.archivedAt !== undefined ? { archivedAt: snap.archivedAt.toISOString() } : {}),
  };
}

function rehydrate(row: PrismaDoc): WorkerDocument {
  const meta = (row.metadata ?? {}) as Partial<DocMetadata>;
  const archivedAt = meta.archivedAt ? new Date(meta.archivedAt) : undefined;
  const domainStatus: WorkerDocumentStatus =
    meta.domainStatus ?? fromPrismaStatus(row.status, archivedAt !== undefined);
  const domainType: WorkerDocumentType = meta.domainType ?? fromPrismaType(row.type);
  return WorkerDocument.rehydrate({
    id: row.id,
    agencyId: asAgencyId(row.agencyId),
    workerId: asStaffId(row.workerId),
    type: domainType,
    status: domainStatus,
    fileKey: row.fileKey,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    ...(row.issuedAt ? { issuedAt: row.issuedAt } : {}),
    ...(row.expiresAt ? { expiresAt: row.expiresAt } : {}),
    ...(meta.validatedBy ? { validatedBy: meta.validatedBy } : {}),
    ...(meta.validatedAt ? { validatedAt: new Date(meta.validatedAt) } : {}),
    ...(meta.rejectionReason ? { rejectionReason: meta.rejectionReason } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(archivedAt ? { archivedAt } : {}),
  });
}
