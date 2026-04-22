import type { Prisma, PrismaClient } from '@prisma/client';
import { asAgencyId } from '@interim/domain';
import type {
  InboundWebhookEventRecord,
  InboundWebhookRepository,
  InboundWebhookStatus,
  InsertInboundResult,
  InsertInboundWebhookInput,
} from '@interim/application';

/**
 * Adapter Postgres pour `inbound_webhook_events`.
 *
 * `insertIfNew` utilise un INSERT classique et catch P2002 (unique
 * violation sur `eventId`) pour renvoyer `duplicate` sans propagation.
 * Cela suffit pour Postgres ; sous SQLite ou autres on aurait besoin
 * d'un `INSERT ... ON CONFLICT DO NOTHING`.
 */
export class PrismaInboundWebhookRepository implements InboundWebhookRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async insertIfNew(input: InsertInboundWebhookInput): Promise<InsertInboundResult> {
    try {
      const created = await this.prisma.inboundWebhookEvent.create({
        data: {
          id: input.id,
          agencyId: input.agencyId,
          eventId: input.eventId,
          eventType: input.eventType,
          signature: input.signature,
          payload: input.payload as Prisma.InputJsonValue,
          headers: input.headers,
          receivedAt: input.receivedAt,
          status: 'PENDING',
        },
        select: { id: true },
      });
      return { inserted: true, id: created.id };
    } catch (err) {
      // P2002 : Unique constraint violation (already received)
      if (isUniqueViolation(err)) {
        return { inserted: false, reason: 'duplicate' };
      }
      throw err;
    }
  }

  async findById(id: string): Promise<InboundWebhookEventRecord | undefined> {
    const row = await this.prisma.inboundWebhookEvent.findUnique({ where: { id } });
    if (!row) return undefined;
    return toDomain(row);
  }

  async markProcessing(id: string, _now: Date): Promise<void> {
    await this.prisma.inboundWebhookEvent.update({
      where: { id },
      data: { status: 'PROCESSING' },
    });
  }

  async markProcessed(id: string, now: Date): Promise<void> {
    await this.prisma.inboundWebhookEvent.update({
      where: { id },
      data: { status: 'PROCESSED', processedAt: now, errorMessage: null },
    });
  }

  async markFailed(input: { id: string; errorMessage: string }): Promise<void> {
    await this.prisma.inboundWebhookEvent.update({
      where: { id: input.id },
      data: {
        status: 'FAILED',
        errorMessage: input.errorMessage,
        retryCount: { increment: 1 },
      },
    });
  }
}

interface RawInboundRow {
  readonly id: string;
  readonly agencyId: string;
  readonly eventId: string;
  readonly eventType: string;
  readonly signature: string;
  readonly receivedAt: Date;
  readonly processedAt: Date | null;
  readonly status: string;
  readonly payload: unknown;
  readonly headers: unknown;
  readonly errorMessage: string | null;
  readonly retryCount: number;
}

function toDomain(row: RawInboundRow): InboundWebhookEventRecord {
  return {
    id: row.id,
    agencyId: asAgencyId(row.agencyId),
    eventId: row.eventId,
    eventType: row.eventType,
    signature: row.signature,
    receivedAt: row.receivedAt,
    processedAt: row.processedAt ?? undefined,
    status: row.status as InboundWebhookStatus,
    payload: row.payload,
    headers: row.headers as Record<string, string>,
    errorMessage: row.errorMessage ?? undefined,
    retryCount: row.retryCount,
  };
}

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  if (!('code' in err)) return false;
  return err.code === 'P2002';
}
