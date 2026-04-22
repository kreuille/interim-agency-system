import { describe, expect, it } from 'vitest';
import { FixedClock } from '@interim/shared';
import { asAgencyId, LegalArchiveEntry } from '@interim/domain';
import {
  InMemoryLegalArchiveRepository,
  InMemoryLegalArchiveStorage,
  PurgeExpiredArchivesUseCase,
} from '@interim/application';
import { GED_PURGE_QUEUE_NAME, GED_PURGE_REPEAT_CRON } from './ged-purge.worker.js';

const SHA = 'a'.repeat(64);

/**
 * Smoke test : on n'instancie pas BullMQ (besoin Redis), mais on
 * vérifie que la logique métier déléguée fonctionne (PurgeExpiredArchives).
 * Le wiring BullMQ + repeat cron est trivial et couvert par le smoke test
 * docker-compose en CI (DETTE-049).
 */
describe('ged-purge worker', () => {
  it('queue name + cron configurés', () => {
    expect(GED_PURGE_QUEUE_NAME).toBe('ged-purge');
    expect(GED_PURGE_REPEAT_CRON).toBe('0 3 1 * *'); // 1er du mois 03h00
  });

  it('use case purge correctement les entries dont retention dépassée', async () => {
    const repo = new InMemoryLegalArchiveRepository();
    const storage = new InMemoryLegalArchiveStorage();
    // 2 entries vieilles (10 ans dépassés) + 1 récente
    for (const id of ['old-1', 'old-2']) {
      const put = await storage.putImmutable({
        agencyId: asAgencyId('agency-a'),
        category: 'mission_contract',
        referenceEntityType: 'MissionContract',
        referenceEntityId: id,
        bytes: new TextEncoder().encode(id),
        mimeType: 'application/pdf',
        retentionUntil: new Date('2025-01-01T00:00:00Z'), // already expired in 2036 test now
      });
      await repo.insert(
        LegalArchiveEntry.fromPersistence({
          id,
          agencyId: asAgencyId('agency-a'),
          category: 'mission_contract',
          referenceEntityType: 'MissionContract',
          referenceEntityId: id,
          storageKey: put.storageKey,
          sha256Hex: SHA,
          sizeBytes: 100,
          mimeType: 'application/pdf',
          archivedAt: new Date('2010-01-01T00:00:00Z'),
          retentionUntil: new Date('2020-01-01T00:00:00Z'),
          metadata: {},
        }),
      );
    }
    const recentPut = await storage.putImmutable({
      agencyId: asAgencyId('agency-a'),
      category: 'mission_contract',
      referenceEntityType: 'MissionContract',
      referenceEntityId: 'recent',
      bytes: new TextEncoder().encode('recent'),
      mimeType: 'application/pdf',
      retentionUntil: new Date('2099-01-01T00:00:00Z'),
    });
    await repo.insert(
      LegalArchiveEntry.create({
        id: 'recent',
        agencyId: asAgencyId('agency-a'),
        category: 'mission_contract',
        referenceEntityType: 'MissionContract',
        referenceEntityId: 'recent',
        storageKey: recentPut.storageKey,
        sha256Hex: recentPut.sha256Hex,
        sizeBytes: recentPut.sizeBytes,
        mimeType: 'application/pdf',
        archivedAt: new Date('2025-01-01T00:00:00Z'),
      }),
    );

    const useCase = new PurgeExpiredArchivesUseCase(
      repo,
      storage,
      new FixedClock(new Date('2030-01-01T00:00:00Z')),
    );
    const out = await useCase.execute({ limit: 10 });
    expect(out.scanned).toBe(2);
    expect(out.purged).toBe(2);
    expect(out.retentionViolations).toBe(0);
    expect(repo.size()).toBe(1);
  });
});
