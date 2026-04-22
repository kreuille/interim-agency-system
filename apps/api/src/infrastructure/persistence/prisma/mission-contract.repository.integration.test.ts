import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { FixedClock } from '@interim/shared';
import {
  asAgencyId,
  asMissionContractId,
  asMissionProposalId,
  asStaffId,
  MissionContract,
  MissionProposal,
  type ContractLegalSnapshot,
} from '@interim/domain';
import { PrismaMissionContractRepository } from './mission-contract.repository.js';
import { PrismaMissionProposalRepository } from './mission-proposal.repository.js';

const NOW = new Date('2026-04-22T08:00:00Z');
const clock = new FixedClock(NOW);
const AGENCY_A = asAgencyId('00000000-0000-4000-a000-000000000001');
const AGENCY_B = asAgencyId('00000000-0000-4000-a000-000000000002');
const WORKER = asStaffId('00000000-0000-4000-b000-000000000001');

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let contracts: PrismaMissionContractRepository;
let proposals: PrismaMissionProposalRepository;

function legal(overrides: Partial<ContractLegalSnapshot> = {}): ContractLegalSnapshot {
  return {
    agencyName: 'Acme Intérim SA',
    agencyIde: 'CHE-100.000.001',
    agencyLseAuthorization: 'GE-LSE-2024-001',
    agencyLseExpiresAt: new Date('2027-04-22T00:00:00Z'),
    clientName: 'Client SA',
    clientIde: 'CHE-200.000.001',
    workerFirstName: 'Jean',
    workerLastName: 'Dupont',
    workerAvs: '756.1234.5678.97',
    missionTitle: 'Cariste',
    siteAddress: 'Rue 1, 1204 Genève',
    canton: 'GE',
    cctReference: 'CCT Construction',
    hourlyRateRappen: 3200,
    startsAt: new Date('2026-04-25T07:00:00Z'),
    endsAt: new Date('2026-04-25T16:00:00Z'),
    weeklyHours: 9,
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
  await prisma.agency.createMany({
    data: [
      { id: AGENCY_A, legalName: 'A', ideNumber: 'CHE-100.000.001', canton: 'GE' },
      { id: AGENCY_B, legalName: 'B', ideNumber: 'CHE-100.000.002', canton: 'VD' },
    ],
  });
  // Seed worker (FK requise)
  await prisma.tempWorker.create({
    data: {
      id: WORKER,
      agencyId: AGENCY_A,
      firstName: 'Jean',
      lastName: 'Dupont',
      avs: '756.1234.5678.97',
      iban: 'CH9300762011623852957',
      residenceCanton: 'GE',
    },
  });
  contracts = new PrismaMissionContractRepository(prisma);
  proposals = new PrismaMissionProposalRepository(prisma);
}, 90_000);

afterAll(async () => {
  await prisma.$disconnect();
  await container.stop();
});

beforeEach(async () => {
  await prisma.missionContract.deleteMany();
  await prisma.missionProposal.deleteMany();
});

async function seedProposalAndContract() {
  const proposal = MissionProposal.create({
    id: asMissionProposalId(randomUUID()),
    agencyId: AGENCY_A,
    externalRequestId: `mp-req-${randomUUID()}`,
    workerId: WORKER,
    missionSnapshot: {
      title: 'Cariste',
      clientName: 'Client SA',
      siteAddress: 'Rue 1',
      canton: 'GE',
      hourlyRateRappen: 3200,
      startsAt: new Date('2026-04-25T07:00:00Z'),
      endsAt: new Date('2026-04-25T16:00:00Z'),
      skillsRequired: [],
    },
    proposedAt: NOW,
    clock,
  });
  proposal.transitionTo('agency_review', {}, clock);
  proposal.transitionTo('accepted', {}, clock);
  await proposals.save(proposal);

  const contract = MissionContract.create({
    id: asMissionContractId(randomUUID()),
    agencyId: AGENCY_A,
    workerId: WORKER,
    proposalId: proposal.id,
    reference: `MC-${randomUUID().slice(0, 8)}`,
    branch: 'CCT Construction',
    legal: legal(),
    clock,
  });
  return contract;
}

describe('PrismaMissionContractRepository', () => {
  it('save + findById round-trip avec snapshot légal complet', async () => {
    const c = await seedProposalAndContract();
    await contracts.save(c);
    const loaded = await contracts.findById(AGENCY_A, c.id);
    expect(loaded).toBeDefined();
    const snap = loaded?.toSnapshot();
    expect(snap?.state).toBe('draft');
    expect(snap?.legal.agencyLseAuthorization).toBe('GE-LSE-2024-001');
    expect(snap?.legal.cctReference).toBe('CCT Construction');
    expect(snap?.legal.hourlyRateRappen).toBe(3200);
  });

  it('findByProposalId scopé par tenant', async () => {
    const c = await seedProposalAndContract();
    await contracts.save(c);
    const found = await contracts.findByProposalId(AGENCY_A, c.toSnapshot().proposalId);
    expect(found?.id).toBe(c.id);
    expect(await contracts.findByProposalId(AGENCY_B, c.toSnapshot().proposalId)).toBeUndefined();
  });

  it('findByReference', async () => {
    const c = await seedProposalAndContract();
    await contracts.save(c);
    const found = await contracts.findByReference(AGENCY_A, c.reference);
    expect(found?.id).toBe(c.id);
  });

  it("save upsert : transition d'état persistée", async () => {
    const c = await seedProposalAndContract();
    await contracts.save(c);
    c.sendForSignature('zertes-env-1', clock);
    await contracts.save(c);
    const loaded = await contracts.findById(AGENCY_A, c.id);
    expect(loaded?.state).toBe('sent_for_signature');
    expect(loaded?.toSnapshot().zertesEnvelopeId).toBe('zertes-env-1');
    c.markSigned({ signedPdfKey: 'gcs://bucket/contract.pdf' }, clock);
    await contracts.save(c);
    const signed = await contracts.findById(AGENCY_A, c.id);
    expect(signed?.state).toBe('signed');
    expect(signed?.toSnapshot().signedPdfKey).toBe('gcs://bucket/contract.pdf');
  });

  it('isolation tenant : agency_b ne voit pas les contrats de agency_a', async () => {
    const c = await seedProposalAndContract();
    await contracts.save(c);
    expect(await contracts.findById(AGENCY_B, c.id)).toBeUndefined();
  });
});
