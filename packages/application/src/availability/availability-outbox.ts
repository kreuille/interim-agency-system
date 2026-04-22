import type { AgencyId, StaffId } from '@interim/domain';

/**
 * Pattern Outbox pour le push MovePlanner.
 *
 * Inséré dans la même transaction que la mutation `WorkerAvailability`
 * (use case `enqueueAvailabilityPush`). Un worker BullMQ poll les rows
 * `pending` (FOR UPDATE SKIP LOCKED), appelle l'`AvailabilityPushPort`,
 * met à jour le statut.
 *
 * Garanties :
 * - **At-least-once** : si crash après publish mais avant ack, le rejeu
 *   est court-circuité par la clé d'idempotence côté MP (cf. A2.4
 *   `OutboundIdempotencyStore`).
 * - **Backoff** : retries exponentiels [30s, 2m, 5m, 15m, 1h, 3h] →
 *   après 6 échecs, statut `dead` + alerte (DETTE-029).
 */

export type OutboxStatus = 'pending' | 'in_progress' | 'success' | 'failed' | 'dead';

export interface AvailabilityOutboxRow {
  readonly id: string;
  readonly agencyId: AgencyId;
  readonly workerId: StaffId;
  readonly idempotencyKey: string;
  readonly payload: AvailabilityPushPayload;
  readonly status: OutboxStatus;
  readonly attempts: number;
  readonly nextAttemptAt: Date | undefined;
  readonly lastError: string | undefined;
  readonly createdAt: Date;
}

export interface AvailabilityPushPayload {
  readonly slots: readonly {
    readonly slotId: string;
    readonly dateFrom: string;
    readonly dateTo: string;
    readonly status: 'available' | 'tentative' | 'unavailable';
    readonly source: 'internal' | 'worker_self' | 'api' | 'moveplanner_push';
    readonly reason?: string;
  }[];
}

export interface AvailabilityOutboxRepository {
  /**
   * Insère une row `pending`. À appeler dans la même transaction que la
   * mutation aggregat `WorkerAvailability` (cf. `PushAvailabilityUseCase`).
   */
  insert(row: AvailabilityOutboxRow): Promise<void>;

  /**
   * Récupère et marque `in_progress` jusqu'à `limit` rows dont
   * `nextAttemptAt <= now`. Implémentation Postgres : `SELECT ... FOR
   * UPDATE SKIP LOCKED`.
   */
  claimDue(now: Date, limit: number): Promise<readonly AvailabilityOutboxRow[]>;

  markSuccess(id: string, now: Date): Promise<void>;

  markFailure(input: {
    readonly id: string;
    readonly error: string;
    readonly nextAttemptAt: Date | undefined;
    readonly status: 'failed' | 'dead';
  }): Promise<void>;
}

/**
 * Backoff par tentative (en secondes). Index = numéro de tentative
 * (`attempts` après l'échec courant). À l'index 6 → dead.
 */
export const OUTBOX_BACKOFF_SECONDS: readonly number[] = [30, 120, 300, 900, 3600, 10800] as const;

export const OUTBOX_DEAD_AFTER_ATTEMPTS = OUTBOX_BACKOFF_SECONDS.length;

export function nextAttemptDelaySeconds(attempts: number): number | undefined {
  if (attempts >= OUTBOX_DEAD_AFTER_ATTEMPTS) return undefined;
  return OUTBOX_BACKOFF_SECONDS[attempts];
}
