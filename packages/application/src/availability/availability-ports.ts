import type { AgencyId, AvailabilityEvent, StaffId, WorkerAvailability } from '@interim/domain';

/**
 * Persistance d'un aggrégat `WorkerAvailability` (1 par agency × worker).
 * En infra : table `worker_availabilities` + colonnes JSONB pour les slots,
 * accès filtré par `agencyId` (multi-tenant strict).
 */
export interface WorkerAvailabilityRepository {
  findByWorker(agencyId: AgencyId, workerId: StaffId): Promise<WorkerAvailability | undefined>;
  save(agg: WorkerAvailability): Promise<void>;
}

/**
 * Publication des évents disponibilité sur l'EventBus
 * (BullMQ en production, in-memory en tests). Les workers consument ces
 * messages pour push MovePlanner (A2.5).
 */
export interface AvailabilityEventPublisher {
  publish(event: AvailabilityEvent): Promise<void>;
}
