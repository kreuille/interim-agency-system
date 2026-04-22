import { describe, expect, it } from 'vitest';
import { FixedClock } from '@interim/shared';
import { asAgencyId, LegalArchiveEntry } from '@interim/domain';
import { GetArchiveDownloadUrlUseCase } from './get-archive-download-url.use-case.js';
import {
  InMemoryLegalArchiveAccessLogger,
  InMemoryLegalArchiveRepository,
  InMemoryLegalArchiveStorage,
} from './test-helpers.js';

const NOW = new Date('2026-04-22T08:00:00Z');
const AGENCY = asAgencyId('agency-a');
const SHA = 'a'.repeat(64);

async function makeCase() {
  const repo = new InMemoryLegalArchiveRepository();
  const storage = new InMemoryLegalArchiveStorage();
  const logger = new InMemoryLegalArchiveAccessLogger();
  const clock = new FixedClock(NOW);

  // Seed une entrée + son blob côté storage
  const put = await storage.putImmutable({
    agencyId: AGENCY,
    category: 'mission_contract',
    referenceEntityType: 'MissionContract',
    referenceEntityId: 'mc-1',
    bytes: new TextEncoder().encode('pdf-bytes'),
    mimeType: 'application/pdf',
    retentionUntil: new Date('2036-04-22T08:00:00Z'),
  });
  const entry = LegalArchiveEntry.create({
    id: 'arc-seed-1',
    agencyId: AGENCY,
    category: 'mission_contract',
    referenceEntityType: 'MissionContract',
    referenceEntityId: 'mc-1',
    storageKey: put.storageKey,
    sha256Hex: put.sha256Hex,
    sizeBytes: put.sizeBytes,
    mimeType: 'application/pdf',
    archivedAt: NOW,
  });
  await repo.insert(entry);

  const useCase = new GetArchiveDownloadUrlUseCase(repo, storage, logger, clock);
  return { repo, storage, logger, useCase, entryId: entry.id, storageKey: put.storageKey };
  void SHA;
}

describe('GetArchiveDownloadUrlUseCase', () => {
  it('genère URL signée + log accès avec purpose', async () => {
    const { useCase, logger, entryId } = await makeCase();
    const result = await useCase.execute({
      agencyId: AGENCY,
      archiveEntryId: entryId,
      actorUserId: 'u-admin-1',
      actorIp: '10.0.0.1',
      purpose: 'seco_audit',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.url).toMatch(/ged\.test\/signed/);
      expect(result.value.expiresAt.toISOString()).toBe(
        new Date(NOW.getTime() + 900 * 1000).toISOString(),
      );
    }
    expect(logger.entries).toHaveLength(1);
    const logged = logger.entries[0];
    expect(logged?.actorUserId).toBe('u-admin-1');
    expect(logged?.purpose).toBe('seco_audit');
    expect(logged?.actorIp).toBe('10.0.0.1');
    expect(logged?.category).toBe('mission_contract');
  });

  it('TTL custom respecté, capé à 3600s', async () => {
    const { useCase, entryId } = await makeCase();
    const r1 = await useCase.execute({
      agencyId: AGENCY,
      archiveEntryId: entryId,
      actorUserId: 'u-1',
      purpose: 'internal_review',
      ttlSeconds: 60,
    });
    if (r1.ok) {
      expect(r1.value.expiresAt.toISOString()).toBe(new Date(NOW.getTime() + 60_000).toISOString());
    }
    const r2 = await useCase.execute({
      agencyId: AGENCY,
      archiveEntryId: entryId,
      actorUserId: 'u-1',
      purpose: 'internal_review',
      ttlSeconds: 999999, // > 1h → clampé
    });
    if (r2.ok) {
      expect(r2.value.expiresAt.toISOString()).toBe(
        new Date(NOW.getTime() + 3600 * 1000).toISOString(),
      );
    }
  });

  it('archive introuvable → archive_not_found, pas de log', async () => {
    const { useCase, logger } = await makeCase();
    const r = await useCase.execute({
      agencyId: AGENCY,
      archiveEntryId: 'unknown',
      actorUserId: 'u-1',
      purpose: 'internal_review',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('archive_not_found');
    expect(logger.entries).toHaveLength(0); // pas d'accès loggé si archive introuvable
  });

  it('multi-tenant : autre agencyId → archive_not_found', async () => {
    const { useCase, entryId } = await makeCase();
    const r = await useCase.execute({
      agencyId: asAgencyId('agency-b'),
      archiveEntryId: entryId,
      actorUserId: 'u-b',
      purpose: 'internal_review',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('archive_not_found');
  });

  it('log inclut occurredAt = clock.now()', async () => {
    const { useCase, logger, entryId } = await makeCase();
    await useCase.execute({
      agencyId: AGENCY,
      archiveEntryId: entryId,
      actorUserId: 'u-1',
      purpose: 'tax_audit',
    });
    expect(logger.entries[0]?.occurredAt.toISOString()).toBe(NOW.toISOString());
  });
});
