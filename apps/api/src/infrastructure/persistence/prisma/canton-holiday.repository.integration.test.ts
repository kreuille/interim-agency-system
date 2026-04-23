import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import type { CantonHolidayPersisted } from '@interim/domain';
import { PrismaCantonHolidayRepository } from './canton-holiday.repository.js';

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let repo: PrismaCantonHolidayRepository;

function makePersisted(
  canton: string,
  date: string,
  label: string,
  scope: 'federal' | 'cantonal' = 'cantonal',
  validFrom = '2024-01-01',
  validTo: string | null = null,
): CantonHolidayPersisted {
  return { canton, date, label, scope, paid: true, validFrom, validTo };
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const url = container.getConnectionUri();
  execSync('pnpm exec prisma migrate deploy', {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
  prisma = new PrismaClient({ datasources: { db: { url } } });
  await prisma.$connect();
  repo = new PrismaCantonHolidayRepository(prisma);
}, 90_000);

afterAll(async () => {
  await prisma.$disconnect();
  await container.stop();
});

beforeEach(async () => {
  await prisma.cantonHoliday.deleteMany();
});

describe('PrismaCantonHolidayRepository — DETTE-036', () => {
  it('upsertMany insère et preload retrouve les rows pour une année', async () => {
    await repo.upsertMany([
      makePersisted('GE', '2026-01-01', 'Nouvel An', 'federal'),
      makePersisted('GE', '2026-12-12', 'Escalade', 'cantonal'),
      makePersisted('GE', '2026-12-31', 'Restauration', 'cantonal'),
    ]);
    const list = await repo.preload('GE', 2026);
    expect(list.map((h) => h.date)).toEqual(['2026-01-01', '2026-12-12', '2026-12-31']);
    expect(list[1]?.label).toBe('Escalade');
    expect(list[1]?.scope).toBe('cantonal');
    expect(list[1]?.paid).toBe(true);
  });

  it('forCantonAndYear est SYNC : retourne [] avant preload (cache miss)', async () => {
    await repo.upsertMany([makePersisted('VD', '2026-12-26', 'Saint-Étienne')]);
    // Pas de preload → cache vide
    expect(repo.forCantonAndYear('VD', 2026)).toEqual([]);
    // Après preload → rempli
    await repo.preload('VD', 2026);
    expect(repo.forCantonAndYear('VD', 2026).map((h) => h.date)).toContain('2026-12-26');
  });

  it('isHoliday utilise le cache préchargé', async () => {
    await repo.upsertMany([makePersisted('GE', '2026-12-12', 'Escalade')]);
    await repo.preload('GE', 2026);
    expect(repo.isHoliday('GE', new Date('2026-12-12T12:00:00Z'))).toBe(true);
    expect(repo.isHoliday('GE', new Date('2026-12-13T12:00:00Z'))).toBe(false);
  });

  it('upsertMany idempotent : deuxième appel met à jour le label', async () => {
    await repo.upsertMany([makePersisted('GE', '2026-12-12', 'Escalade v1')]);
    await repo.upsertMany([makePersisted('GE', '2026-12-12', 'Escalade v2')]);
    const all = await repo.listAllVersions('GE');
    expect(all).toHaveLength(1);
    expect(all[0]?.label).toBe('Escalade v2');
  });

  it('versioning : un row avec validTo antérieur à la date est exclu de preload', async () => {
    await repo.upsertMany([
      makePersisted(
        'GE',
        '2026-12-12',
        'Escalade obsolète',
        'cantonal',
        '2020-01-01',
        '2025-12-31',
      ),
    ]);
    const list = await repo.preload('GE', 2026);
    expect(list).toHaveLength(0);
  });

  it("versioning : un row avec validFrom postérieur à l'année est exclu", async () => {
    await repo.upsertMany([
      makePersisted('GE', '2026-12-12', 'Future', 'cantonal', '2027-01-01', null),
    ]);
    const list = await repo.preload('GE', 2026);
    expect(list).toHaveLength(0);
  });

  it('upsertMany invalide le cache des cantons touchés', async () => {
    await repo.upsertMany([makePersisted('VS', '2026-03-19', 'Saint-Joseph')]);
    await repo.preload('VS', 2026);
    expect(repo.forCantonAndYear('VS', 2026)).toHaveLength(1);
    // Nouveau upsert → cache invalidé
    await repo.upsertMany([makePersisted('VS', '2026-08-15', 'Assomption')]);
    expect(repo.forCantonAndYear('VS', 2026)).toEqual([]); // cache vidé
    // Re-preload → 2 rows
    await repo.preload('VS', 2026);
    expect(repo.forCantonAndYear('VS', 2026)).toHaveLength(2);
  });

  it('listAllVersions retourne toutes les versions triées', async () => {
    await repo.upsertMany([
      makePersisted('GE', '2026-12-12', 'Escalade v1', 'cantonal', '2020-01-01', '2025-12-31'),
      makePersisted('GE', '2026-12-12', 'Escalade v2', 'cantonal', '2026-01-01', null),
      makePersisted('GE', '2026-12-31', 'Restauration', 'cantonal', '2024-01-01', null),
    ]);
    const all = await repo.listAllVersions('GE');
    expect(all).toHaveLength(3);
    // Tri : par date puis validFrom
    expect(all[0]?.label).toBe('Escalade v1');
    expect(all[1]?.label).toBe('Escalade v2');
    expect(all[2]?.label).toBe('Restauration');
  });

  it('isolation entre cantons : preload GE ne pollue pas VD', async () => {
    await repo.upsertMany([
      makePersisted('GE', '2026-12-12', 'Escalade'),
      makePersisted('VD', '2026-12-26', 'Saint-Étienne'),
    ]);
    await repo.preload('GE', 2026);
    expect(repo.forCantonAndYear('GE', 2026)).toHaveLength(1);
    expect(repo.forCantonAndYear('VD', 2026)).toEqual([]); // pas encore préchargé
    await repo.preload('VD', 2026);
    expect(repo.forCantonAndYear('VD', 2026)).toHaveLength(1);
  });
});
