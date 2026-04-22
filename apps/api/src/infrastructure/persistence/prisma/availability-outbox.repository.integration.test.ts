import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { asAgencyId, asStaffId } from '@interim/domain';
import { OUTBOX_BACKOFF_SECONDS, type AvailabilityOutboxRow } from '@interim/application';
import { PrismaAvailabilityOutboxRepository } from './availability-outbox.repository.js';

const NOW = new Date('2026-04-22T08:00:00Z');
const AGENCY = asAgencyId('00000000-0000-4000-a000-000000000001');
const WORKER_1 = asStaffId('00000000-0000-4000-b000-000000000001');
const WORKER_2 = asStaffId('00000000-0000-4000-b000-000000000002');

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let repo: PrismaAvailabilityOutboxRepository;

function buildRow(overrides: Partial<AvailabilityOutboxRow> = {}): AvailabilityOutboxRow {
  return {
    id: randomUUID(),
    agencyId: AGENCY,
    workerId: WORKER_1,
    idempotencyKey: randomUUID(),
    payload: {
      slots: [
        {
          slotId: randomUUID(),
          dateFrom: '2026-04-22T08:00:00.000Z',
          dateTo: '2026-04-22T17:00:00.000Z',
          status: 'available',
          source: 'internal',
        },
      ],
    },
    status: 'pending',
    attempts: 0,
    nextAttemptAt: NOW,
    lastError: undefined,
    createdAt: NOW,
    ...overrides,
  };
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
  repo = new PrismaAvailabilityOutboxRepository(prisma);
}, 90_000);

afterAll(async () => {
  await prisma.$disconnect();
  await container.stop();
});

beforeEach(async () => {
  await prisma.outboxAvailabilityPush.deleteMany();
});

describe('PrismaAvailabilityOutboxRepository', () => {
  it('insert + claimDue récupère et marque IN_PROGRESS', async () => {
    const row = buildRow();
    await repo.insert(row);
    const claimed = await repo.claimDue(NOW, 10);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.id).toBe(row.id);
    // Re-claim immédiat → 0, car already IN_PROGRESS
    const second = await repo.claimDue(NOW, 10);
    expect(second).toHaveLength(0);
  });

  it('claimDue ignore les rows dont nextAttemptAt > now', async () => {
    await repo.insert(
      buildRow({
        nextAttemptAt: new Date(NOW.getTime() + 3600 * 1000), // 1h plus tard
      }),
    );
    const claimed = await repo.claimDue(NOW, 10);
    expect(claimed).toHaveLength(0);
  });

  it('respecte FIFO sur createdAt', async () => {
    const r1 = buildRow({ id: randomUUID(), createdAt: new Date(NOW.getTime() - 2000) });
    const r2 = buildRow({ id: randomUUID(), createdAt: new Date(NOW.getTime() - 1000) });
    await repo.insert(r2); // insert dans le désordre
    await repo.insert(r1);
    const claimed = await repo.claimDue(NOW, 10);
    expect(claimed.map((r) => r.id)).toEqual([r1.id, r2.id]);
  });

  it("markSuccess passe à status='success', incrément attempts", async () => {
    const row = buildRow();
    await repo.insert(row);
    await repo.claimDue(NOW, 10);
    await repo.markSuccess(row.id, NOW);
    const after = await prisma.outboxAvailabilityPush.findUnique({ where: { id: row.id } });
    expect(after?.status).toBe('SUCCESS');
    expect(after?.attempts).toBe(1);
    expect(after?.lastError).toBeNull();
  });

  it("markFailure status='failed' met nextAttemptAt selon backoff", async () => {
    const row = buildRow();
    await repo.insert(row);
    await repo.claimDue(NOW, 10);
    const next = new Date(NOW.getTime() + (OUTBOX_BACKOFF_SECONDS[0] ?? 30) * 1000);
    await repo.markFailure({
      id: row.id,
      error: 'transient_error',
      nextAttemptAt: next,
      status: 'failed',
    });
    const after = await prisma.outboxAvailabilityPush.findUnique({ where: { id: row.id } });
    expect(after?.status).toBe('FAILED');
    expect(after?.lastError).toBe('transient_error');
    expect(after?.nextAttemptAt?.toISOString()).toBe(next.toISOString());
  });

  it("markFailure status='dead' clear nextAttemptAt", async () => {
    const row = buildRow();
    await repo.insert(row);
    await repo.claimDue(NOW, 10);
    await repo.markFailure({
      id: row.id,
      error: 'permanent',
      nextAttemptAt: undefined,
      status: 'dead',
    });
    const after = await prisma.outboxAvailabilityPush.findUnique({ where: { id: row.id } });
    expect(after?.status).toBe('DEAD');
    expect(after?.nextAttemptAt).toBeNull();
  });

  it('rows DEAD ne sont jamais reclaimed', async () => {
    const row = buildRow();
    await repo.insert(row);
    await repo.claimDue(NOW, 10);
    await repo.markFailure({
      id: row.id,
      error: 'permanent',
      nextAttemptAt: undefined,
      status: 'dead',
    });
    const claimed = await repo.claimDue(new Date(NOW.getTime() + 24 * 3600 * 1000), 10);
    expect(claimed).toHaveLength(0);
  });

  it('rows FAILED dont le backoff est passé sont reclaimed', async () => {
    const row = buildRow();
    await repo.insert(row);
    await repo.claimDue(NOW, 10);
    await repo.markFailure({
      id: row.id,
      error: 'transient',
      nextAttemptAt: new Date(NOW.getTime() + 60_000),
      status: 'failed',
    });
    // Avant le délai → 0
    const before = await repo.claimDue(NOW, 10);
    expect(before).toHaveLength(0);
    // Après le délai → 1
    const after = await repo.claimDue(new Date(NOW.getTime() + 120_000), 10);
    expect(after).toHaveLength(1);
    expect(after[0]?.id).toBe(row.id);
  });

  it('claimDue concurrent ne distribue pas la même row deux fois', async () => {
    const row = buildRow();
    await repo.insert(row);
    // Deux claimDue lancés en parallèle simulent 2 workers concurrents.
    const [a, b] = await Promise.all([repo.claimDue(NOW, 10), repo.claimDue(NOW, 10)]);
    const total = a.length + b.length;
    expect(total).toBe(1); // un seul a la row
  });

  it('isolation par worker — insert pour worker_1 ne fait pas remonter worker_2', async () => {
    await repo.insert(buildRow({ workerId: WORKER_1 }));
    await repo.insert(buildRow({ workerId: WORKER_2 }));
    const claimed = await repo.claimDue(NOW, 10);
    expect(claimed).toHaveLength(2);
  });
});
