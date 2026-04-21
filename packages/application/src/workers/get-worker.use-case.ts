import {
  asStaffId,
  WorkerNotFound,
  type AgencyId,
  type TempWorker,
  type WorkerRepository,
} from '@interim/domain';
import type { Result } from '@interim/shared';

export interface GetWorkerInput {
  readonly agencyId: AgencyId;
  readonly workerId: string;
  readonly includeArchived?: boolean;
}

export class GetWorkerUseCase {
  constructor(private readonly repo: WorkerRepository) {}

  async execute(input: GetWorkerInput): Promise<Result<TempWorker, WorkerNotFound>> {
    const worker = await this.repo.findById(input.agencyId, asStaffId(input.workerId));
    if (!worker || (worker.isArchived && !input.includeArchived)) {
      return { ok: false, error: new WorkerNotFound(input.workerId) };
    }
    return { ok: true, value: worker };
  }
}
