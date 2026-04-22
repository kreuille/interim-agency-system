import { randomUUID } from 'node:crypto';
import type { AgencyId, StaffId, WorkerAvailability } from '@interim/domain';
import type { Clock } from '@interim/shared';
import type {
  AvailabilityOutboxRepository,
  AvailabilityPushPayload,
} from './availability-outbox.js';

/**
 * Construit un payload outbox à partir d'un aggrégat `WorkerAvailability`
 * (snapshot complet : on pousse tous les slots actifs, simplification
 * MVP — différentiel à terme).
 *
 * **À appeler dans la même transaction** que la mutation aggregat (cf.
 * `AddSlotUseCase` côté backend persisté). Pour le MVP en mémoire, le
 * use case prend simplement l'aggrégat et insère la row outbox.
 */
export class EnqueueAvailabilityPushUseCase {
  constructor(
    private readonly outbox: AvailabilityOutboxRepository,
    private readonly clock: Clock,
    private readonly idFactory: () => string = randomUUID,
  ) {}

  async execute(input: {
    readonly agencyId: AgencyId;
    readonly workerId: StaffId;
    readonly aggregate: WorkerAvailability;
  }): Promise<{ readonly outboxId: string; readonly idempotencyKey: string }> {
    const snapshot = input.aggregate.toSnapshot();
    const payload: AvailabilityPushPayload = {
      slots: snapshot.slots.map((s) => ({
        slotId: s.id,
        dateFrom: s.dateFrom.toISOString(),
        dateTo: s.dateTo.toISOString(),
        status: s.status,
        source: s.source,
        ...(s.reason !== undefined ? { reason: s.reason } : {}),
      })),
    };

    const id = this.idFactory();
    const idempotencyKey = this.idFactory();
    await this.outbox.insert({
      id,
      agencyId: input.agencyId,
      workerId: input.workerId,
      idempotencyKey,
      payload,
      status: 'pending',
      attempts: 0,
      nextAttemptAt: this.clock.now(),
      lastError: undefined,
      createdAt: this.clock.now(),
    });
    return { outboxId: id, idempotencyKey };
  }
}
