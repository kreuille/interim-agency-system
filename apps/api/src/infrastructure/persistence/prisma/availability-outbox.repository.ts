import type { Prisma, PrismaClient } from '@prisma/client';
import { asAgencyId, asStaffId } from '@interim/domain';
import type {
  AvailabilityOutboxRepository,
  AvailabilityOutboxRow,
  AvailabilityPushPayload,
  OutboxStatus,
} from '@interim/application';

/**
 * Adapter Postgres pour l'outbox `OutboxAvailabilityPush`.
 *
 * `claimDue` utilise une CTE + `FOR UPDATE SKIP LOCKED` pour qu'à
 * concurrence > 1, plusieurs workers peuvent drainer en parallèle sans
 * conflit. C'est crucial pour la sémantique at-least-once.
 *
 * Cf. `packages/application/src/availability/availability-outbox.ts`
 * pour la logique métier (backoff, dead, etc.).
 */
export class PrismaAvailabilityOutboxRepository implements AvailabilityOutboxRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async insert(row: AvailabilityOutboxRow): Promise<void> {
    await this.prisma.outboxAvailabilityPush.create({
      data: {
        id: row.id,
        agencyId: row.agencyId,
        workerId: row.workerId,
        idempotencyKey: row.idempotencyKey,
        payload: row.payload as unknown as Prisma.InputJsonValue,
        status: toPrismaStatus(row.status),
        attempts: row.attempts,
        nextAttemptAt: row.nextAttemptAt ?? null,
        lastError: row.lastError ?? null,
        createdAt: row.createdAt,
      },
    });
  }

  async claimDue(now: Date, limit: number): Promise<readonly AvailabilityOutboxRow[]> {
    // CTE Postgres : sélectionne les rows pending|failed dont
    // `nextAttemptAt` est null ou <= now, verrouille avec
    // SKIP LOCKED, marque IN_PROGRESS, renvoie.
    const rows = await this.prisma.$queryRaw<readonly RawOutboxRow[]>`
      WITH due AS (
        SELECT id
        FROM outbox_availability_push
        WHERE status IN ('PENDING', 'FAILED')
          AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= ${now})
        ORDER BY "createdAt" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE outbox_availability_push o
      SET status = 'IN_PROGRESS', "updatedAt" = ${now}
      FROM due
      WHERE o.id = due.id
      RETURNING
        o.id,
        o."agencyId",
        o."workerId",
        o."idempotencyKey",
        o.payload,
        o.status::text AS status,
        o.attempts,
        o."nextAttemptAt",
        o."lastError",
        o."createdAt"
    `;
    return rows.map(toDomain);
  }

  async markSuccess(id: string, now: Date): Promise<void> {
    await this.prisma.outboxAvailabilityPush.update({
      where: { id },
      data: {
        status: 'SUCCESS',
        attempts: { increment: 1 },
        lastError: null,
        nextAttemptAt: now,
      },
    });
  }

  async markFailure(input: {
    id: string;
    error: string;
    nextAttemptAt: Date | undefined;
    status: 'failed' | 'dead';
  }): Promise<void> {
    await this.prisma.outboxAvailabilityPush.update({
      where: { id: input.id },
      data: {
        status: input.status === 'dead' ? 'DEAD' : 'FAILED',
        attempts: { increment: 1 },
        lastError: input.error,
        nextAttemptAt: input.nextAttemptAt ?? null,
      },
    });
  }
}

interface RawOutboxRow {
  readonly id: string;
  readonly agencyId: string;
  readonly workerId: string;
  readonly idempotencyKey: string;
  readonly payload: unknown;
  readonly status: string;
  readonly attempts: number;
  readonly nextAttemptAt: Date | null;
  readonly lastError: string | null;
  readonly createdAt: Date;
}

function toDomain(row: RawOutboxRow): AvailabilityOutboxRow {
  return {
    id: row.id,
    agencyId: asAgencyId(row.agencyId),
    workerId: asStaffId(row.workerId),
    idempotencyKey: row.idempotencyKey,
    payload: row.payload as AvailabilityPushPayload,
    status: fromPrismaStatus(row.status),
    attempts: row.attempts,
    nextAttemptAt: row.nextAttemptAt ?? undefined,
    lastError: row.lastError ?? undefined,
    createdAt: row.createdAt,
  };
}

const STATUS_TO_PRISMA: Record<
  OutboxStatus,
  'PENDING' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILED' | 'DEAD'
> = {
  pending: 'PENDING',
  in_progress: 'IN_PROGRESS',
  success: 'SUCCESS',
  failed: 'FAILED',
  dead: 'DEAD',
};

const STATUS_FROM_PRISMA: Record<string, OutboxStatus> = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  SUCCESS: 'success',
  FAILED: 'failed',
  DEAD: 'dead',
};

function toPrismaStatus(
  s: OutboxStatus,
): 'PENDING' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILED' | 'DEAD' {
  return STATUS_TO_PRISMA[s];
}

function fromPrismaStatus(s: string): OutboxStatus {
  const out = STATUS_FROM_PRISMA[s];
  if (!out) throw new Error(`Unknown OutboxStatus from Prisma: ${s}`);
  return out;
}
