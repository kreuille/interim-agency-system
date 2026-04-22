import { createHash } from 'node:crypto';
import { DomainError } from '../workers/errors.js';

export const AUDIT_ACTOR_KINDS = ['user', 'system', 'webhook_mp', 'job'] as const;
export type AuditActorKind = (typeof AUDIT_ACTOR_KINDS)[number];

export const AUDIT_ACTIONS = [
  'created',
  'updated',
  'archived',
  'deleted',
  'signed',
  'validated',
  'rejected',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const SENSITIVE_ENTITY_TYPES = [
  'TempWorker',
  'WorkerDocument',
  'Client',
  'ClientContract',
  'RateCard',
  'MissionContract',
  'Timesheet',
  'Payslip',
  'Invoice',
  'LseAuthorization',
] as const;
export type SensitiveEntityType = (typeof SENSITIVE_ENTITY_TYPES)[number];

export interface AuditLogEntryProps {
  readonly id: string;
  readonly agencyId: string;
  readonly actorKind: AuditActorKind;
  readonly actorUserId?: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly action: AuditAction;
  readonly diff: AuditDiff;
  readonly occurredAt: Date;
  readonly ip?: string;
  readonly prevHash: string;
  readonly entryHash: string;
}

export interface AuditDiff {
  readonly before?: Record<string, unknown>;
  readonly after?: Record<string, unknown>;
}

export class InvalidAuditChain extends DomainError {
  constructor(reason: string) {
    super('invalid_audit_chain', `Chaîne d'audit log corrompue : ${reason}`);
  }
}

export const AUDIT_GENESIS_HASH = '0'.repeat(64);

/**
 * Calcule le hash chaîné d'une entrée d'audit log :
 *   sha256( prevHash | entityType:entityId | action | actorKind:actorUserId | occurredAt | diff )
 *
 * Permet de détecter une falsification a posteriori (un attaquant qui édite
 * la table audit_logs casse la chaîne).
 */
export function computeEntryHash(input: {
  prevHash: string;
  entityType: string;
  entityId: string;
  action: AuditAction;
  actorKind: AuditActorKind;
  actorUserId: string | undefined;
  occurredAt: Date;
  diff: AuditDiff;
}): string {
  const parts = [
    input.prevHash,
    `${input.entityType}:${input.entityId}`,
    input.action,
    `${input.actorKind}:${input.actorUserId ?? 'null'}`,
    input.occurredAt.toISOString(),
    JSON.stringify(input.diff),
  ].join('|');
  return createHash('sha256').update(parts).digest('hex');
}

/**
 * Vérifie l'intégrité d'une chaîne d'audit log : chaque `entryHash` doit
 * être recalculable à partir de `prevHash` (chaîne du précédent) + contenu.
 *
 * @throws InvalidAuditChain au premier hash incorrect
 */
export function verifyAuditChain(entries: readonly AuditLogEntryProps[]): void {
  let expectedPrev = AUDIT_GENESIS_HASH;
  for (const e of entries) {
    if (e.prevHash !== expectedPrev) {
      throw new InvalidAuditChain(
        `Entry ${e.id} a prevHash=${e.prevHash}, attendu ${expectedPrev}`,
      );
    }
    const recomputed = computeEntryHash({
      prevHash: e.prevHash,
      entityType: e.entityType,
      entityId: e.entityId,
      action: e.action,
      actorKind: e.actorKind,
      actorUserId: e.actorUserId,
      occurredAt: e.occurredAt,
      diff: e.diff,
    });
    if (recomputed !== e.entryHash) {
      throw new InvalidAuditChain(
        `Entry ${e.id} a entryHash=${e.entryHash}, recalculé ${recomputed}`,
      );
    }
    expectedPrev = e.entryHash;
  }
}
