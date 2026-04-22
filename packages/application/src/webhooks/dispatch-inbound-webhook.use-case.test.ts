import { describe, expect, it, vi } from 'vitest';
import { FixedClock } from '@interim/shared';
import { asAgencyId } from '@interim/domain';
import { DispatchInboundWebhookUseCase } from './dispatch-inbound-webhook.use-case.js';
import {
  InboundWebhookDispatcher,
  type InboundWebhookHandler,
} from './webhook-event-dispatcher.js';
import { INBOUND_DEAD_AFTER_ATTEMPTS } from './inbound-webhook.js';
import { InMemoryInboundWebhookRepository } from './test-helpers.js';

const NOW = new Date('2026-04-22T08:00:00Z');
const AGENCY = asAgencyId('agency-a');
const clock = new FixedClock(NOW);

async function seedEvent(
  repo: InMemoryInboundWebhookRepository,
  eventType = 'worker.assignment.proposed',
) {
  const r = await repo.insertIfNew({
    id: 'iwh-1',
    agencyId: AGENCY,
    eventId: 'mp-evt-1',
    eventType,
    signature: 'sha256=abc',
    payload: { requestId: 'r-1' },
    headers: {},
    receivedAt: NOW,
  });
  if (!r.inserted) throw new Error('seed failed');
  return r.id;
}

describe('DispatchInboundWebhookUseCase', () => {
  it('handler enregistré → dispatch ok → status processed', async () => {
    const repo = new InMemoryInboundWebhookRepository();
    const id = await seedEvent(repo);
    const handle = vi.fn().mockResolvedValue(undefined);
    const handler: InboundWebhookHandler = { handle };
    const dispatcher = new InboundWebhookDispatcher();
    dispatcher.register('worker.assignment.proposed', handler);
    const useCase = new DispatchInboundWebhookUseCase(repo, dispatcher, clock);
    const result = await useCase.execute({ id });
    expect(result.status).toBe('processed');
    expect(handle).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'mp-evt-1', payload: { requestId: 'r-1' } }),
    );
    expect(repo.snapshot()[0]?.status).toBe('PROCESSED');
    expect(repo.snapshot()[0]?.processedAt?.toISOString()).toBe(NOW.toISOString());
  });

  it('aucun handler enregistré → no_handler mais event marqué processed (no-op accepté)', async () => {
    const repo = new InMemoryInboundWebhookRepository();
    const id = await seedEvent(repo, 'unknown.event.type');
    const dispatcher = new InboundWebhookDispatcher();
    const useCase = new DispatchInboundWebhookUseCase(repo, dispatcher, clock);
    const result = await useCase.execute({ id });
    expect(result.status).toBe('no_handler');
    expect(repo.snapshot()[0]?.status).toBe('PROCESSED');
  });

  it('handler throw → status failed + retryAfterSeconds défini', async () => {
    const repo = new InMemoryInboundWebhookRepository();
    const id = await seedEvent(repo);
    const dispatcher = new InboundWebhookDispatcher();
    dispatcher.register('worker.assignment.proposed', {
      handle: () => Promise.reject(new Error('handler boom')),
    });
    const useCase = new DispatchInboundWebhookUseCase(repo, dispatcher, clock);
    const result = await useCase.execute({ id });
    expect(result.status).toBe('failed');
    if (result.status === 'failed') expect(result.retryAfterSeconds).toBe(30);
    expect(repo.snapshot()[0]?.status).toBe('FAILED');
    expect(repo.snapshot()[0]?.errorMessage).toBe('handler boom');
    expect(repo.snapshot()[0]?.retryCount).toBe(1);
  });

  it('handler throw n×5 → DEAD (retryAfterSeconds=undefined)', async () => {
    const repo = new InMemoryInboundWebhookRepository();
    const id = await seedEvent(repo);
    const dispatcher = new InboundWebhookDispatcher();
    dispatcher.register('worker.assignment.proposed', {
      handle: () => Promise.reject(new Error('persistent')),
    });
    const useCase = new DispatchInboundWebhookUseCase(repo, dispatcher, clock);
    for (let i = 0; i < INBOUND_DEAD_AFTER_ATTEMPTS - 1; i++) {
      await useCase.execute({ id });
    }
    const last = await useCase.execute({ id });
    expect(last.status).toBe('failed');
    if (last.status === 'failed') expect(last.retryAfterSeconds).toBeUndefined();
    expect(repo.snapshot()[0]?.retryCount).toBe(INBOUND_DEAD_AFTER_ATTEMPTS);
  });

  it('event inconnu → not_found', async () => {
    const repo = new InMemoryInboundWebhookRepository();
    const dispatcher = new InboundWebhookDispatcher();
    const useCase = new DispatchInboundWebhookUseCase(repo, dispatcher, clock);
    const result = await useCase.execute({ id: 'nope' });
    expect(result.status).toBe('not_found');
  });

  it('event déjà PROCESSED → already_processed (idempotent)', async () => {
    const repo = new InMemoryInboundWebhookRepository();
    const id = await seedEvent(repo);
    const dispatcher = new InboundWebhookDispatcher();
    dispatcher.register('worker.assignment.proposed', {
      handle: vi.fn().mockResolvedValue(undefined),
    });
    const useCase = new DispatchInboundWebhookUseCase(repo, dispatcher, clock);
    await useCase.execute({ id });
    const second = await useCase.execute({ id });
    expect(second.status).toBe('already_processed');
  });
});
