import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { FixedClock } from '@interim/shared';
import { asAgencyId, asStaffId, asWorkerAvailabilityId, WorkerAvailability } from '@interim/domain';
import { PrismaWorkerAvailabilityRepository } from './worker-availability.repository.js';

const NOW = new Date('2026-04-22T08:00:00Z');
const clock = new FixedClock(NOW);
const AGENCY_A = asAgencyId('00000000-0000-4000-a000-000000000001');
const AGENCY_B = asAgencyId('00000000-0000-4000-a000-000000000002');
const WORKER_1 = asStaffId('00000000-0000-4000-b000-000000000001');

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let repo: PrismaWorkerAvailabilityRepository;

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
  repo = new PrismaWorkerAvailabilityRepository(prisma);
}, 90_000);

afterAll(async () => {
  await prisma.$disconnect();
  await container.stop();
});

beforeEach(async () => {
  await prisma.workerAvailabilitySnapshot.deleteMany();
});

describe('PrismaWorkerAvailabilityRepository', () => {
  it('round-trip : save puis findByWorker renvoie l’aggrégat avec les slots', async () => {
    const wa = WorkerAvailability.create({
      id: asWorkerAvailabilityId(randomUUID()),
      agencyId: AGENCY_A,
      workerId: WORKER_1,
      clock,
    });
    wa.addSlot(
      {
        dateFrom: new Date('2026-04-22T08:00:00Z'),
        dateTo: new Date('2026-04-22T17:00:00Z'),
        status: 'available',
        source: 'internal',
      },
      clock,
    );
    wa.addSlot(
      {
        dateFrom: new Date('2026-04-23T09:00:00Z'),
        dateTo: new Date('2026-04-23T18:00:00Z'),
        status: 'unavailable',
        source: 'worker_self',
        reason: 'training',
        rrule: 'FREQ=WEEKLY;BYDAY=TH',
      },
      clock,
    );
    await repo.save(wa);

    const loaded = await repo.findByWorker(AGENCY_A, WORKER_1);
    expect(loaded).toBeDefined();
    const snap = loaded?.toSnapshot();
    expect(snap?.slots).toHaveLength(2);
    expect(snap?.slots[0]?.status).toBe('available');
    expect(snap?.slots[1]?.reason).toBe('training');
    expect(snap?.slots[1]?.rrule).toBe('FREQ=WEEKLY;BYDAY=TH');
  });

  it('findByWorker renvoie undefined si aucun snapshot', async () => {
    expect(await repo.findByWorker(AGENCY_A, WORKER_1)).toBeUndefined();
  });

  it('isolation tenant : agency_b ne voit pas les snapshots de agency_a', async () => {
    const wa = WorkerAvailability.create({
      id: asWorkerAvailabilityId(randomUUID()),
      agencyId: AGENCY_A,
      workerId: WORKER_1,
      clock,
    });
    wa.addSlot(
      {
        dateFrom: new Date('2026-04-22T08:00:00Z'),
        dateTo: new Date('2026-04-22T17:00:00Z'),
        status: 'available',
        source: 'internal',
      },
      clock,
    );
    await repo.save(wa);

    expect(await repo.findByWorker(AGENCY_B, WORKER_1)).toBeUndefined();
  });

  it('save upsert : modifier un slot puis re-save ne crée pas de doublon', async () => {
    const wa = WorkerAvailability.create({
      id: asWorkerAvailabilityId(randomUUID()),
      agencyId: AGENCY_A,
      workerId: WORKER_1,
      clock,
    });
    wa.addSlot(
      {
        dateFrom: new Date('2026-04-22T08:00:00Z'),
        dateTo: new Date('2026-04-22T17:00:00Z'),
        status: 'available',
        source: 'internal',
      },
      clock,
    );
    await repo.save(wa);
    wa.addSlot(
      {
        dateFrom: new Date('2026-04-23T08:00:00Z'),
        dateTo: new Date('2026-04-23T17:00:00Z'),
        status: 'available',
        source: 'internal',
      },
      clock,
    );
    await repo.save(wa);

    const count = await prisma.workerAvailabilitySnapshot.count({
      where: { agencyId: AGENCY_A, workerId: WORKER_1 },
    });
    expect(count).toBe(1);
    const loaded = await repo.findByWorker(AGENCY_A, WORKER_1);
    expect(loaded?.toSnapshot().slots).toHaveLength(2);
  });
});
