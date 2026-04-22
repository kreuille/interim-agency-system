import { describe, expect, it } from 'vitest';
import { FixedClock } from '@interim/shared';
import { asAgencyId, asMissionProposalId, asStaffId, MissionProposal } from '@interim/domain';
import {
  WorkerAssignmentAcceptedHandler,
  WorkerAssignmentExpiredHandler,
  WorkerAssignmentRefusedHandler,
  WorkerAssignmentTimeoutHandler,
} from './worker-assignment-response.handlers.js';
import { InMemoryMissionProposalRepository } from './test-helpers.js';

const NOW = new Date('2026-04-22T08:00:00Z');
const clock = new FixedClock(NOW);
const AGENCY = asAgencyId('agency-a');

async function seed(
  repo: InMemoryMissionProposalRepository,
  advanceTo?: 'pass_through_sent' | 'agency_review',
) {
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
    clock,
  });
  if (advanceTo) p.transitionTo(advanceTo, {}, clock);
  await repo.save(p);
  return p.id;
}

const ctx = {
  eventId: 'evt-1',
  eventType: 'worker.assignment.accepted',
  timestamp: NOW.toISOString(),
  payload: { externalRequestId: 'mp-req-1', reason: 'worker ok' },
};

describe('worker.assignment.* handlers', () => {
  it('accepted : proposal en pass_through_sent → transition accepted', async () => {
    const repo = new InMemoryMissionProposalRepository();
    const id = await seed(repo, 'pass_through_sent');
    const handler = new WorkerAssignmentAcceptedHandler(AGENCY, repo, clock);
    await handler.handle(ctx);
    const updated = await repo.findById(AGENCY, asMissionProposalId(id));
    expect(updated?.state).toBe('accepted');
  });

  it('refused : proposal en agency_review → transition refused avec reason', async () => {
    const repo = new InMemoryMissionProposalRepository();
    const id = await seed(repo, 'agency_review');
    const handler = new WorkerAssignmentRefusedHandler(AGENCY, repo, clock);
    await handler.handle({
      ...ctx,
      payload: { externalRequestId: 'mp-req-1', reason: 'unavailable' },
    });
    const updated = await repo.findById(AGENCY, asMissionProposalId(id));
    expect(updated?.state).toBe('refused');
    expect(updated?.toSnapshot().responseReason).toBe('unavailable');
  });

  it('timeout : proposal en pass_through_sent → transition timeout', async () => {
    const repo = new InMemoryMissionProposalRepository();
    await seed(repo, 'pass_through_sent');
    const handler = new WorkerAssignmentTimeoutHandler(AGENCY, repo, clock);
    await handler.handle({ ...ctx, payload: { externalRequestId: 'mp-req-1' } });
    const updated = await repo.findByExternalRequestId(AGENCY, 'mp-req-1');
    expect(updated?.state).toBe('timeout');
  });

  it('expired : proposal en proposed → transition expired', async () => {
    const repo = new InMemoryMissionProposalRepository();
    await seed(repo);
    const handler = new WorkerAssignmentExpiredHandler(AGENCY, repo, clock);
    await handler.handle({ ...ctx, payload: { externalRequestId: 'mp-req-1' } });
    const updated = await repo.findByExternalRequestId(AGENCY, 'mp-req-1');
    expect(updated?.state).toBe('expired');
  });

  it('idempotent : même event rejoué → no-op', async () => {
    const repo = new InMemoryMissionProposalRepository();
    await seed(repo, 'pass_through_sent');
    const handler = new WorkerAssignmentAcceptedHandler(AGENCY, repo, clock);
    await handler.handle(ctx);
    // Second call same event
    await handler.handle(ctx);
    const updated = await repo.findByExternalRequestId(AGENCY, 'mp-req-1');
    expect(updated?.state).toBe('accepted');
  });

  it('conflit : proposal déjà refused, event accepted → throw (DLQ)', async () => {
    const repo = new InMemoryMissionProposalRepository();
    await seed(repo, 'agency_review');
    const refuser = new WorkerAssignmentRefusedHandler(AGENCY, repo, clock);
    await refuser.handle({
      ...ctx,
      payload: { externalRequestId: 'mp-req-1', reason: 'worker said no' },
    });
    const accepter = new WorkerAssignmentAcceptedHandler(AGENCY, repo, clock);
    await expect(accepter.handle(ctx)).rejects.toThrow(/proposal_already_terminal/);
  });

  it('proposal inconnue (externalRequestId absent) → silencieux (no-op)', async () => {
    const repo = new InMemoryMissionProposalRepository();
    const handler = new WorkerAssignmentAcceptedHandler(AGENCY, repo, clock);
    await expect(
      handler.handle({ ...ctx, payload: { externalRequestId: 'unknown' } }),
    ).resolves.toBeUndefined();
  });

  it('payload invalide (manque externalRequestId) → throw Zod', async () => {
    const repo = new InMemoryMissionProposalRepository();
    const handler = new WorkerAssignmentAcceptedHandler(AGENCY, repo, clock);
    await expect(handler.handle({ ...ctx, payload: {} })).rejects.toThrow();
  });
});
