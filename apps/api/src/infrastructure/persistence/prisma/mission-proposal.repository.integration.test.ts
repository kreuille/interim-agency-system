import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { FixedClock } from '@interim/shared';
import { asAgencyId, asMissionProposalId, MissionProposal } from '@interim/domain';
import { PrismaMissionProposalRepository } from './mission-proposal.repository.js';

const NOW = new Date('2026-04-22T08:00:00Z');
const clock = new FixedClock(NOW);
const AGENCY_A = asAgencyId('00000000-0000-4000-a000-000000000001');
const AGENCY_B = asAgencyId('00000000-0000-4000-a000-000000000002');

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let repo: PrismaMissionProposalRepository;

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
  await prisma.agency.createMany({
    data: [
      { id: AGENCY_A, legalName: 'A', ideNumber: 'CHE-100.000.001', canton: 'GE' },
      { id: AGENCY_B, legalName: 'B', ideNumber: 'CHE-100.000.002', canton: 'VD' },
    ],
  });
  repo = new PrismaMissionProposalRepository(prisma);
}, 90_000);

afterAll(async () => {
  await prisma.$disconnect();
  await container.stop();
});

beforeEach(async () => {
  await prisma.missionProposal.deleteMany();
});

function buildProposal(overrides: { agencyId?: typeof AGENCY_A; externalRequestId?: string } = {}) {
  return MissionProposal.create({
    id: asMissionProposalId(randomUUID()),
    agencyId: overrides.agencyId ?? AGENCY_A,
    externalRequestId: overrides.externalRequestId ?? 'mp-req-1',
    // workerId omis : FK exigerait un seed TempWorker. La route MP
    // typique envoie workerId null quand MP ne connaît pas l'intérimaire.
    missionSnapshot: {
      title: 'Cariste',
      clientName: 'ACME',
      siteAddress: 'Rue 1',
      canton: 'GE',
      cctReference: 'CCT BAT',
      hourlyRateRappen: 3200,
      startsAt: new Date('2026-04-25T07:00:00Z'),
      endsAt: new Date('2026-04-25T16:00:00Z'),
      skillsRequired: ['cariste'],
    },
    proposedAt: NOW,
    responseDeadline: new Date(NOW.getTime() + 30 * 60 * 1000),
    clock,
  });
}

describe('PrismaMissionProposalRepository', () => {
  it('save + findById round-trip', async () => {
    const p = buildProposal();
    await repo.save(p);
    const loaded = await repo.findById(AGENCY_A, p.id);
    expect(loaded).toBeDefined();
    const snap = loaded?.toSnapshot();
    expect(snap?.externalRequestId).toBe('mp-req-1');
    expect(snap?.missionSnapshot.title).toBe('Cariste');
    expect(snap?.missionSnapshot.cctReference).toBe('CCT BAT');
    expect(snap?.state).toBe('proposed');
  });

  it('findByExternalRequestId scopé par tenant', async () => {
    const a = buildProposal({ agencyId: AGENCY_A, externalRequestId: 'mp-req-shared' });
    await repo.save(a);
    const b = await repo.findByExternalRequestId(AGENCY_B, 'mp-req-shared');
    expect(b).toBeUndefined();
    const aFound = await repo.findByExternalRequestId(AGENCY_A, 'mp-req-shared');
    expect(aFound).toBeDefined();
  });

  it("save upsert : modifier l'état puis re-save persiste les changements", async () => {
    const p = buildProposal();
    await repo.save(p);
    p.transitionTo('pass_through_sent', { reason: 'sent via SMS' }, clock);
    await repo.save(p);
    const loaded = await repo.findById(AGENCY_A, p.id);
    expect(loaded?.state).toBe('pass_through_sent');
    expect(loaded?.toSnapshot().responseReason).toBe('sent via SMS');
  });

  it('list filtre par state et pagine', async () => {
    for (let i = 0; i < 3; i++) {
      const p = buildProposal({ externalRequestId: `mp-req-${String(i)}` });
      if (i === 0) p.transitionTo('agency_review', {}, clock);
      await repo.save(p);
    }
    const pendingPage = await repo.list({ agencyId: AGENCY_A, state: 'proposed' });
    expect(pendingPage.items).toHaveLength(2);
    const reviewPage = await repo.list({ agencyId: AGENCY_A, state: 'agency_review' });
    expect(reviewPage.items).toHaveLength(1);
  });

  it('isolation tenant : agency_b ne voit pas les proposals de agency_a', async () => {
    const p = buildProposal({ agencyId: AGENCY_A });
    await repo.save(p);
    expect(await repo.findById(AGENCY_B, p.id)).toBeUndefined();
    const list = await repo.list({ agencyId: AGENCY_B });
    expect(list.items).toHaveLength(0);
  });
});
