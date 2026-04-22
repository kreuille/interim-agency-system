import type {
  AlertChannel,
  DocumentAlertEntry,
  DocumentAlertLedger,
  DocumentAlertPayload,
  ExpiringDocumentRow,
  ExpiringDocumentsScanner,
  ManagerEmailNotifier,
  OutboundWebhookEmitter,
  WorkerEmailNotifier,
  WorkerSmsNotifier,
} from './document-alert.ports.js';

export class InMemoryDocumentAlertLedger implements DocumentAlertLedger {
  readonly entries: DocumentAlertEntry[] = [];

  hasSentToday(input: {
    agencyId: string;
    documentId: string;
    thresholdDays: number;
    channel: AlertChannel;
    now: Date;
  }): Promise<boolean> {
    const dayStart = startOfDay(input.now);
    const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
    const found = this.entries.some(
      (e) =>
        e.agencyId === input.agencyId &&
        e.documentId === input.documentId &&
        e.thresholdDays === input.thresholdDays &&
        e.channel === input.channel &&
        e.sentAt.getTime() >= dayStart.getTime() &&
        e.sentAt.getTime() < dayEnd.getTime(),
    );
    return Promise.resolve(found);
  }

  record(entry: DocumentAlertEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

export class InMemoryExpiringDocumentsScanner implements ExpiringDocumentsScanner {
  readonly rows: ExpiringDocumentRow[] = [];
  readonly markedExpired: { agencyId: string; documentId: string; now: Date }[] = [];

  findExpiring(input: { cutoff: Date }): Promise<readonly ExpiringDocumentRow[]> {
    return Promise.resolve(
      this.rows.filter(
        (r) => r.status === 'VALID' && r.expiresAt.getTime() <= input.cutoff.getTime(),
      ),
    );
  }

  findExpired(input: { now: Date }): Promise<readonly ExpiringDocumentRow[]> {
    return Promise.resolve(
      this.rows.filter((r) => r.status === 'VALID' && r.expiresAt.getTime() < input.now.getTime()),
    );
  }

  markExpired(input: { agencyId: string; documentId: string; now: Date }): Promise<void> {
    this.markedExpired.push(input);
    const row = this.rows.find(
      (r) => r.agencyId === input.agencyId && r.documentId === input.documentId,
    );
    if (row) {
      const idx = this.rows.indexOf(row);
      this.rows[idx] = { ...row, status: 'EXPIRED' };
    }
    return Promise.resolve();
  }
}

export class RecordingNotifier
  implements ManagerEmailNotifier, WorkerSmsNotifier, WorkerEmailNotifier
{
  readonly calls: DocumentAlertPayload[] = [];

  sendExpiryAlert(payload: DocumentAlertPayload): Promise<void> {
    this.calls.push(payload);
    return Promise.resolve();
  }
}

export class RecordingWebhookEmitter implements OutboundWebhookEmitter {
  readonly events: { type: string; payload: Record<string, unknown> }[] = [];

  emit(event: { type: string; payload: Record<string, unknown> }): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }
}

function startOfDay(d: Date): Date {
  const x = new Date(d.getTime());
  x.setUTCHours(0, 0, 0, 0);
  return x;
}
