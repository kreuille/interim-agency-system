import type { PrismaClient } from '@prisma/client';
import type { AuditLogger, WorkerAuditEntry } from '@interim/application';

export class PrismaAuditLogger implements AuditLogger {
  constructor(private readonly prisma: PrismaClient) {}

  async record(entry: WorkerAuditEntry): Promise<void> {
    await this.prisma.auditLogEntry.create({
      data: {
        agencyId: entry.agencyId,
        actorId: entry.actorUserId ?? null,
        action: kindToAction(entry.kind),
        entityType: 'TempWorker',
        entityId: entry.workerId,
        diff: entry.diff as never,
        occurredAt: entry.occurredAt,
      },
    });
  }
}

function kindToAction(kind: WorkerAuditEntry['kind']): 'CREATE' | 'UPDATE' | 'DELETE' {
  switch (kind) {
    case 'WorkerRegistered':
      return 'CREATE';
    case 'WorkerUpdated':
      return 'UPDATE';
    case 'WorkerArchived':
      return 'DELETE';
  }
}
