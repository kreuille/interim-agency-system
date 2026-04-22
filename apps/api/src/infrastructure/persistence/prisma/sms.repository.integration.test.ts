import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { asAgencyId } from '@interim/domain';
import { PrismaSmsLogRepository } from './sms-log.repository.js';
import { PrismaSmsOptOutRepository } from './sms-opt-out.repository.js';

const NOW = new Date('2026-04-22T08:00:00Z');
const AGENCY = asAgencyId('00000000-0000-4000-a000-000000000001');
const AGENCY_B = asAgencyId('00000000-0000-4000-a000-000000000002');

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let logs: PrismaSmsLogRepository;
let optOuts: PrismaSmsOptOutRepository;

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
  logs = new PrismaSmsLogRepository(prisma);
  optOuts = new PrismaSmsOptOutRepository(prisma);
}, 90_000);

afterAll(async () => {
  await prisma.$disconnect();
  await container.stop();
});

beforeEach(async () => {
  await prisma.smsLog.deleteMany();
  await prisma.smsOptOut.deleteMany();
});

describe('PrismaSmsLogRepository', () => {
  it('insert + findRecent round-trip', async () => {
    const id = randomUUID();
    await logs.insert({
      id,
      agencyId: AGENCY,
      toMasked: '+4179*****67',
      templateCode: 'otp-signature',
      provider: 'noop',
      providerMessageId: 'noop-1',
      status: 'sent',
      sentAt: NOW,
      failureReason: undefined,
      createdAt: NOW,
    });
    const recent = await logs.findRecent(AGENCY, 10);
    expect(recent).toHaveLength(1);
    expect(recent[0]?.id).toBe(id);
    expect(recent[0]?.status).toBe('sent');
    expect(recent[0]?.toMasked).toBe('+4179*****67');
  });

  it('updateByProviderMessageId → status delivered + deliveredAt', async () => {
    const id = randomUUID();
    await logs.insert({
      id,
      agencyId: AGENCY,
      toMasked: '+4179*****67',
      templateCode: 'proposal-new',
      provider: 'noop',
      providerMessageId: 'msg-42',
      status: 'sent',
      sentAt: NOW,
      failureReason: undefined,
      createdAt: NOW,
    });
    const deliveredAt = new Date(NOW.getTime() + 60_000);
    await logs.updateByProviderMessageId({
      providerMessageId: 'msg-42',
      provider: 'noop',
      status: 'delivered',
      deliveredAt,
    });
    const recent = await logs.findRecent(AGENCY, 10);
    expect(recent[0]?.status).toBe('delivered');
    expect(recent[0]?.deliveredAt?.toISOString()).toBe(deliveredAt.toISOString());
  });

  it('isolation tenant : agency_b ne voit pas les logs de agency_a', async () => {
    await logs.insert({
      id: randomUUID(),
      agencyId: AGENCY,
      toMasked: '+4179*****67',
      templateCode: 'x',
      provider: 'noop',
      providerMessageId: 'm-1',
      status: 'sent',
      sentAt: NOW,
      failureReason: undefined,
      createdAt: NOW,
    });
    const recent = await logs.findRecent(AGENCY_B, 10);
    expect(recent).toHaveLength(0);
  });

  it('triés par createdAt desc + limit', async () => {
    for (let i = 0; i < 5; i++) {
      await logs.insert({
        id: randomUUID(),
        agencyId: AGENCY,
        toMasked: '+4179*****67',
        templateCode: 'x',
        provider: 'noop',
        providerMessageId: `m-${String(i)}`,
        status: 'sent',
        sentAt: new Date(NOW.getTime() + i * 1000),
        failureReason: undefined,
        createdAt: new Date(NOW.getTime() + i * 1000),
      });
    }
    const top3 = await logs.findRecent(AGENCY, 3);
    expect(top3).toHaveLength(3);
    expect(top3[0]?.providerMessageId).toBe('m-4');
    expect(top3[2]?.providerMessageId).toBe('m-2');
  });
});

describe('PrismaSmsOptOutRepository', () => {
  it('optOut puis isOptedOut → true', async () => {
    expect(await optOuts.isOptedOut(AGENCY, '+41791234567')).toBe(false);
    await optOuts.optOut(AGENCY, '+41791234567', NOW);
    expect(await optOuts.isOptedOut(AGENCY, '+41791234567')).toBe(true);
  });

  it('optOut idempotent (upsert)', async () => {
    await optOuts.optOut(AGENCY, '+41791234567', NOW);
    await optOuts.optOut(AGENCY, '+41791234567', new Date(NOW.getTime() + 60_000));
    const count = await prisma.smsOptOut.count({
      where: { agencyId: AGENCY, phoneE164: '+41791234567' },
    });
    expect(count).toBe(1);
  });

  it('isolation tenant : opt-out agency_a ne bloque pas agency_b', async () => {
    await optOuts.optOut(AGENCY, '+41791234567', NOW);
    expect(await optOuts.isOptedOut(AGENCY_B, '+41791234567')).toBe(false);
  });
});
