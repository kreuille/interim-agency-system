import type { AgencyId, WorkerListPage, WorkerRepository } from '@interim/domain';

export interface ListWorkersInput {
  readonly agencyId: AgencyId;
  readonly search?: string;
  readonly includeArchived?: boolean;
  readonly limit?: number;
  readonly cursor?: string;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export class ListWorkersUseCase {
  constructor(private readonly repo: WorkerRepository) {}

  async execute(input: ListWorkersInput): Promise<WorkerListPage> {
    const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    return this.repo.list({
      agencyId: input.agencyId,
      includeArchived: input.includeArchived ?? false,
      ...(input.search !== undefined ? { search: input.search } : {}),
      limit,
      ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
    });
  }
}
