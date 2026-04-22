import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { asAgencyId } from '@interim/domain';
import { PrismaInboundWebhookRepository } from './inbound-webhook.repository.js';

const NOW = new Date('2026-04-22T08:00:00Z');
const AGENCY = asAgencyId('00000000-0000-4000-a000-000000000001');

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let repo: PrismaInboundWebhookRepository;

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
  repo = new PrismaInboundWebhookRepository(prisma);
}, 90_000);

afterAll(async () => {
  await prisma.$disconnect();
  await container.stop();
});

beforeEach(async () => {
  await prisma.inboundWebhookEvent.deleteMany();
});

describe('PrismaInboundWebhookRepository', () => {
  it('insertIfNew → inserted true sur eventId nouveau', async () => {
    const id = randomUUID();
    const result = await repo.insertIfNew({
      id,
      agencyId: AGENCY,
      eventId: 'mp-evt-1',
      eventType: 'worker.assignment.proposed',
      signature: 'sha256=abc',
      payload: { requestId: 'r-1' },
      headers: {},
      receivedAt: NOW,
    });
    expect(result.inserted).toBe(true);
    if (result.inserted) expect(result.id).toBe(id);
  });

  it('insertIfNew sur eventId existant → duplicate (pas de doublon)', async () => {
    await repo.insertIfNew({
      id: randomUUID(),
      agencyId: AGENCY,
      eventId: 'mp-evt-1',
      eventType: 'x',
      signature: 'sig',
      payload: {},
      headers: {},
      receivedAt: NOW,
    });
    const second = await repo.insertIfNew({
      id: randomUUID(),
      agencyId: AGENCY,
      eventId: 'mp-evt-1',
      eventType: 'x',
      signature: 'sig',
      payload: {},
      headers: {},
      receivedAt: NOW,
    });
    expect(second.inserted).toBe(false);
    expect(await prisma.inboundWebhookEvent.count({ where: { eventId: 'mp-evt-1' } })).toBe(1);
  });

  it('findById renvoie le record avec status PENDING par défaut', async () => {
    const id = randomUUID();
    await repo.insertIfNew({
      id,
      agencyId: AGENCY,
      eventId: 'mp-evt-2',
      eventType: 'x',
      signature: 'sig',
      payload: { ok: true },
      headers: { h: 'v' },
      receivedAt: NOW,
    });
    const found = await repo.findById(id);
    expect(found?.id).toBe(id);
    expect(found?.status).toBe('PENDING');
    expect(found?.payload).toEqual({ ok: true });
  });

  it('markProcessing → status PROCESSING', async () => {
    const id = randomUUID();
    await repo.insertIfNew({
      id,
      agencyId: AGENCY,
      eventId: 'mp-evt-3',
      eventType: 'x',
      signature: 'sig',
      payload: {},
      headers: {},
      receivedAt: NOW,
    });
    await repo.markProcessing(id, NOW);
    const found = await repo.findById(id);
    expect(found?.status).toBe('PROCESSING');
  });

  it('markProcessed → status PROCESSED + processedAt', async () => {
    const id = randomUUID();
    await repo.insertIfNew({
      id,
      agencyId: AGENCY,
      eventId: 'mp-evt-4',
      eventType: 'x',
      signature: 'sig',
      payload: {},
      headers: {},
      receivedAt: NOW,
    });
    await repo.markProcessed(id, NOW);
    const found = await repo.findById(id);
    expect(found?.status).toBe('PROCESSED');
    expect(found?.processedAt?.toISOString()).toBe(NOW.toISOString());
  });

  it('markFailed → status FAILED + retryCount++ + errorMessage', async () => {
    const id = randomUUID();
    await repo.insertIfNew({
      id,
      agencyId: AGENCY,
      eventId: 'mp-evt-5',
      eventType: 'x',
      signature: 'sig',
      payload: {},
      headers: {},
      receivedAt: NOW,
    });
    await repo.markFailed({ id, errorMessage: 'boom' });
    const found = await repo.findById(id);
    expect(found?.status).toBe('FAILED');
    expect(found?.errorMessage).toBe('boom');
    expect(found?.retryCount).toBe(1);
  });

  it('isolation tenant : agency_b ne voit pas les events de agency_a', async () => {
    const otherAgency = asAgencyId('00000000-0000-4000-a000-000000000002');
    const id = randomUUID();
    await repo.insertIfNew({
      id,
      agencyId: AGENCY,
      eventId: 'mp-evt-6',
      eventType: 'x',
      signature: 'sig',
      payload: {},
      headers: {},
      receivedAt: NOW,
    });
    const found = await repo.findById(id);
    expect(found?.agencyId).toBe(AGENCY);
    expect(found?.agencyId).not.toBe(otherAgency);
  });
});
