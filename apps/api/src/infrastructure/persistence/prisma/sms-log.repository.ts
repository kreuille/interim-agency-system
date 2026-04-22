import type { PrismaClient } from '@prisma/client';
import { asAgencyId, type AgencyId } from '@interim/domain';
import type {
  InsertSmsLogInput,
  SmsLogRecord,
  SmsLogRepository,
  SmsProvider,
  SmsStatus,
} from '@interim/application';

/**
 * Adapter Postgres pour `sms_logs`.
 *
 * Mapping enum domaine ↔ Prisma : minuscule snake_case (domaine) ↔
 * UPPER_SNAKE (Prisma).
 */
export class PrismaSmsLogRepository implements SmsLogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async insert(input: InsertSmsLogInput): Promise<void> {
    await this.prisma.smsLog.create({
      data: {
        id: input.id,
        agencyId: input.agencyId,
        toMasked: input.toMasked,
        templateCode: input.templateCode,
        provider: PROVIDER_TO_PRISMA[input.provider],
        providerMessageId: input.providerMessageId ?? null,
        status: STATUS_TO_PRISMA[input.status],
        sentAt: input.sentAt ?? null,
        failureReason: input.failureReason ?? null,
        createdAt: input.createdAt,
      },
    });
  }

  async updateByProviderMessageId(input: {
    providerMessageId: string;
    provider: SmsProvider;
    status: SmsStatus;
    deliveredAt?: Date;
    failureReason?: string;
  }): Promise<void> {
    await this.prisma.smsLog.updateMany({
      where: {
        providerMessageId: input.providerMessageId,
        provider: PROVIDER_TO_PRISMA[input.provider],
      },
      data: {
        status: STATUS_TO_PRISMA[input.status],
        ...(input.deliveredAt !== undefined ? { deliveredAt: input.deliveredAt } : {}),
        ...(input.failureReason !== undefined ? { failureReason: input.failureReason } : {}),
      },
    });
  }

  async findRecent(agencyId: AgencyId, limit: number): Promise<readonly SmsLogRecord[]> {
    const rows = await this.prisma.smsLog.findMany({
      where: { agencyId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map(toDomain);
  }
}

interface RawRow {
  readonly id: string;
  readonly agencyId: string;
  readonly toMasked: string;
  readonly templateCode: string;
  readonly provider: string;
  readonly providerMessageId: string | null;
  readonly status: string;
  readonly sentAt: Date | null;
  readonly deliveredAt: Date | null;
  readonly failureReason: string | null;
  readonly createdAt: Date;
}

function toDomain(row: RawRow): SmsLogRecord {
  return {
    id: row.id,
    agencyId: asAgencyId(row.agencyId),
    toMasked: row.toMasked,
    templateCode: row.templateCode,
    provider: PROVIDER_FROM_PRISMA[row.provider] ?? 'noop',
    providerMessageId: row.providerMessageId ?? undefined,
    status: STATUS_FROM_PRISMA[row.status] ?? 'failed',
    sentAt: row.sentAt ?? undefined,
    deliveredAt: row.deliveredAt ?? undefined,
    failureReason: row.failureReason ?? undefined,
    createdAt: row.createdAt,
  };
}

const PROVIDER_TO_PRISMA: Record<SmsProvider, 'SWISSCOM' | 'TWILIO' | 'NOOP'> = {
  swisscom: 'SWISSCOM',
  twilio: 'TWILIO',
  noop: 'NOOP',
};

const PROVIDER_FROM_PRISMA: Record<string, SmsProvider> = {
  SWISSCOM: 'swisscom',
  TWILIO: 'twilio',
  NOOP: 'noop',
};

const STATUS_TO_PRISMA: Record<SmsStatus, 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED' | 'OPT_OUT'> =
  {
    queued: 'QUEUED',
    sent: 'SENT',
    delivered: 'DELIVERED',
    failed: 'FAILED',
    opt_out: 'OPT_OUT',
  };

const STATUS_FROM_PRISMA: Record<string, SmsStatus> = {
  QUEUED: 'queued',
  SENT: 'sent',
  DELIVERED: 'delivered',
  FAILED: 'failed',
  OPT_OUT: 'opt_out',
};
