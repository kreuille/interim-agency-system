import type { AgencyId, AvailabilityEvent, StaffId, WorkerAvailability } from '@interim/domain';
import type {
  AvailabilityEventPublisher,
  WorkerAvailabilityRepository,
} from './availability-ports.js';

/**
 * Repository in-memory pour tests. Clé `${agencyId}::${workerId}`.
 */
export class InMemoryWorkerAvailabilityRepository implements WorkerAvailabilityRepository {
  private readonly store = new Map<string, WorkerAvailability>();

  private key(agencyId: AgencyId, workerId: StaffId): string {
    return `${agencyId}::${workerId}`;
  }

  findByWorker(agencyId: AgencyId, workerId: StaffId): Promise<WorkerAvailability | undefined> {
    return Promise.resolve(this.store.get(this.key(agencyId, workerId)));
  }

  save(agg: WorkerAvailability): Promise<void> {
    this.store.set(this.key(agg.agencyId, agg.workerId), agg);
    return Promise.resolve();
  }

  size(): number {
    return this.store.size;
  }
}

/**
 * Publisher in-memory pour tests : retient les events publiés dans l'ordre.
 */
export class InMemoryAvailabilityEventPublisher implements AvailabilityEventPublisher {
  readonly published: AvailabilityEvent[] = [];

  publish(event: AvailabilityEvent): Promise<void> {
    this.published.push(event);
    return Promise.resolve();
  }
}
