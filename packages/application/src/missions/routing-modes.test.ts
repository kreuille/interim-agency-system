import { describe, expect, it } from 'vitest';
import { FixedClock } from '@interim/shared';
import { asAgencyId, asMissionProposalId, asStaffId, MissionProposal } from '@interim/domain';
import { AcceptOnBehalfUseCase } from './accept-on-behalf.use-case.js';
import { RefuseOnBehalfUseCase } from './refuse-on-behalf.use-case.js';
import { AssignRoutingModeUseCase, ProposalNotFound } from './assign-routing-mode.use-case.js';
import { ProposalMpError } from './proposal-mp-port.js';
import {
  InMemoryMissionProposalRepository,
  ScriptedProposalMpResponsePort,
} from './test-helpers.js';

const NOW = new Date('2026-04-22T08:00:00Z');
const clock = new FixedClock(NOW);
const AGENCY = asAgencyId('agency-a');

async function seedProposal(repo: InMemoryMissionProposalRepository) {
  const p = MissionProposal.create({
    id: asMissionProposalId('mp-1'),
    agencyId: AGENCY,
    externalRequestId: 'mp-req-1',
    workerId: asStaffId('worker-1'),
    missionSnapshot: {
      title: 'Cariste',
      clientName: 'ACME',
      siteAddress: 'Rue 1',
      canton: 'GE',
      hourlyRateRappen: 3200,
      startsAt: new Date('2026-04-25T07:00:00Z'),
      endsAt: new Date('2026-04-25T16:00:00Z'),
      skillsRequired: [],
    },
    proposedAt: NOW,
    responseDeadline: new Date(NOW.getTime() + 30 * 60 * 1000),
    clock,
  });
  await repo.save(p);
  return p.id;
}

describe('AssignRoutingModeUseCase', () => {
  it('mode pass_through → assigne mode + transition pass_through_sent', async () => {
    const repo = new InMemoryMissionProposalRepository();
    const id = await seedProposal(repo);
    const useCase = new AssignRoutingModeUseCase(repo, clock);
    const result = await useCase.execute({
      agencyId: AGENCY,
      proposalId: id,
      mode: 'pass_through',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.state).toBe('pass_through_sent');
  });

  it('mode agency_controlled → assigne mode + transition agency_review', async () => {
    const repo = new InMemoryMissionProposalRepository();
    const id = await seedProposal(repo);
    const useCase = new AssignRoutingModeUseCase(repo, clock);
    const result = await useCase.execute({
      agencyId: AGENCY,
      proposalId: id,
      mode: 'agency_controlled',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.state).toBe('agency_review');
  });

  it('proposal inconnue → ProposalNotFound', async () => {
    const repo = new InMemoryMissionProposalRepository();
    const useCase = new AssignRoutingModeUseCase(repo, clock);
    const result = await useCase.execute({
      agencyId: AGENCY,
      proposalId: 'unknown',
      mode: 'pass_through',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(ProposalNotFound);
  });
});

describe('AcceptOnBehalfUseCase', () => {
  it('happy path → MP notifié + transition accepted', async () => {
    const repo = new InMemoryMissionProposalRepository();
    const id = await seedProposal(repo);
    // Pré-condition : proposal en agency_review (pour pouvoir transitionner accepted)
    const p = await repo.findById(AGENCY, asMissionProposalId(id));
    p?.transitionTo('agency_review', {}, clock);
    if (p) await repo.save(p);

    const port = new ScriptedProposalMpResponsePort([{ kind: 'ok' }]);
    const useCase = new AcceptOnBehalfUseCase(repo, port, clock);
    const result = await useCase.execute({
      agencyId: AGENCY,
      proposalId: id,
      idempotencyKey: 'idem-1',
      notes: 'OK pour mission',
    });
    expect(result.ok).toBe(true);
    expect(port.acceptCalls).toHaveLength(1);
    expect(port.acceptCalls[0]?.idempotencyKey).toBe('idem-1');
    const updated = await repo.findById(AGENCY, asMissionProposalId(id));
    expect(updated?.state).toBe('accepted');
  });

  it('MP transient error → renvoie erreur sans transition', async () => {
    const repo = new InMemoryMissionProposalRepository();
    const id = await seedProposal(repo);
    const p = await repo.findById(AGENCY, asMissionProposalId(id));
    p?.transitionTo('agency_review', {}, clock);
    if (p) await repo.save(p);

    const port = new ScriptedProposalMpResponsePort([{ kind: 'transient' }]);
    const useCase = new AcceptOnBehalfUseCase(repo, port, clock);
    const result = await useCase.execute({
      agencyId: AGENCY,
      proposalId: id,
      idempotencyKey: 'idem-2',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ProposalMpError);
      expect((result.error as ProposalMpError).kind).toBe('transient');
    }
    const updated = await repo.findById(AGENCY, asMissionProposalId(id));
    expect(updated?.state).toBe('agency_review'); // pas de transition
  });
});

describe('RefuseOnBehalfUseCase', () => {
  it('refus avec reason structurée → MP notifié + transition refused', async () => {
    const repo = new InMemoryMissionProposalRepository();
    const id = await seedProposal(repo);
    const p = await repo.findById(AGENCY, asMissionProposalId(id));
    p?.transitionTo('agency_review', {}, clock);
    if (p) await repo.save(p);

    const port = new ScriptedProposalMpResponsePort([{ kind: 'ok' }]);
    const useCase = new RefuseOnBehalfUseCase(repo, port, clock);
    const result = await useCase.execute({
      agencyId: AGENCY,
      proposalId: id,
      idempotencyKey: 'idem-3',
      reason: { kind: 'cct_below_minimum' },
    });
    expect(result.ok).toBe(true);
    expect(port.refuseCalls[0]?.reason).toBe('cct_below_minimum');
    const updated = await repo.findById(AGENCY, asMissionProposalId(id));
    expect(updated?.state).toBe('refused');
    expect(updated?.toSnapshot().responseReason).toBe('cct_below_minimum');
  });

  it('reason `other` sans freeform → throw', async () => {
    const repo = new InMemoryMissionProposalRepository();
    const id = await seedProposal(repo);
    const port = new ScriptedProposalMpResponsePort();
    const useCase = new RefuseOnBehalfUseCase(repo, port, clock);
    await expect(
      useCase.execute({
        agencyId: AGENCY,
        proposalId: id,
        idempotencyKey: 'idem-4',
        reason: { kind: 'other' },
      }),
    ).rejects.toThrow();
  });

  it('reason `other` avec freeform → format `other: <text>`', async () => {
    const repo = new InMemoryMissionProposalRepository();
    const id = await seedProposal(repo);
    const p = await repo.findById(AGENCY, asMissionProposalId(id));
    p?.transitionTo('agency_review', {}, clock);
    if (p) await repo.save(p);

    const port = new ScriptedProposalMpResponsePort([{ kind: 'ok' }]);
    const useCase = new RefuseOnBehalfUseCase(repo, port, clock);
    await useCase.execute({
      agencyId: AGENCY,
      proposalId: id,
      idempotencyKey: 'idem-5',
      reason: { kind: 'other', freeform: 'incompatibilité management' },
    });
    expect(port.refuseCalls[0]?.reason).toBe('other: incompatibilité management');
  });

  it('counterproposal transmis à MP', async () => {
    const repo = new InMemoryMissionProposalRepository();
    const id = await seedProposal(repo);
    const p = await repo.findById(AGENCY, asMissionProposalId(id));
    p?.transitionTo('agency_review', {}, clock);
    if (p) await repo.save(p);

    const port = new ScriptedProposalMpResponsePort([{ kind: 'ok' }]);
    const useCase = new RefuseOnBehalfUseCase(repo, port, clock);
    const result = await useCase.execute({
      agencyId: AGENCY,
      proposalId: id,
      idempotencyKey: 'idem-6',
      reason: { kind: 'unavailable' },
      counterproposal: {
        dateFrom: '2026-04-26T07:00:00.000Z',
        dateTo: '2026-04-26T16:00:00.000Z',
      },
    });
    expect(result.ok).toBe(true);
  });
});
