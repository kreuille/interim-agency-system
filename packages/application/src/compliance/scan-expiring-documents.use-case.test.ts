import { describe, it, expect, beforeEach } from 'vitest';
import { FixedClock } from '@interim/shared';
import { ScanExpiringDocumentsUseCase } from './scan-expiring-documents.use-case.js';
import {
  InMemoryDocumentAlertLedger,
  InMemoryExpiringDocumentsScanner,
  RecordingNotifier,
  RecordingWebhookEmitter,
} from './test-helpers.js';

const NOW = new Date('2026-04-22T08:00:00Z');
const clock = new FixedClock(NOW);

let scanner: InMemoryExpiringDocumentsScanner;
let ledger: InMemoryDocumentAlertLedger;
let managerEmail: RecordingNotifier;
let workerSms: RecordingNotifier;
let workerEmail: RecordingNotifier;
let webhook: RecordingWebhookEmitter;
let useCase: ScanExpiringDocumentsUseCase;

beforeEach(() => {
  scanner = new InMemoryExpiringDocumentsScanner();
  ledger = new InMemoryDocumentAlertLedger();
  managerEmail = new RecordingNotifier();
  workerSms = new RecordingNotifier();
  workerEmail = new RecordingNotifier();
  webhook = new RecordingWebhookEmitter();
  useCase = new ScanExpiringDocumentsUseCase(
    scanner,
    ledger,
    managerEmail,
    workerSms,
    workerEmail,
    webhook,
    clock,
  );
});

function expiringRow(daysAhead: number, type: 'permit_work' | 'caces' = 'permit_work') {
  return {
    documentId: `doc-${String(daysAhead)}`,
    agencyId: 'agency-a',
    workerId: 'worker-1',
    type,
    status: 'VALID' as const,
    expiresAt: new Date(NOW.getTime() + daysAhead * 24 * 3600 * 1000),
  };
}

describe('ScanExpiringDocumentsUseCase', () => {
  it('emits alert on all 4 channels when permit_work crosses 30-day threshold', async () => {
    scanner.rows.push(expiringRow(28));
    const result = await useCase.execute();

    expect(result.alertsSent).toBe(4);
    expect(result.alertsSkippedDuplicate).toBe(0);
    expect(managerEmail.calls).toHaveLength(1);
    expect(workerSms.calls).toHaveLength(1);
    expect(workerEmail.calls).toHaveLength(1);
    expect(webhook.events).toHaveLength(1);
    expect(webhook.events[0]?.type).toBe('document.expiring');
    expect(managerEmail.calls[0]?.thresholdDays).toBe(30);
  });

  it('does not duplicate alerts within the same day', async () => {
    scanner.rows.push(expiringRow(28));
    await useCase.execute();
    const second = await useCase.execute();

    expect(second.alertsSent).toBe(0);
    expect(second.alertsSkippedDuplicate).toBe(4);
    expect(managerEmail.calls).toHaveLength(1);
  });

  it('skips documents far from expiry (no threshold crossed)', async () => {
    scanner.rows.push(expiringRow(200));
    const result = await useCase.execute();
    expect(result.alertsSent).toBe(0);
    expect(managerEmail.calls).toHaveLength(0);
  });

  it('different threshold = different alert (60 then 30 days later)', async () => {
    scanner.rows.push(expiringRow(45));
    const first = await useCase.execute();
    expect(first.alertsSent).toBe(4); // threshold 60

    // simulate 15 days later → threshold 30 should fire
    const laterClock = new FixedClock(new Date(NOW.getTime() + 15 * 24 * 3600 * 1000));
    const laterUseCase = new ScanExpiringDocumentsUseCase(
      scanner,
      ledger,
      managerEmail,
      workerSms,
      workerEmail,
      webhook,
      laterClock,
    );
    const second = await laterUseCase.execute();
    expect(second.alertsSent).toBe(4); // new threshold 30
    expect(managerEmail.calls).toHaveLength(2);
  });

  it('marks expired documents and emits document.expired webhook', async () => {
    scanner.rows.push({
      documentId: 'doc-expired',
      agencyId: 'agency-a',
      workerId: 'worker-1',
      type: 'permit_work',
      status: 'VALID',
      expiresAt: new Date(NOW.getTime() - 24 * 3600 * 1000),
    });

    const result = await useCase.execute();
    expect(result.markedExpired).toBe(1);
    expect(scanner.markedExpired).toHaveLength(1);
    expect(webhook.events.some((e) => e.type === 'document.expired')).toBe(true);
  });

  it('cross-tenant: alert payload carries the right agencyId', async () => {
    scanner.rows.push(expiringRow(28));
    scanner.rows.push({ ...expiringRow(28), agencyId: 'agency-b', documentId: 'doc-b' });

    await useCase.execute();
    const agencies = managerEmail.calls.map((c) => c.agencyId).sort();
    expect(agencies).toEqual(['agency-a', 'agency-b']);
  });

  it('CACES uses 90-day threshold (different from permit_work)', async () => {
    scanner.rows.push(expiringRow(75, 'caces'));
    const result = await useCase.execute();
    expect(result.alertsSent).toBe(4);
    expect(managerEmail.calls[0]?.thresholdDays).toBe(90);
  });
});
