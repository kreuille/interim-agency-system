import type { AgencyId, StaffId } from '../../shared/ids.js';
import type { TempWorker } from '../temp-worker.js';

export interface ListWorkersQuery {
  readonly agencyId: AgencyId;
  readonly includeArchived?: boolean;
  readonly search?: string;
  readonly limit: number;
  readonly cursor?: string;
}

export interface WorkerListPage {
  readonly items: readonly TempWorker[];
  readonly nextCursor?: string;
}

export interface WorkerRepository {
  save(worker: TempWorker): Promise<void>;
  findById(agencyId: AgencyId, id: StaffId): Promise<TempWorker | null>;
  findByAvs(agencyId: AgencyId, avs: string): Promise<TempWorker | null>;
  list(query: ListWorkersQuery): Promise<WorkerListPage>;
}
