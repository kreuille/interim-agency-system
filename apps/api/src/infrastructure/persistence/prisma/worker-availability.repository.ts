import type { Prisma, PrismaClient } from '@prisma/client';
import {
  asAgencyId,
  asStaffId,
  asWorkerAvailabilityId,
  WorkerAvailability,
  type AgencyId,
  type AvailabilitySlotProps,
  type StaffId,
  type WorkerAvailabilityProps,
} from '@interim/domain';
import type { WorkerAvailabilityRepository } from '@interim/application';

/**
 * Adapter Postgres pour `WorkerAvailability` (1 row par
 * agency × worker, slots en JSONB).
 *
 * Sérialisation JSONB :
 *   - Dates écrites en ISO string, relues via `new Date()`.
 *   - Champs optionnels `reason`/`rrule` omis si undefined (cohérent
 *     avec `exactOptionalPropertyTypes: true`).
 */
export class PrismaWorkerAvailabilityRepository implements WorkerAvailabilityRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByWorker(
    agencyId: AgencyId,
    workerId: StaffId,
  ): Promise<WorkerAvailability | undefined> {
    const row = await this.prisma.workerAvailabilitySnapshot.findUnique({
      where: { agencyId_workerId: { agencyId, workerId } },
    });
    if (!row) return undefined;
    const slots = (row.slots as unknown as readonly SerializedSlot[]).map(deserializeSlot);
    const props: WorkerAvailabilityProps = {
      id: asWorkerAvailabilityId(row.id),
      agencyId: asAgencyId(row.agencyId),
      workerId: asStaffId(row.workerId),
      slots,
      lastUpdatedAt: row.lastUpdatedAt,
      ttlExpiresAt: row.ttlExpiresAt,
    };
    return WorkerAvailability.rehydrate(props);
  }

  async save(agg: WorkerAvailability): Promise<void> {
    const snap = agg.toSnapshot();
    const slotsJson = snap.slots.map(serializeSlot) as unknown as Prisma.InputJsonValue;
    await this.prisma.workerAvailabilitySnapshot.upsert({
      where: { agencyId_workerId: { agencyId: snap.agencyId, workerId: snap.workerId } },
      create: {
        id: snap.id,
        agencyId: snap.agencyId,
        workerId: snap.workerId,
        slots: slotsJson,
        lastUpdatedAt: snap.lastUpdatedAt,
        ttlExpiresAt: snap.ttlExpiresAt,
      },
      update: {
        slots: slotsJson,
        lastUpdatedAt: snap.lastUpdatedAt,
        ttlExpiresAt: snap.ttlExpiresAt,
      },
    });
  }
}

interface SerializedSlot {
  readonly id: string;
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly status: 'available' | 'tentative' | 'unavailable';
  readonly source: 'internal' | 'worker_self' | 'api' | 'moveplanner_push';
  readonly reason?: string;
  readonly rrule?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

function serializeSlot(s: AvailabilitySlotProps): SerializedSlot {
  return {
    id: s.id,
    dateFrom: s.dateFrom.toISOString(),
    dateTo: s.dateTo.toISOString(),
    status: s.status,
    source: s.source,
    ...(s.reason !== undefined ? { reason: s.reason } : {}),
    ...(s.rrule !== undefined ? { rrule: s.rrule } : {}),
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

function deserializeSlot(s: SerializedSlot): AvailabilitySlotProps {
  return {
    id: s.id,
    dateFrom: new Date(s.dateFrom),
    dateTo: new Date(s.dateTo),
    status: s.status,
    source: s.source,
    ...(s.reason !== undefined ? { reason: s.reason } : {}),
    ...(s.rrule !== undefined ? { rrule: s.rrule } : {}),
    createdAt: new Date(s.createdAt),
    updatedAt: new Date(s.updatedAt),
  };
}
