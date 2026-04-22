import { describe, expect, it, vi } from 'vitest';
import { FixedClock } from '@interim/shared';
import { asAgencyId, asMissionProposalId, asStaffId, MissionProposal } from '@interim/domain';
import {
  computeReminderDelayMs,
  SendProposalReminderUseCase,
} from './proposal-reminder.use-case.js';
import { InMemoryMissionProposalRepository } from './test-helpers.js';
import { SendSmsUseCase } from '../sms/send-sms.use-case.js';
import { InMemorySmsTemplateRegistry } from '../sms/template-renderer.js';
import { InMemorySmsRateLimiter } from '../sms/rate-limiter.js';
import {
  InMemoryOptOutRepository,
  InMemorySmsLogRepository,
  NoopSmsSender,
} from '../sms/test-helpers.js';

const NOW = new Date('2026-04-22T08:00:00Z');
const clock = new FixedClock(NOW);
const AGENCY = asAgencyId('agency-a');

async function setup(state: 'pass_through_sent' | 'agency_review' | 'accepted') {
  const proposals = new InMemoryMissionProposalRepository();
  const proposal = MissionProposal.create({
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
  if (state === 'agency_review' || state === 'accepted') {
    proposal.transitionTo('agency_review', {}, clock);
    if (state === 'accepted') proposal.transitionTo('accepted', {}, clock);
  } else {
    proposal.transitionTo('pass_through_sent', {}, clock);
  }
  await proposals.save(proposal);

  const sender = new NoopSmsSender();
  const templates = new InMemorySmsTemplateRegistry().register({
    code: 'proposal-reminder',
    source: 'Rappel: {{clientName}} le {{startDate}}',
  });
  const sms = new SendSmsUseCase(
    sender,
    templates,
    new InMemorySmsLogRepository(),
    new InMemoryOptOutRepository(),
    new InMemorySmsRateLimiter(),
    clock,
  );
  const useCase = new SendProposalReminderUseCase(proposals, sms, clock);
  return { useCase, sender };
}

describe('SendProposalReminderUseCase', () => {
  it('proposition pass_through_sent → SMS envoyé', async () => {
    const { useCase, sender } = await setup('pass_through_sent');
    const result = await useCase.execute({
      agencyId: AGENCY,
      proposalId: 'mp-1',
      phoneE164: '+41791234567',
    });
    expect(result.status).toBe('sent');
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]?.body).toContain('ACME');
  });

  it("proposition accepted → skipped_terminal, pas d'envoi", async () => {
    const { useCase, sender } = await setup('accepted');
    const result = await useCase.execute({
      agencyId: AGENCY,
      proposalId: 'mp-1',
      phoneE164: '+41791234567',
    });
    expect(result.status).toBe('skipped_terminal');
    expect(sender.sent).toHaveLength(0);
  });

  it('proposition agency_review (pas pass_through_sent) → skipped_state', async () => {
    const { useCase, sender } = await setup('agency_review');
    const result = await useCase.execute({
      agencyId: AGENCY,
      proposalId: 'mp-1',
      phoneE164: '+41791234567',
    });
    expect(result.status).toBe('skipped_state');
    expect(sender.sent).toHaveLength(0);
  });

  it('proposition inconnue → proposal_not_found', async () => {
    const { useCase } = await setup('pass_through_sent');
    const result = await useCase.execute({
      agencyId: AGENCY,
      proposalId: 'unknown',
      phoneE164: '+41791234567',
    });
    expect(result.status).toBe('proposal_not_found');
  });

  it('SMS error → throw (BullMQ retry)', async () => {
    const proposals = new InMemoryMissionProposalRepository();
    const proposal = MissionProposal.create({
      id: asMissionProposalId('mp-2'),
      agencyId: AGENCY,
      externalRequestId: 'mp-req-2',
      workerId: asStaffId('worker-1'),
      missionSnapshot: {
        title: 'X',
        clientName: 'Y',
        siteAddress: 'Z',
        canton: 'GE',
        hourlyRateRappen: 3200,
        startsAt: new Date('2026-04-25T07:00:00Z'),
        endsAt: new Date('2026-04-25T16:00:00Z'),
        skillsRequired: [],
      },
      proposedAt: NOW,
      clock,
    });
    proposal.transitionTo('pass_through_sent', {}, clock);
    await proposals.save(proposal);
    const sms = {
      execute: vi
        .fn()
        .mockResolvedValue({ ok: false, error: { kind: 'opt_out', message: 'opted out' } }),
    } as unknown as SendSmsUseCase;
    const useCase = new SendProposalReminderUseCase(proposals, sms, clock);
    await expect(
      useCase.execute({ agencyId: AGENCY, proposalId: 'mp-2', phoneE164: '+41791234567' }),
    ).rejects.toThrow(/reminder_sms_failed/);
  });
});

describe('computeReminderDelayMs', () => {
  it('renvoie 50% du temps restant', () => {
    const sentAt = new Date('2026-04-22T08:00:00Z');
    const deadline = new Date('2026-04-22T08:30:00Z');
    const delay = computeReminderDelayMs({
      sentAt,
      deadline,
      nowMs: sentAt.getTime(),
    });
    expect(delay).toBe(15 * 60 * 1000);
  });

  it('renvoie undefined si deadline trop proche', () => {
    const sentAt = new Date('2026-04-22T08:00:00Z');
    const deadline = new Date('2026-04-22T08:00:30Z');
    expect(computeReminderDelayMs({ sentAt, deadline, nowMs: sentAt.getTime() })).toBeUndefined();
  });

  it('renvoie undefined si deadline passée', () => {
    const sentAt = new Date('2026-04-22T08:00:00Z');
    const deadline = new Date('2026-04-22T07:00:00Z');
    expect(computeReminderDelayMs({ sentAt, deadline, nowMs: sentAt.getTime() })).toBeUndefined();
  });
});
