import type { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { AgencyId } from '@interim/domain';
import type { OptOutRepository } from '@interim/application';

/**
 * Adapter Postgres pour `sms_opt_outs`. Idempotent : `optOut` upsert
 * par couple unique `(agencyId, phoneE164)`.
 */
export class PrismaSmsOptOutRepository implements OptOutRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async isOptedOut(agencyId: AgencyId, phoneE164: string): Promise<boolean> {
    const found = await this.prisma.smsOptOut.findUnique({
      where: { agencyId_phoneE164: { agencyId, phoneE164 } },
    });
    return found !== null;
  }

  async optOut(agencyId: AgencyId, phoneE164: string, at: Date): Promise<void> {
    await this.prisma.smsOptOut.upsert({
      where: { agencyId_phoneE164: { agencyId, phoneE164 } },
      create: {
        id: randomUUID(),
        agencyId,
        phoneE164,
        optedOutAt: at,
      },
      update: {
        optedOutAt: at,
      },
    });
  }
}
