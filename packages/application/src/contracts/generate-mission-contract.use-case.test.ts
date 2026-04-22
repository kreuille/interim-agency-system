import { describe, expect, it } from 'vitest';
import { FixedClock } from '@interim/shared';
import {
  asAgencyId,
  asMissionProposalId,
  asStaffId,
  CctMinimumRate,
  MissionProposal,
} from '@interim/domain';
import { GenerateMissionContractUseCase } from './generate-mission-contract.use-case.js';
import { InMemoryMissionProposalRepository } from '../missions/test-helpers.js';
import {
  InMemoryMissionContractRepository,
  StubAgencyProfileLookup,
  StubClientProfileLookup,
  StubLseAuthorizationLookup,
  StubWeeklyHoursLookup,
  StubWorkPermitLookup,
} from './test-helpers.js';

const NOW = new Date('2026-04-22T08:00:00Z');
const clock = new FixedClock(NOW);
const AGENCY = asAgencyId('agency-a');
const WORKER = asStaffId('worker-1');

const cctRates = [
  new CctMinimumRate({
    branch: 'CCT Construction',
    qualification: 'ouvrier_qualifie',
    minHourlyRappen: BigInt(3000),
    validFrom: new Date('2025-01-01T00:00:00Z'),
  }),
];

interface SetupOptions {
  readonly proposalState?: 'proposed' | 'pass_through_sent' | 'agency_review' | 'accepted';
  readonly lseStatus?: 'active' | 'pending' | 'expired' | 'revoked';
  readonly lseExpiresAt?: Date;
  readonly permitValid?: boolean;
  readonly permitExpiresAt?: Date;
  readonly weeklyHours?: number; // Cumul pré-existant
  readonly missingAgencyProfile?: boolean;
  readonly hourlyRateRappen?: number;
}

async function setup(opts: SetupOptions = {}) {
  const proposals = new InMemoryMissionProposalRepository();
  const contracts = new InMemoryMissionContractRepository();

  const proposal = MissionProposal.create({
    id: asMissionProposalId('mp-1'),
    agencyId: AGENCY,
    externalRequestId: 'mp-req-1',
    workerId: WORKER,
    missionSnapshot: {
      title: 'Cariste',
      clientName: 'ACME',
      siteAddress: 'Rue 1',
      canton: 'GE',
      cctReference: 'CCT Construction',
      hourlyRateRappen: opts.hourlyRateRappen ?? 3200,
      startsAt: new Date('2026-04-25T07:00:00Z'),
      endsAt: new Date('2026-04-25T16:00:00Z'),
      skillsRequired: [],
    },
    proposedAt: NOW,
    clock,
  });
  // Avance jusqu'à `accepted` par défaut.
  const target = opts.proposalState ?? 'accepted';
  if (target !== 'proposed') {
    proposal.transitionTo('agency_review', {}, clock);
  }
  if (target === 'pass_through_sent') {
    // re-créer proposal en pass_through_sent depuis proposed
    const p2 = MissionProposal.create({
      id: asMissionProposalId('mp-1'),
      agencyId: AGENCY,
      externalRequestId: 'mp-req-1',
      workerId: WORKER,
      missionSnapshot: proposal.toSnapshot().missionSnapshot,
      proposedAt: NOW,
      clock,
    });
    p2.transitionTo('pass_through_sent', {}, clock);
    await proposals.save(p2);
  } else if (target === 'accepted') {
    proposal.transitionTo('accepted', {}, clock);
    await proposals.save(proposal);
  } else {
    await proposals.save(proposal);
  }

  const lse = new StubLseAuthorizationLookup({
    status: opts.lseStatus ?? 'active',
    authorizationNumber: 'GE-LSE-2024-001',
    expiresAt: opts.lseExpiresAt ?? new Date('2027-04-22T00:00:00Z'),
  });
  const permits = new StubWorkPermitLookup({
    category: 'B',
    valid: opts.permitValid ?? true,
    expiresAt: opts.permitExpiresAt ?? new Date('2027-04-22T00:00:00Z'),
  });
  const weeklyHours = new StubWeeklyHoursLookup(opts.weeklyHours ?? 0);
  const agencyProfile = new StubAgencyProfileLookup(
    opts.missingAgencyProfile ? undefined : { name: 'Acme Intérim SA', ide: 'CHE-100.000.001' },
  );
  const clientProfile = new StubClientProfileLookup({ name: 'Client SA', ide: 'CHE-200.000.001' });

  let counter = 0;
  const useCase = new GenerateMissionContractUseCase(
    proposals,
    contracts,
    lse,
    permits,
    weeklyHours,
    agencyProfile,
    clientProfile,
    clock,
    () => `mc-${String(++counter)}`,
    () => 'MC-2026-04-TEST',
  );
  return { contracts, useCase };
}

describe('GenerateMissionContractUseCase', () => {
  const baseInput = {
    agencyId: AGENCY,
    proposalId: 'mp-1',
    weeklyHours: 9,
    branch: 'CCT Construction',
    cctQualification: 'ouvrier_qualifie',
    cctRates,
  };

  it('happy path → contrat draft créé avec snapshot légal', async () => {
    const { contracts, useCase } = await setup();
    const result = await useCase.execute(baseInput);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('created');
      if (result.value.status === 'created') expect(result.value.reference).toBe('MC-2026-04-TEST');
    }
    expect(contracts.size()).toBe(1);
  });

  it('idempotent : 2e exécution → duplicate avec même contractId', async () => {
    const { contracts, useCase } = await setup();
    const r1 = await useCase.execute(baseInput);
    const r2 = await useCase.execute(baseInput);
    expect(r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r2.value.status).toBe('duplicate');
      expect(r2.value.contractId).toBe(r1.value.contractId);
    }
    expect(contracts.size()).toBe(1);
  });

  it('proposal pas accepted → proposal_not_accepted', async () => {
    const { useCase } = await setup({ proposalState: 'pass_through_sent' });
    const result = await useCase.execute(baseInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('proposal_not_accepted');
  });

  it('LSE expirée → lse_authorization_inactive', async () => {
    const { useCase } = await setup({ lseStatus: 'expired' });
    const result = await useCase.execute(baseInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('lse_authorization_inactive');
  });

  it('LSE qui expire avant fin mission → lse_authorization_expires_before_mission_end', async () => {
    const { useCase } = await setup({ lseExpiresAt: new Date('2026-04-25T15:00:00Z') });
    const result = await useCase.execute(baseInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('lse_authorization_expires_before_mission_end');
  });

  it('permis invalide → work_permit_invalid', async () => {
    const { useCase } = await setup({ permitValid: false });
    const result = await useCase.execute(baseInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('work_permit_invalid');
  });

  it('permis qui expire avant fin mission → work_permit_expires_before_mission_end', async () => {
    const { useCase } = await setup({ permitExpiresAt: new Date('2026-04-25T15:00:00Z') });
    const result = await useCase.execute(baseInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('work_permit_expires_before_mission_end');
  });

  it('taux mission < CCT min → rate_below_cct_minimum', async () => {
    const { useCase } = await setup({ hourlyRateRappen: 2900 });
    const result = await useCase.execute(baseInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('rate_below_cct_minimum');
  });

  it('cumul + nouveau > 50h/sem → weekly_hours_exceed_limit', async () => {
    const { useCase } = await setup({ weeklyHours: 45 });
    const result = await useCase.execute({ ...baseInput, weeklyHours: 9 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('weekly_hours_exceed_limit');
  });

  it('agency profile manquant → agency_profile_missing', async () => {
    const { useCase } = await setup({ missingAgencyProfile: true });
    const result = await useCase.execute(baseInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('agency_profile_missing');
  });

  it('weeklyHours 0 → invalid_input', async () => {
    const { useCase } = await setup();
    const result = await useCase.execute({ ...baseInput, weeklyHours: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('invalid_input');
  });
});
