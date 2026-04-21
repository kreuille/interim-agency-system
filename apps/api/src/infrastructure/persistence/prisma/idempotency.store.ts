import type { PrismaClient } from '@prisma/client';
import type {
  CachedResponse,
  IdempotencyStore,
} from '../../../shared/middleware/idempotency.middleware.js';

export class PrismaIdempotencyStore implements IdempotencyStore {
  constructor(private readonly prisma: PrismaClient) {}

  async find(agencyId: string, key: string): Promise<CachedResponse | null> {
    const row = await this.prisma.inboundIdempotencyKey.findUnique({
      where: { agencyId_idempotencyKey: { agencyId, idempotencyKey: key } },
    });
    if (!row) return null;
    return {
      method: row.method,
      path: row.path,
      requestHash: row.requestHash,
      responseStatus: row.responseStatus,
      responseBody: row.responseBody,
      expiresAt: row.expiresAt,
    };
  }

  async save(agencyId: string, key: string, entry: CachedResponse): Promise<void> {
    await this.prisma.inboundIdempotencyKey.upsert({
      where: { agencyId_idempotencyKey: { agencyId, idempotencyKey: key } },
      create: {
        agencyId,
        idempotencyKey: key,
        method: entry.method,
        path: entry.path,
        requestHash: entry.requestHash,
        responseStatus: entry.responseStatus,
        responseBody: entry.responseBody as never,
        expiresAt: entry.expiresAt,
      },
      update: {
        method: entry.method,
        path: entry.path,
        requestHash: entry.requestHash,
        responseStatus: entry.responseStatus,
        responseBody: entry.responseBody as never,
        expiresAt: entry.expiresAt,
      },
    });
  }
}
