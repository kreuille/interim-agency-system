import {
  asStaffId,
  type AgencyId,
  type DocumentListPage,
  type DocumentRepository,
} from '@interim/domain';

export interface ListDocumentsInput {
  readonly agencyId: AgencyId;
  readonly workerId: string;
  readonly includeArchived?: boolean;
  readonly limit?: number;
  readonly cursor?: string;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export class ListDocumentsUseCase {
  constructor(private readonly docs: DocumentRepository) {}

  async execute(input: ListDocumentsInput): Promise<DocumentListPage> {
    const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    return this.docs.listByWorker({
      agencyId: input.agencyId,
      workerId: asStaffId(input.workerId),
      includeArchived: input.includeArchived ?? false,
      limit,
      ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
    });
  }
}
