import type { Clock } from '@interim/shared';
import {
  nextAttemptDelaySeconds,
  type AvailabilityOutboxRepository,
  type AvailabilityOutboxRow,
} from './availability-outbox.js';
import type { AvailabilityPushPort } from './availability-push-port.js';

export interface PushAvailabilityResult {
  readonly processed: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly dead: number;
}

/**
 * Drain de la queue outbox : appelé par le worker BullMQ
 * `apps/worker/src/availability-sync.worker.ts`.
 *
 * Pour chaque row claimée :
 * 1. Appelle l'adapter `AvailabilityPushPort` avec sa `idempotencyKey`.
 * 2. Succès → markSuccess.
 * 3. Échec transient → markFailure + reprogramme `nextAttemptAt` selon
 *    `OUTBOX_BACKOFF_SECONDS`. Si le quota d'essais est dépassé →
 *    statut `dead` (alerte → DETTE-029).
 * 4. Échec permanent (4xx hors 429) → statut `dead` immédiatement.
 */
export class PushAvailabilityUseCase {
  constructor(
    private readonly outbox: AvailabilityOutboxRepository,
    private readonly pushPort: AvailabilityPushPort,
    private readonly clock: Clock,
    private readonly batchSize = 10,
  ) {}

  async execute(): Promise<PushAvailabilityResult> {
    const now = this.clock.now();
    const rows = await this.outbox.claimDue(now, this.batchSize);
    let succeeded = 0;
    let failed = 0;
    let dead = 0;

    for (const row of rows) {
      const outcome = await this.process(row);
      if (outcome === 'success') succeeded += 1;
      else if (outcome === 'dead') dead += 1;
      else failed += 1;
    }

    return {
      processed: rows.length,
      succeeded,
      failed,
      dead,
    };
  }

  private async process(row: AvailabilityOutboxRow): Promise<'success' | 'failed' | 'dead'> {
    const result = await this.pushPort.push({
      agencyId: row.agencyId,
      workerId: row.workerId,
      idempotencyKey: row.idempotencyKey,
      payload: row.payload,
    });
    const now = this.clock.now();

    if (result.ok) {
      await this.outbox.markSuccess(row.id, now);
      return 'success';
    }

    const attemptsAfter = row.attempts + 1;
    if (result.error.kind === 'permanent') {
      await this.outbox.markFailure({
        id: row.id,
        error: result.error.message,
        nextAttemptAt: undefined,
        status: 'dead',
      });
      return 'dead';
    }

    const nextDelay = nextAttemptDelaySeconds(attemptsAfter);
    if (nextDelay === undefined) {
      await this.outbox.markFailure({
        id: row.id,
        error: result.error.message,
        nextAttemptAt: undefined,
        status: 'dead',
      });
      return 'dead';
    }
    await this.outbox.markFailure({
      id: row.id,
      error: result.error.message,
      nextAttemptAt: new Date(now.getTime() + nextDelay * 1000),
      status: 'failed',
    });
    return 'failed';
  }
}
