import type { AgencyId, StaffId } from '../../../shared/ids.js';
import type { WorkerDocument } from '../worker-document.js';

export interface ListDocumentsQuery {
  readonly agencyId: AgencyId;
  readonly workerId: StaffId;
  readonly includeArchived?: boolean;
  readonly limit: number;
  readonly cursor?: string;
}

export interface DocumentListPage {
  readonly items: readonly WorkerDocument[];
  readonly nextCursor?: string;
}

export interface DocumentRepository {
  save(doc: WorkerDocument): Promise<void>;
  findById(agencyId: AgencyId, id: string): Promise<WorkerDocument | null>;
  listByWorker(query: ListDocumentsQuery): Promise<DocumentListPage>;
}
