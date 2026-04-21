import type { PrismaClient, TempWorker as PrismaTempWorker } from '@prisma/client';
import {
  asAgencyId,
  asStaffId,
  TempWorker,
  type AgencyId,
  type ListWorkersQuery,
  type StaffId,
  type WorkerListPage,
  type WorkerRepository,
} from '@interim/domain';
import { Avs, Email, Iban, Name, Phone, parseCanton } from '@interim/shared';

export class PrismaWorkerRepository implements WorkerRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(worker: TempWorker): Promise<void> {
    const snap = worker.toSnapshot();
    await this.prisma.tempWorker.upsert({
      where: { id: snap.id },
      create: {
        id: snap.id,
        agencyId: snap.agencyId,
        firstName: snap.firstName.toString(),
        lastName: snap.lastName.toString(),
        avs: snap.avs.toString(),
        iban: snap.iban.toString(),
        residenceCanton: snap.residenceCanton,
        email: snap.email?.toString() ?? null,
        phone: snap.phone?.toString() ?? null,
        createdAt: snap.createdAt,
        updatedAt: snap.updatedAt,
        archivedAt: snap.archivedAt ?? null,
      },
      update: {
        firstName: snap.firstName.toString(),
        lastName: snap.lastName.toString(),
        iban: snap.iban.toString(),
        residenceCanton: snap.residenceCanton,
        email: snap.email?.toString() ?? null,
        phone: snap.phone?.toString() ?? null,
        updatedAt: snap.updatedAt,
        archivedAt: snap.archivedAt ?? null,
      },
    });
  }

  async findById(agencyId: AgencyId, id: StaffId): Promise<TempWorker | null> {
    const row = await this.prisma.tempWorker.findFirst({
      where: { id, agencyId },
    });
    return row ? rehydrate(row) : null;
  }

  async findByAvs(agencyId: AgencyId, avs: string): Promise<TempWorker | null> {
    const row = await this.prisma.tempWorker.findFirst({
      where: { agencyId, avs },
    });
    return row ? rehydrate(row) : null;
  }

  async list(query: ListWorkersQuery): Promise<WorkerListPage> {
    const rows = await this.prisma.tempWorker.findMany({
      where: {
        agencyId: query.agencyId,
        ...(query.includeArchived ? {} : { archivedAt: null }),
        ...(query.search
          ? {
              OR: [
                { firstName: { contains: query.search, mode: 'insensitive' } },
                { lastName: { contains: query.search, mode: 'insensitive' } },
                { avs: { contains: query.search } },
              ],
            }
          : {}),
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: query.limit,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const lastRow = rows.length === query.limit ? rows[rows.length - 1] : undefined;
    const nextCursor = lastRow?.id;

    return {
      items: rows.map(rehydrate),
      ...(nextCursor !== undefined ? { nextCursor } : {}),
    };
  }
}

function rehydrate(row: PrismaTempWorker): TempWorker {
  return TempWorker.rehydrate({
    id: asStaffId(row.id),
    agencyId: asAgencyId(row.agencyId),
    firstName: Name.parse(row.firstName),
    lastName: Name.parse(row.lastName),
    avs: Avs.parse(row.avs),
    iban: Iban.parse(row.iban),
    residenceCanton: parseCanton(row.residenceCanton),
    ...(row.email !== null ? { email: Email.parse(row.email) } : {}),
    ...(row.phone !== null ? { phone: Phone.parse(row.phone) } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.archivedAt !== null ? { archivedAt: row.archivedAt } : {}),
  });
}
