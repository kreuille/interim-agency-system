import { describe, expect, it } from 'vitest';
import { FixedClock } from '@interim/shared';
import { asAgencyId } from '@interim/domain';
import { RecordInboundWebhookUseCase } from './record-inbound-webhook.use-case.js';
import {
  InMemoryInboundWebhookEnqueuer,
  InMemoryInboundWebhookRepository,
} from './test-helpers.js';

const NOW = new Date('2026-04-22T08:00:00Z');
const AGENCY = asAgencyId('agency-a');

function setup() {
  const repo = new InMemoryInboundWebhookRepository();
  const enqueuer = new InMemoryInboundWebhookEnqueuer();
  let counter = 0;
  const idFactory = (): string => `iwh-${String(++counter)}`;
  const useCase = new RecordInboundWebhookUseCase(repo, enqueuer, new FixedClock(NOW), idFactory);
  return { repo, enqueuer, useCase };
}

describe('RecordInboundWebhookUseCase', () => {
  const baseInput = {
    agencyId: AGENCY,
    eventId: 'mp-evt-1',
    eventType: 'worker.assignment.proposed',
    signature: 'sha256=abc',
    payload: { requestId: 'r-1' },
    headers: { 'x-moveplanner-event-id': 'mp-evt-1' },
  };

  it('event nouveau → INSERT + enqueue dispatch', async () => {
    const { repo, enqueuer, useCase } = setup();
    const result = await useCase.execute(baseInput);
    expect(result.status).toBe('recorded');
    expect(repo.snapshot()).toHaveLength(1);
    expect(enqueuer.enqueued).toEqual([{ id: 'iwh-1', eventType: 'worker.assignment.proposed' }]);
  });

  it('event déjà reçu (même eventId) → status duplicate, pas de re-enqueue', async () => {
    const { repo, enqueuer, useCase } = setup();
    await useCase.execute(baseInput);
    const result = await useCase.execute(baseInput);
    expect(result.status).toBe('duplicate');
    expect(repo.snapshot()).toHaveLength(1);
    expect(enqueuer.enqueued).toHaveLength(1);
  });

  it('events distincts → 2 enregistrements + 2 dispatch', async () => {
    const { repo, enqueuer, useCase } = setup();
    await useCase.execute(baseInput);
    await useCase.execute({ ...baseInput, eventId: 'mp-evt-2' });
    expect(repo.snapshot()).toHaveLength(2);
    expect(enqueuer.enqueued).toHaveLength(2);
  });

  it('le record persisté contient receivedAt = clock.now() et status PENDING', async () => {
    const { repo, useCase } = setup();
    await useCase.execute(baseInput);
    const record = repo.snapshot()[0];
    expect(record?.receivedAt.toISOString()).toBe(NOW.toISOString());
    expect(record?.status).toBe('PENDING');
    expect(record?.retryCount).toBe(0);
  });
});
