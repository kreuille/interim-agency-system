import type {
  AuditAction,
  AuditActorKind,
  AuditDiff,
  AuditLogEntryProps,
} from '../audit-log-entry.js';

export interface AppendAuditEntryInput {
  readonly agencyId: string;
  readonly actorKind: AuditActorKind;
  readonly actorUserId?: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly action: AuditAction;
  readonly diff: AuditDiff;
  readonly occurredAt: Date;
  readonly ip?: string;
}

export interface AuditQuery {
  readonly agencyId: string;
  readonly entityType?: string;
  readonly entityId?: string;
  readonly actorUserId?: string;
  readonly from?: Date;
  readonly to?: Date;
  readonly limit?: number;
}

/**
 * Port d'audit log : append-only (pas d'API d'update/delete exposée).
 * `append()` calcule le hash chaîné et persiste atomiquement.
 *
 * Le repository Prisma sous-jacent doit avoir un trigger Postgres qui
 * REVOKE UPDATE, DELETE pour empêcher l'altération côté DB.
 */
export interface AuditLogger {
  append(input: AppendAuditEntryInput): Promise<AuditLogEntryProps>;
  query(query: AuditQuery): Promise<readonly AuditLogEntryProps[]>;
}
