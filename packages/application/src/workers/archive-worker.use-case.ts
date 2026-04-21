import { asStaffId, WorkerNotFound, type AgencyId, type WorkerRepository } from '@interim/domain';
import type { Clock, Result } from '@interim/shared';
import type { AuditLogger } from './audit-logger.js';

export interface ArchiveWorkerInput {
  readonly agencyId: AgencyId;
  readonly workerId: string;
  readonly actorUserId?: string;
}

export class ArchiveWorkerUseCase {
  constructor(
    private readonly repo: WorkerRepository,
    private readonly audit: AuditLogger,
    private readonly clock: Clock,
  ) {}

  async execute(input: ArchiveWorkerInput): Promise<Result<void, WorkerNotFound>> {
    const worker = await this.repo.findById(input.agencyId, asStaffId(input.workerId));
    if (!worker) {
      return { ok: false, error: new WorkerNotFound(input.workerId) };
    }

    const wasAlreadyArchived = worker.isArchived;
    worker.archive(this.clock);
    await this.repo.save(worker);

    if (!wasAlreadyArchived) {
      await this.audit.record({
        kind: 'WorkerArchived',
        agencyId: input.agencyId,
        workerId: input.workerId,
        ...(input.actorUserId !== undefined ? { actorUserId: input.actorUserId } : {}),
        diff: {},
        occurredAt: this.clock.now(),
      });
    }

    return { ok: true, value: undefined };
  }
}
