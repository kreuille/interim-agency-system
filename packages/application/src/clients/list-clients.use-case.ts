import type { AgencyId, ClientListPage, ClientRepository, ClientStatus } from '@interim/domain';

export interface ListClientsInput {
  readonly agencyId: AgencyId;
  readonly search?: string;
  readonly status?: ClientStatus;
  readonly includeArchived?: boolean;
  readonly limit?: number;
  readonly cursor?: string;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export class ListClientsUseCase {
  constructor(private readonly repo: ClientRepository) {}

  async execute(input: ListClientsInput): Promise<ClientListPage> {
    const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    return this.repo.list({
      agencyId: input.agencyId,
      includeArchived: input.includeArchived ?? false,
      ...(input.search !== undefined ? { search: input.search } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      limit,
      ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
    });
  }
}
