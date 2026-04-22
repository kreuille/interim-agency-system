import { describe, expect, it, vi } from 'vitest';
import { InboundWebhookDispatcher, NoOpInboundHandler } from './webhook-event-dispatcher.js';

const ctx = {
  eventId: 'evt-1',
  eventType: 'worker.assignment.proposed',
  timestamp: '2026-04-22T08:00:00.000Z',
  payload: {},
};

describe('InboundWebhookDispatcher', () => {
  it('handler enregistré → handle appelé', async () => {
    const dispatcher = new InboundWebhookDispatcher();
    const handle = vi.fn().mockResolvedValue(undefined);
    dispatcher.register('worker.assignment.proposed', { handle });
    const result = await dispatcher.dispatch(ctx);
    expect(result.handled).toBe(true);
    expect(handle).toHaveBeenCalledWith(ctx);
  });

  it('eventType inconnu → handled false (silencieux)', async () => {
    const dispatcher = new InboundWebhookDispatcher();
    const result = await dispatcher.dispatch({ ...ctx, eventType: 'unknown' });
    expect(result.handled).toBe(false);
  });

  it('has() détecte les eventTypes enregistrés', () => {
    const dispatcher = new InboundWebhookDispatcher();
    dispatcher.register('worker.assignment.proposed', new NoOpInboundHandler());
    expect(dispatcher.has('worker.assignment.proposed')).toBe(true);
    expect(dispatcher.has('other')).toBe(false);
  });

  it('NoOpInboundHandler ne throw pas', async () => {
    await expect(new NoOpInboundHandler().handle()).resolves.toBeUndefined();
  });
});
