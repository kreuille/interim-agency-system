import {
  type AgencyId,
  type ListWorkersQuery,
  type StaffId,
  type TempWorker,
  type WorkerListPage,
  type WorkerRepository,
} from '@interim/domain';
import type { AuditLogger, WorkerAuditEntry } from './audit-logger.js';

export class InMemoryWorkerRepository implements WorkerRepository {
  private readonly store = new Map<string, TempWorker>();

  private key(agencyId: AgencyId, id: StaffId): string {
    return `${agencyId}::${id}`;
  }

  save(worker: TempWorker): Promise<void> {
    this.store.set(this.key(worker.agencyId, worker.id), worker);
    return Promise.resolve();
  }

  findById(agencyId: AgencyId, id: StaffId): Promise<TempWorker | null> {
    return Promise.resolve(this.store.get(this.key(agencyId, id)) ?? null);
  }

  findByAvs(agencyId: AgencyId, avs: string): Promise<TempWorker | null> {
    for (const worker of this.store.values()) {
      if (worker.agencyId === agencyId && worker.toSnapshot().avs.toString() === avs) {
        return Promise.resolve(worker);
      }
    }
    return Promise.resolve(null);
  }

  list(query: ListWorkersQuery): Promise<WorkerListPage> {
    const filtered: TempWorker[] = [];
    for (const worker of this.store.values()) {
      if (worker.agencyId !== query.agencyId) continue;
      if (!query.includeArchived && worker.isArchived) continue;
      filtered.push(worker);
    }
    const sliced = filtered.slice(0, query.limit);
    return Promise.resolve({ items: sliced });
  }

  count(): number {
    return this.store.size;
  }
}

export class InMemoryAuditLogger implements AuditLogger {
  readonly entries: WorkerAuditEntry[] = [];

  record(entry: WorkerAuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}
