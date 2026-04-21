import type { AgencyId } from '@interim/domain';

export type WorkerAuditKind = 'WorkerRegistered' | 'WorkerUpdated' | 'WorkerArchived';

export interface WorkerAuditEntry {
  readonly kind: WorkerAuditKind;
  readonly agencyId: AgencyId;
  readonly workerId: string;
  readonly actorUserId?: string;
  readonly diff: {
    readonly before?: Record<string, unknown>;
    readonly after?: Record<string, unknown>;
  };
  readonly occurredAt: Date;
}

export interface AuditLogger {
  record(entry: WorkerAuditEntry): Promise<void>;
}
