export type ClientAuditKind =
  | 'ClientRegistered'
  | 'ClientUpdated'
  | 'ClientStatusChanged'
  | 'ClientArchived';

export interface ClientAuditEntry {
  readonly kind: ClientAuditKind;
  readonly agencyId: string;
  readonly clientId: string;
  readonly actorUserId?: string;
  readonly diff: Record<string, unknown>;
  readonly occurredAt: Date;
}

export interface ClientAuditLogger {
  record(entry: ClientAuditEntry): Promise<void>;
}
