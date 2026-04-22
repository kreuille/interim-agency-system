import type { AgencyId, AvailabilityEvent, StaffId, WorkerAvailability } from '@interim/domain';
import type { Result } from '@interim/shared';
import type {
  AvailabilityEventPublisher,
  WorkerAvailabilityRepository,
} from './availability-ports.js';
import type { AvailabilityOutboxRepository, AvailabilityOutboxRow } from './availability-outbox.js';
import { AvailabilityPushError, type AvailabilityPushPort } from './availability-push-port.js';

/**
 * Repository in-memory pour tests. Clé `${agencyId}::${workerId}`.
 */
export class InMemoryWorkerAvailabilityRepository implements WorkerAvailabilityRepository {
  private readonly store = new Map<string, WorkerAvailability>();

  private key(agencyId: AgencyId, workerId: StaffId): string {
    return `${agencyId}::${workerId}`;
  }

  findByWorker(agencyId: AgencyId, workerId: StaffId): Promise<WorkerAvailability | undefined> {
    return Promise.resolve(this.store.get(this.key(agencyId, workerId)));
  }

  save(agg: WorkerAvailability): Promise<void> {
    this.store.set(this.key(agg.agencyId, agg.workerId), agg);
    return Promise.resolve();
  }

  size(): number {
    return this.store.size;
  }
}

/**
 * Publisher in-memory pour tests : retient les events publiés dans l'ordre.
 */
export class InMemoryAvailabilityEventPublisher implements AvailabilityEventPublisher {
  readonly published: AvailabilityEvent[] = [];

  publish(event: AvailabilityEvent): Promise<void> {
    this.published.push(event);
    return Promise.resolve();
  }
}

/**
 * Outbox in-memory : range les rows dans une `Map<id, row>`. `claimDue`
 * range par ordre `createdAt` croissant et marque `in_progress`.
 */
export class InMemoryAvailabilityOutboxRepository implements AvailabilityOutboxRepository {
  private readonly rows = new Map<string, AvailabilityOutboxRow>();

  insert(row: AvailabilityOutboxRow): Promise<void> {
    this.rows.set(row.id, row);
    return Promise.resolve();
  }

  claimDue(now: Date, limit: number): Promise<readonly AvailabilityOutboxRow[]> {
    const due = [...this.rows.values()]
      .filter(
        (r) =>
          (r.status === 'pending' || r.status === 'failed') &&
          (r.nextAttemptAt === undefined || r.nextAttemptAt.getTime() <= now.getTime()),
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, limit);
    for (const row of due) {
      this.rows.set(row.id, { ...row, status: 'in_progress' });
    }
    return Promise.resolve(due);
  }

  markSuccess(id: string, now: Date): Promise<void> {
    const row = this.rows.get(id);
    if (row) {
      this.rows.set(id, {
        ...row,
        status: 'success',
        attempts: row.attempts + 1,
        lastError: undefined,
        nextAttemptAt: now,
      });
    }
    return Promise.resolve();
  }

  markFailure(input: {
    id: string;
    error: string;
    nextAttemptAt: Date | undefined;
    status: 'failed' | 'dead';
  }): Promise<void> {
    const row = this.rows.get(input.id);
    if (row) {
      this.rows.set(input.id, {
        ...row,
        status: input.status,
        attempts: row.attempts + 1,
        lastError: input.error,
        nextAttemptAt: input.nextAttemptAt,
      });
    }
    return Promise.resolve();
  }

  snapshot(): readonly AvailabilityOutboxRow[] {
    return [...this.rows.values()];
  }
}

/**
 * `AvailabilityPushPort` scriptable : produit pour chaque appel le
 * résultat à la position `callCount`. Utile pour tester retry/dead.
 */
export class ScriptedAvailabilityPushPort implements AvailabilityPushPort {
  private callCount = 0;
  readonly calls: { idempotencyKey: string }[] = [];

  constructor(
    private readonly outcomes: readonly (
      | { kind: 'ok'; accepted: number; rejected: number }
      | { kind: 'transient'; message?: string }
      | { kind: 'permanent'; message?: string }
    )[],
  ) {}

  push(input: {
    agencyId: string;
    workerId: string;
    idempotencyKey: string;
  }): Promise<Result<{ accepted: number; rejected: number }, AvailabilityPushError>> {
    this.calls.push({ idempotencyKey: input.idempotencyKey });
    const outcome = this.outcomes[Math.min(this.callCount, this.outcomes.length - 1)];
    this.callCount += 1;
    if (!outcome) {
      return Promise.resolve({
        ok: false,
        error: new AvailabilityPushError('transient', 'no scripted outcome'),
      });
    }
    if (outcome.kind === 'ok') {
      return Promise.resolve({
        ok: true,
        value: { accepted: outcome.accepted, rejected: outcome.rejected },
      });
    }
    return Promise.resolve({
      ok: false,
      error: new AvailabilityPushError(
        outcome.kind,
        outcome.message ?? `${outcome.kind} push error`,
      ),
    });
  }
}
