import {
  asWorkerAvailabilityId,
  WorkerAvailability,
  type AgencyId,
  type AvailabilityDeclaredEvent,
  type SlotSource,
  type SlotStatus,
  type StaffId,
} from '@interim/domain';
import type { Clock, Result } from '@interim/shared';
import type {
  AvailabilityEventPublisher,
  WorkerAvailabilityRepository,
} from './availability-ports.js';

export interface AddSlotInput {
  readonly agencyId: AgencyId;
  readonly workerId: StaffId;
  readonly dateFrom: Date;
  readonly dateTo: Date;
  readonly status: SlotStatus;
  readonly source: SlotSource;
  readonly reason?: string;
  readonly rrule?: string;
}

export interface AddSlotOutput {
  readonly slotId: string;
}

export class AddSlotUseCase {
  constructor(
    private readonly repo: WorkerAvailabilityRepository,
    private readonly publisher: AvailabilityEventPublisher,
    private readonly clock: Clock,
    private readonly idFactory: () => string,
  ) {}

  async execute(input: AddSlotInput): Promise<Result<AddSlotOutput, never>> {
    const existing = await this.repo.findByWorker(input.agencyId, input.workerId);
    const agg =
      existing ??
      WorkerAvailability.create({
        id: asWorkerAvailabilityId(this.idFactory()),
        agencyId: input.agencyId,
        workerId: input.workerId,
        clock: this.clock,
      });

    const slot = agg.addSlot(
      {
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        status: input.status,
        source: input.source,
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
        ...(input.rrule !== undefined ? { rrule: input.rrule } : {}),
      },
      this.clock,
    );

    await this.repo.save(agg);

    const evt: AvailabilityDeclaredEvent = {
      kind: 'AvailabilityDeclared',
      agencyId: input.agencyId,
      workerId: input.workerId,
      slotId: slot.id,
      dateFrom: slot.dateFrom.toISOString(),
      dateTo: slot.dateTo.toISOString(),
      status: slot.status,
      source: slot.source,
      occurredAt: this.clock.now().toISOString(),
    };
    await this.publisher.publish(evt);

    return { ok: true, value: { slotId: slot.id } };
  }
}
