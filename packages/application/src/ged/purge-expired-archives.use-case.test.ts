import { describe, expect, it } from 'vitest';
import { FixedClock } from '@interim/shared';
import { asAgencyId, LegalArchiveEntry } from '@interim/domain';
import { PurgeExpiredArchivesUseCase } from './purge-expired-archives.use-case.js';
import { InMemoryLegalArchiveRepository, InMemoryLegalArchiveStorage } from './test-helpers.js';

const AGENCY = asAgencyId('agency-a');
const SHA = 'b'.repeat(64);

async function seedEntry(
  repo: InMemoryLegalArchiveRepository,
  storage: InMemoryLegalArchiveStorage,
  opts: {
    readonly id: string;
    readonly archivedAt: Date;
    readonly employmentEndedAt?: Date;
    readonly category?: 'mission_contract' | 'worker_legal_doc' | 'payslip';
  },
): Promise<string> {
  const cat = opts.category ?? 'mission_contract';
  const put = await storage.putImmutable({
    agencyId: AGENCY,
    category: cat,
    referenceEntityType: 'MissionContract',
    referenceEntityId: opts.id,
    bytes: new TextEncoder().encode(opts.id),
    mimeType: 'application/pdf',
    retentionUntil:
      cat === 'worker_legal_doc'
        ? new Date((opts.employmentEndedAt ?? opts.archivedAt).getTime() + 2 * 365 * 86400 * 1000)
        : cat === 'payslip'
          ? new Date(opts.archivedAt.getTime() + 5 * 365 * 86400 * 1000)
          : new Date(opts.archivedAt.getTime() + 10 * 365 * 86400 * 1000),
  });
  const entry = LegalArchiveEntry.create({
    id: opts.id,
    agencyId: AGENCY,
    category: cat,
    referenceEntityType: 'MissionContract',
    referenceEntityId: opts.id,
    storageKey: put.storageKey,
    sha256Hex: put.sha256Hex,
    sizeBytes: put.sizeBytes,
    mimeType: 'application/pdf',
    archivedAt: opts.archivedAt,
    ...(opts.employmentEndedAt ? { employmentEndedAt: opts.employmentEndedAt } : {}),
  });
  await repo.insert(entry);
  return put.storageKey;
  void SHA;
}

describe('PurgeExpiredArchivesUseCase', () => {
  it('purge uniquement les entrées dont rétention dépassée', async () => {
    const repo = new InMemoryLegalArchiveRepository();
    const storage = new InMemoryLegalArchiveStorage();
    const now = new Date('2036-04-23T00:00:00Z'); // >= 10 ans après 2026-04-22
    const key1 = await seedEntry(repo, storage, {
      id: 'old-1',
      archivedAt: new Date('2026-04-22T00:00:00Z'),
    });
    await seedEntry(repo, storage, {
      id: 'recent-1',
      archivedAt: new Date('2030-01-01T00:00:00Z'),
    });
    const useCase = new PurgeExpiredArchivesUseCase(repo, storage, new FixedClock(now));
    const out = await useCase.execute();
    expect(out.scanned).toBe(1);
    expect(out.purged).toBe(1);
    expect(out.retentionViolations).toBe(0);
    expect(storage.has(key1)).toBe(false);
    expect(repo.size()).toBe(1); // recent-1 reste
  });

  it('dry-run : aucune suppression effective', async () => {
    const repo = new InMemoryLegalArchiveRepository();
    const storage = new InMemoryLegalArchiveStorage();
    const now = new Date('2036-05-01T00:00:00Z');
    const key = await seedEntry(repo, storage, {
      id: 'dry-1',
      archivedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const useCase = new PurgeExpiredArchivesUseCase(repo, storage, new FixedClock(now));
    const out = await useCase.execute({ dryRun: true });
    expect(out.purged).toBe(1);
    expect(storage.has(key)).toBe(true);
    expect(repo.size()).toBe(1);
  });

  it('rien à purger si toutes sous rétention', async () => {
    const repo = new InMemoryLegalArchiveRepository();
    const storage = new InMemoryLegalArchiveStorage();
    await seedEntry(repo, storage, {
      id: 'young',
      archivedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const now = new Date('2027-01-01T00:00:00Z');
    const useCase = new PurgeExpiredArchivesUseCase(repo, storage, new FixedClock(now));
    const out = await useCase.execute();
    expect(out.scanned).toBe(0);
    expect(out.purged).toBe(0);
    expect(repo.size()).toBe(1);
  });

  it('storage lève RetentionViolation → compté + entrée non supprimée', async () => {
    const repo = new InMemoryLegalArchiveRepository();
    const storage = new InMemoryLegalArchiveStorage();
    // On seed une entrée dans le repo avec une rétention passée, mais
    // on manipule le storage blob pour avoir une rétention encore future
    // (simule un mismatch qui arrive si quelqu'un a modifié repo sans passer
    // par le flow normal).
    const put = await storage.putImmutable({
      agencyId: AGENCY,
      category: 'mission_contract',
      referenceEntityType: 'X',
      referenceEntityId: 'mismatch-1',
      bytes: new TextEncoder().encode('a'),
      mimeType: 'application/pdf',
      retentionUntil: new Date('2050-01-01T00:00:00Z'), // storage = future
    });
    const entry = LegalArchiveEntry.fromPersistence({
      id: 'arc-mismatch',
      agencyId: AGENCY,
      category: 'mission_contract',
      referenceEntityType: 'X',
      referenceEntityId: 'mismatch-1',
      storageKey: put.storageKey,
      sha256Hex: put.sha256Hex,
      sizeBytes: put.sizeBytes,
      mimeType: 'application/pdf',
      archivedAt: new Date('2010-01-01T00:00:00Z'),
      retentionUntil: new Date('2020-01-01T00:00:00Z'), // domain = passed
      metadata: {},
    });
    await repo.insert(entry);
    const now = new Date('2030-01-01T00:00:00Z');
    const useCase = new PurgeExpiredArchivesUseCase(repo, storage, new FixedClock(now));
    const out = await useCase.execute();
    expect(out.scanned).toBe(1);
    expect(out.purged).toBe(0);
    expect(out.retentionViolations).toBe(1);
    expect(storage.has(put.storageKey)).toBe(true); // blob intact
    expect(repo.size()).toBe(1); // entry intact
    expect(out.errors[0]?.reason).toMatch(/storage refused/);
  });

  it('limit respectée', async () => {
    const repo = new InMemoryLegalArchiveRepository();
    const storage = new InMemoryLegalArchiveStorage();
    for (let i = 0; i < 5; i++) {
      await seedEntry(repo, storage, {
        id: `old-${String(i)}`,
        archivedAt: new Date('2010-01-01T00:00:00Z'),
      });
    }
    const now = new Date('2030-01-01T00:00:00Z');
    const useCase = new PurgeExpiredArchivesUseCase(repo, storage, new FixedClock(now));
    const out = await useCase.execute({ limit: 2 });
    expect(out.scanned).toBe(2);
    expect(out.purged).toBe(2);
    expect(repo.size()).toBe(3);
  });

  it('compat catégories : payslip 5 ans, mission_contract 10 ans', async () => {
    const repo = new InMemoryLegalArchiveRepository();
    const storage = new InMemoryLegalArchiveStorage();
    await seedEntry(repo, storage, {
      id: 'ms-old',
      archivedAt: new Date('2020-04-22T00:00:00Z'),
      category: 'mission_contract',
    });
    await seedEntry(repo, storage, {
      id: 'ps-old',
      archivedAt: new Date('2020-04-22T00:00:00Z'),
      category: 'payslip',
    });
    const now = new Date('2026-01-01T00:00:00Z'); // > 5 ans mais < 10
    const useCase = new PurgeExpiredArchivesUseCase(repo, storage, new FixedClock(now));
    const out = await useCase.execute();
    // Seul payslip (5 ans) est purgeable. mission_contract (10 ans) reste.
    expect(out.purged).toBe(1);
    expect(repo.size()).toBe(1);
  });
});
