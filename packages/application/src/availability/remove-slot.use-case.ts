import {
  SlotNotFound,
  type AgencyId,
  type AvailabilityChangedEvent,
  type StaffId,
} from '@interim/domain';
import type { Clock, Result } from '@interim/shared';
import type {
  AvailabilityEventPublisher,
  WorkerAvailabilityRepository,
} from './availability-ports.js';

export interface RemoveSlotInput {
  readonly agencyId: AgencyId;
  readonly workerId: StaffId;
  readonly slotId: string;
}

export class WorkerAvailabilityNotFound extends Error {
  constructor(workerId: string) {
    super(`Aucune disponibilité enregistrée pour ${workerId}`);
    this.name = 'WorkerAvailabilityNotFound';
  }
}

export class RemoveSlotUseCase {
  constructor(
    private readonly repo: WorkerAvailabilityRepository,
    private readonly publisher: AvailabilityEventPublisher,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: RemoveSlotInput,
  ): Promise<Result<{ readonly removed: true }, WorkerAvailabilityNotFound | SlotNotFound>> {
    const agg = await this.repo.findByWorker(input.agencyId, input.workerId);
    if (!agg) return { ok: false, error: new WorkerAvailabilityNotFound(input.workerId) };

    try {
      agg.removeSlot(input.slotId, this.clock);
    } catch (err) {
      if (err instanceof SlotNotFound) return { ok: false, error: err };
      throw err;
    }

    await this.repo.save(agg);

    const evt: AvailabilityChangedEvent = {
      kind: 'AvailabilityChanged',
      agencyId: input.agencyId,
      workerId: input.workerId,
      slotId: input.slotId,
      action: 'removed',
      occurredAt: this.clock.now().toISOString(),
    };
    await this.publisher.publish(evt);

    return { ok: true, value: { removed: true } };
  }
}
