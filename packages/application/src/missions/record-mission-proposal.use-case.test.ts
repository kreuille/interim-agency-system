import { describe, expect, it } from 'vitest';
import { FixedClock } from '@interim/shared';
import { asAgencyId } from '@interim/domain';
import { RecordMissionProposalUseCase } from './record-mission-proposal.use-case.js';
import { InMemoryMissionProposalRepository } from './test-helpers.js';

const NOW = new Date('2026-04-22T08:00:00Z');
const AGENCY = asAgencyId('agency-a');

function setup() {
  const repo = new InMemoryMissionProposalRepository();
  let counter = 0;
  const idFactory = (): string => `mp-${String(++counter)}`;
  const useCase = new RecordMissionProposalUseCase(repo, new FixedClock(NOW), idFactory);
  return { repo, useCase };
}

const baseInput = {
  agencyId: AGENCY,
  externalRequestId: 'mp-req-1',
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
};

describe('RecordMissionProposalUseCase', () => {
  it('crée une nouvelle proposition (status=created)', async () => {
    const { repo, useCase } = setup();
    const result = await useCase.execute(baseInput);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('created');
      expect(result.value.proposalId).toBe('mp-1');
    }
    expect(repo.size()).toBe(1);
  });

  it('rejouer le même externalRequestId → duplicate (idempotency)', async () => {
    const { repo, useCase } = setup();
    await useCase.execute(baseInput);
    const second = await useCase.execute(baseInput);
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.value.status).toBe('duplicate');
      expect(second.value.proposalId).toBe('mp-1');
    }
    expect(repo.size()).toBe(1);
  });

  it('isolation tenant : externalRequestId même mais agency différente → nouvelle proposition', async () => {
    const { repo, useCase } = setup();
    await useCase.execute(baseInput);
    await useCase.execute({ ...baseInput, agencyId: asAgencyId('agency-b') });
    expect(repo.size()).toBe(2);
  });
});
