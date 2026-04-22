import { describe, it, expect } from 'vitest';
import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_KINDS,
  AUDIT_GENESIS_HASH,
  InvalidAuditChain,
  SENSITIVE_ENTITY_TYPES,
  computeEntryHash,
  verifyAuditChain,
  type AuditLogEntryProps,
} from './audit-log-entry.js';

describe('audit-log-entry constants', () => {
  it('lists 4 actor kinds', () => {
    expect(AUDIT_ACTOR_KINDS).toEqual(['user', 'system', 'webhook_mp', 'job']);
  });

  it('lists 7 actions', () => {
    expect(AUDIT_ACTIONS).toEqual([
      'created',
      'updated',
      'archived',
      'deleted',
      'signed',
      'validated',
      'rejected',
    ]);
  });

  it('lists 10 sensitive entity types (per CLAUDE.md §3.4)', () => {
    expect(SENSITIVE_ENTITY_TYPES).toHaveLength(10);
    expect(SENSITIVE_ENTITY_TYPES).toContain('TempWorker');
    expect(SENSITIVE_ENTITY_TYPES).toContain('Payslip');
  });

  it('genesis hash is 64 zeros', () => {
    expect(AUDIT_GENESIS_HASH).toMatch(/^0{64}$/);
  });
});

describe('computeEntryHash', () => {
  it('produces a 64-char hex string', () => {
    const h = computeEntryHash({
      prevHash: AUDIT_GENESIS_HASH,
      entityType: 'TempWorker',
      entityId: 'w-1',
      action: 'created',
      actorKind: 'user',
      actorUserId: 'u-1',
      occurredAt: new Date('2026-04-22T08:00:00Z'),
      diff: { after: { firstName: 'Jean' } },
    });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('different content → different hash', () => {
    const base = {
      prevHash: AUDIT_GENESIS_HASH,
      entityType: 'TempWorker',
      entityId: 'w-1',
      action: 'created' as const,
      actorKind: 'user' as const,
      actorUserId: 'u-1',
      occurredAt: new Date('2026-04-22T08:00:00Z'),
      diff: { after: { firstName: 'Jean' } },
    };
    const h1 = computeEntryHash(base);
    const h2 = computeEntryHash({ ...base, diff: { after: { firstName: 'Marie' } } });
    expect(h1).not.toBe(h2);
  });
});

function makeEntry(
  id: string,
  prevHash: string,
  overrides?: Partial<Omit<AuditLogEntryProps, 'id' | 'prevHash' | 'entryHash'>>,
): AuditLogEntryProps {
  const base: Omit<AuditLogEntryProps, 'entryHash'> = {
    id,
    agencyId: 'agency-a',
    actorKind: overrides?.actorKind ?? 'user',
    actorUserId: overrides?.actorUserId ?? 'u-1',
    entityType: overrides?.entityType ?? 'TempWorker',
    entityId: overrides?.entityId ?? 'w-1',
    action: overrides?.action ?? 'created',
    diff: overrides?.diff ?? { after: { firstName: 'Jean' } },
    occurredAt: overrides?.occurredAt ?? new Date('2026-04-22T08:00:00Z'),
    prevHash,
  };
  return {
    ...base,
    entryHash: computeEntryHash({
      prevHash,
      entityType: base.entityType,
      entityId: base.entityId,
      action: base.action,
      actorKind: base.actorKind,
      actorUserId: base.actorUserId,
      occurredAt: base.occurredAt,
      diff: base.diff,
    }),
  };
}

describe('verifyAuditChain', () => {
  it('valid chain of 3 entries passes', () => {
    const e1 = makeEntry('1', AUDIT_GENESIS_HASH);
    const e2 = makeEntry('2', e1.entryHash, { action: 'updated', entityId: 'w-1' });
    const e3 = makeEntry('3', e2.entryHash, { action: 'archived' });
    expect(() => {
      verifyAuditChain([e1, e2, e3]);
    }).not.toThrow();
  });

  it('throws InvalidAuditChain when prevHash is wrong', () => {
    const e1 = makeEntry('1', AUDIT_GENESIS_HASH);
    const e2 = makeEntry('2', '0'.repeat(64), { action: 'updated' }); // mauvais prevHash
    expect(() => {
      verifyAuditChain([e1, e2]);
    }).toThrow(InvalidAuditChain);
  });

  it('throws InvalidAuditChain when entryHash is tampered', () => {
    const e1 = makeEntry('1', AUDIT_GENESIS_HASH);
    const tampered: AuditLogEntryProps = { ...e1, entryHash: 'a'.repeat(64) };
    expect(() => {
      verifyAuditChain([tampered]);
    }).toThrow(InvalidAuditChain);
  });

  it('empty chain is valid', () => {
    expect(() => {
      verifyAuditChain([]);
    }).not.toThrow();
  });
});
