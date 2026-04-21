import {
  asStaffId,
  DuplicateAvs,
  TempWorker,
  type AgencyId,
  type WorkerRepository,
} from '@interim/domain';
import {
  Avs,
  Email,
  Iban,
  Name,
  Phone,
  parseCanton,
  type Clock,
  type Result,
} from '@interim/shared';
import type { AuditLogger } from './audit-logger.js';

export interface RegisterWorkerInput {
  readonly agencyId: AgencyId;
  readonly actorUserId?: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly avs: string;
  readonly iban: string;
  readonly residenceCanton: string;
  readonly email?: string;
  readonly phone?: string;
}

export interface RegisterWorkerOutput {
  readonly workerId: string;
}

export class RegisterWorkerUseCase {
  constructor(
    private readonly repo: WorkerRepository,
    private readonly audit: AuditLogger,
    private readonly clock: Clock,
    private readonly idFactory: () => string,
  ) {}

  async execute(input: RegisterWorkerInput): Promise<Result<RegisterWorkerOutput, DuplicateAvs>> {
    const avs = Avs.parse(input.avs);
    const duplicate = await this.repo.findByAvs(input.agencyId, avs.toString());
    if (duplicate) {
      return { ok: false, error: new DuplicateAvs(avs.toString()) };
    }

    const worker = TempWorker.create(
      {
        id: asStaffId(this.idFactory()),
        agencyId: input.agencyId,
        firstName: Name.parse(input.firstName),
        lastName: Name.parse(input.lastName),
        avs,
        iban: Iban.parse(input.iban),
        residenceCanton: parseCanton(input.residenceCanton),
        ...(input.email !== undefined ? { email: Email.parse(input.email) } : {}),
        ...(input.phone !== undefined ? { phone: Phone.parse(input.phone) } : {}),
      },
      this.clock,
    );

    await this.repo.save(worker);

    const snap = worker.toSnapshot();
    await this.audit.record({
      kind: 'WorkerRegistered',
      agencyId: input.agencyId,
      workerId: snap.id,
      ...(input.actorUserId !== undefined ? { actorUserId: input.actorUserId } : {}),
      diff: {
        after: {
          firstName: snap.firstName.toString(),
          lastName: snap.lastName.toString(),
          avs: snap.avs.toString(),
          residenceCanton: snap.residenceCanton,
        },
      },
      occurredAt: this.clock.now(),
    });

    return { ok: true, value: { workerId: snap.id } };
  }
}
