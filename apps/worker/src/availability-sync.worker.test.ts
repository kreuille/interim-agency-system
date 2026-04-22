import { describe, expect, it, vi } from 'vitest';
import { FixedClock } from '@interim/shared';
import { asAgencyId, asStaffId } from '@interim/domain';
import {
  InMemoryAvailabilityOutboxRepository,
  PushAvailabilityUseCase,
  ScriptedAvailabilityPushPort,
  type AvailabilityOutboxRow,
} from '@interim/application';
import { NIGHTLY_DRAIN_CRON, NIGHTLY_DRAIN_JOB_ID } from './availability-sync.worker.js';

const NOW = new Date('2026-04-22T08:00:00Z');

function buildRow(id: string): AvailabilityOutboxRow {
  return {
    id,
    agencyId: asAgencyId('agency-a'),
    workerId: asStaffId('worker-1'),
    idempotencyKey: `idem-${id}`,
    payload: {
      slots: [
        {
          slotId: `s-${id}`,
          dateFrom: '2026-04-22T08:00:00.000Z',
          dateTo: '2026-04-22T17:00:00.000Z',
          status: 'available',
          source: 'internal',
        },
      ],
    },
    status: 'pending',
    attempts: 0,
    nextAttemptAt: NOW,
    lastError: undefined,
    createdAt: NOW,
  };
}

/**
 * Tests d'intégration unitaires : on ne lance pas BullMQ (qui nécessite
 * Redis). On vérifie le `PushAvailabilityUseCase` avec l'outbox + port
 * scriptés, ce qui couvre la logique métier que le worker BullMQ
 * délègue. Le wiring BullMQ lui-même (queue + scheduler) est trivial
 * et testé via le smoke test docker-compose en CI.
 */
describe('availability-sync drain logic', () => {
  it('drain plusieurs jobs, succès séquentiel, idempotency conservé', async () => {
    const outbox = new InMemoryAvailabilityOutboxRepository();
    await outbox.insert(buildRow('r-1'));
    await outbox.insert(buildRow('r-2'));
    await outbox.insert(buildRow('r-3'));
    const port = new ScriptedAvailabilityPushPort([
      { kind: 'ok', accepted: 1, rejected: 0 },
      { kind: 'ok', accepted: 1, rejected: 0 },
      { kind: 'ok', accepted: 1, rejected: 0 },
    ]);
    const drain = new PushAvailabilityUseCase(outbox, port, new FixedClock(NOW));
    const result = await drain.execute();
    expect(result).toEqual({ processed: 3, succeeded: 3, failed: 0, dead: 0 });
    expect(port.calls.map((c) => c.idempotencyKey)).toEqual(['idem-r-1', 'idem-r-2', 'idem-r-3']);
  });

  it('rejeu : deuxième drain ne re-claime pas les rows déjà succès', async () => {
    const outbox = new InMemoryAvailabilityOutboxRepository();
    await outbox.insert(buildRow('r-1'));
    const port = new ScriptedAvailabilityPushPort([{ kind: 'ok', accepted: 1, rejected: 0 }]);
    const drain = new PushAvailabilityUseCase(outbox, port, new FixedClock(NOW));
    await drain.execute();
    const second = await drain.execute();
    expect(second.processed).toBe(0);
    expect(port.calls).toHaveLength(1);
  });

  it('retry après backoff : avant le délai → ne re-claime pas, après → re-claime', async () => {
    const outbox = new InMemoryAvailabilityOutboxRepository();
    await outbox.insert(buildRow('r-1'));
    const port = new ScriptedAvailabilityPushPort([
      { kind: 'transient' },
      { kind: 'ok', accepted: 1, rejected: 0 },
    ]);

    const clock = { now: vi.fn(() => NOW) } as { now: () => Date };
    const drain = new PushAvailabilityUseCase(outbox, port, clock);

    // 1er drain → fail, nextAttemptAt = NOW + 30s
    const r1 = await drain.execute();
    expect(r1.failed).toBe(1);

    // 2e drain immédiat (même NOW) → 0 processed
    const r2 = await drain.execute();
    expect(r2.processed).toBe(0);

    // 3e drain 1h plus tard → re-claime, succès
    clock.now = (): Date => new Date(NOW.getTime() + 3600 * 1000);
    const r3 = await drain.execute();
    expect(r3.succeeded).toBe(1);
    expect(port.calls).toHaveLength(2);
  });
});

describe('nightly drain config', () => {
  it('expose un cron pattern à 02:00 UTC (≈ 04:00 Europe/Zurich)', () => {
    expect(NIGHTLY_DRAIN_CRON).toBe('0 2 * * *');
  });

  it('expose un jobId figé pour éviter les répétitions concurrentes au redéploy', () => {
    expect(NIGHTLY_DRAIN_JOB_ID).toBe('nightly-drain');
  });
});
