import {
  asStaffId,
  TempWorker,
  WorkerNotFound,
  type AgencyId,
  type TempWorkerProps,
  type WorkerRepository,
} from '@interim/domain';
import { Email, Iban, Name, Phone, parseCanton, type Clock, type Result } from '@interim/shared';
import type { AuditLogger } from './audit-logger.js';

void TempWorker;

export interface UpdateWorkerInput {
  readonly agencyId: AgencyId;
  readonly workerId: string;
  readonly actorUserId?: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly iban?: string;
  readonly residenceCanton?: string;
  readonly email?: string | null;
  readonly phone?: string | null;
}

export class UpdateWorkerUseCase {
  constructor(
    private readonly repo: WorkerRepository,
    private readonly audit: AuditLogger,
    private readonly clock: Clock,
  ) {}

  async execute(input: UpdateWorkerInput): Promise<Result<void, WorkerNotFound>> {
    const worker = await this.repo.findById(input.agencyId, asStaffId(input.workerId));
    if (!worker) {
      return { ok: false, error: new WorkerNotFound(input.workerId) };
    }

    const before = worker.toSnapshot();

    if (input.firstName !== undefined || input.lastName !== undefined) {
      worker.rename(
        input.firstName !== undefined ? Name.parse(input.firstName) : before.firstName,
        input.lastName !== undefined ? Name.parse(input.lastName) : before.lastName,
        this.clock,
      );
    }
    if (input.iban !== undefined) {
      worker.changeIban(Iban.parse(input.iban), this.clock);
    }
    if (input.residenceCanton !== undefined) {
      worker.changeResidenceCanton(parseCanton(input.residenceCanton), this.clock);
    }
    if (input.email !== undefined) {
      worker.changeEmail(input.email === null ? undefined : Email.parse(input.email), this.clock);
    }
    if (input.phone !== undefined) {
      worker.changePhone(input.phone === null ? undefined : Phone.parse(input.phone), this.clock);
    }

    await this.repo.save(worker);

    const after = worker.toSnapshot();
    await this.audit.record({
      kind: 'WorkerUpdated',
      agencyId: input.agencyId,
      workerId: input.workerId,
      ...(input.actorUserId !== undefined ? { actorUserId: input.actorUserId } : {}),
      diff: {
        before: toAuditShape(before),
        after: toAuditShape(after),
      },
      occurredAt: this.clock.now(),
    });

    return { ok: true, value: undefined };
  }
}

function toAuditShape(snap: Readonly<TempWorkerProps>) {
  return {
    firstName: snap.firstName.toString(),
    lastName: snap.lastName.toString(),
    iban: snap.iban.toString(),
    residenceCanton: snap.residenceCanton,
    email: snap.email?.toString() ?? null,
    phone: snap.phone?.toString() ?? null,
  };
}
