import { describe, expect, it } from 'vitest';
import { FixedClock } from '@interim/shared';
import { asAgencyId } from '@interim/domain';
import { RecordMissionProposalUseCase } from './record-mission-proposal.use-case.js';
import { InMemoryMissionProposalRepository } from './test-helpers.js';
import { WorkerAssignmentProposedHandler } from './worker-assignment-proposed.handler.js';

const NOW = new Date('2026-04-22T08:00:00Z');
const AGENCY = asAgencyId('agency-a');

function setup() {
  const repo = new InMemoryMissionProposalRepository();
  let counter = 0;
  const useCase = new RecordMissionProposalUseCase(
    repo,
    new FixedClock(NOW),
    () => `mp-${String(++counter)}`,
  );
  const handler = new WorkerAssignmentProposedHandler(AGENCY, useCase);
  return { repo, handler };
}

const validPayload = {
  externalRequestId: 'mp-req-1',
  workerId: 'worker-1',
  clientId: 'client-1',
  mission: {
    title: 'Cariste H24',
    clientName: 'ACME SA',
    siteAddress: 'Rue 1',
    canton: 'GE',
    hourlyRateRappen: 3200,
    startsAt: '2026-04-25T07:00:00.000Z',
    endsAt: '2026-04-25T16:00:00.000Z',
    skillsRequired: ['cariste'],
  },
  responseDeadline: '2026-04-22T08:30:00.000Z',
};

describe('WorkerAssignmentProposedHandler', () => {
  it('crée une proposition à partir d’un payload MP valide', async () => {
    const { repo, handler } = setup();
    await handler.handle({
      eventId: 'evt-1',
      eventType: 'worker.assignment.proposed',
      timestamp: NOW.toISOString(),
      payload: validPayload,
    });
    expect(repo.size()).toBe(1);
  });

  it('payload invalide (rate négatif) → throw (DLQ retry)', async () => {
    const { handler } = setup();
    await expect(
      handler.handle({
        eventId: 'evt-2',
        eventType: 'worker.assignment.proposed',
        timestamp: NOW.toISOString(),
        payload: { ...validPayload, mission: { ...validPayload.mission, hourlyRateRappen: -100 } },
      }),
    ).rejects.toThrow();
  });

  it('payload sans `mission` → throw', async () => {
    const { handler } = setup();
    await expect(
      handler.handle({
        eventId: 'evt-3',
        eventType: 'worker.assignment.proposed',
        timestamp: NOW.toISOString(),
        payload: { externalRequestId: 'r-1' },
      }),
    ).rejects.toThrow();
  });

  it('payload avec workerId/clientId null → ok (proposition non assignée)', async () => {
    const { repo, handler } = setup();
    await handler.handle({
      eventId: 'evt-4',
      eventType: 'worker.assignment.proposed',
      timestamp: NOW.toISOString(),
      payload: { ...validPayload, workerId: null, clientId: null },
    });
    expect(repo.size()).toBe(1);
  });
});
