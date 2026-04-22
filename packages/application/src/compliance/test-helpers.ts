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

// =============================================================================
// A6.1 Compliance dashboard — stubs des 5 ports
// =============================================================================

import type {
  ActiveMissionsSnapshot,
  CctSnapshot,
  LseSnapshot,
  NlpdSnapshot,
  WorkerDocsSnapshot,
} from '@interim/domain';
import type {
  ActiveMissionsStatusPort,
  CctStatusPort,
  LseStatusPort,
  NlpdStatusPort,
  WorkerDocsStatusPort,
} from './dashboard-ports.js';

export class StubLseStatusPort implements LseStatusPort {
  constructor(private readonly snapshot: LseSnapshot) {}
  load(): Promise<LseSnapshot> {
    return Promise.resolve(this.snapshot);
  }
}

export class StubCctStatusPort implements CctStatusPort {
  constructor(private readonly snapshot: CctSnapshot) {}
  load(): Promise<CctSnapshot> {
    return Promise.resolve(this.snapshot);
  }
}

export class StubWorkerDocsStatusPort implements WorkerDocsStatusPort {
  constructor(private readonly snapshot: WorkerDocsSnapshot) {}
  load(): Promise<WorkerDocsSnapshot> {
    return Promise.resolve(this.snapshot);
  }
}

export class StubActiveMissionsStatusPort implements ActiveMissionsStatusPort {
  constructor(private readonly snapshot: ActiveMissionsSnapshot) {}
  load(): Promise<ActiveMissionsSnapshot> {
    return Promise.resolve(this.snapshot);
  }
}

export class StubNlpdStatusPort implements NlpdStatusPort {
  constructor(private readonly snapshot: NlpdSnapshot) {}
  load(): Promise<NlpdSnapshot> {
    return Promise.resolve(this.snapshot);
  }
}

/**
 * Variante qui simule une erreur de chargement (test du fallback critique).
 */
export class FailingLseStatusPort implements LseStatusPort {
  constructor(private readonly reason: string) {}
  load(): Promise<LseSnapshot> {
    return Promise.reject(new Error(this.reason));
  }
}

// =============================================================================
// A6.2 SECO export — stubs ports
// =============================================================================

import type {
  SecoContractRow,
  SecoExportRange,
  SecoLseInfo,
  SecoMissionRow,
  SecoTimesheetRow,
  SecoWorkerRow,
} from '@interim/domain';
import type {
  SecoContractsDataPort,
  SecoExportAuditLogger,
  SecoLseInfoPort,
  SecoMissionsDataPort,
  SecoTimesheetsDataPort,
  SecoWorkersDataPort,
} from './seco-export-ports.js';

export class StubSecoWorkersDataPort implements SecoWorkersDataPort {
  constructor(private readonly rows: readonly SecoWorkerRow[]) {}
  load(): Promise<readonly SecoWorkerRow[]> {
    return Promise.resolve(this.rows);
  }
}

export class StubSecoMissionsDataPort implements SecoMissionsDataPort {
  constructor(private readonly rows: readonly SecoMissionRow[]) {}
  load(): Promise<readonly SecoMissionRow[]> {
    return Promise.resolve(this.rows);
  }
}

export class StubSecoContractsDataPort implements SecoContractsDataPort {
  constructor(private readonly rows: readonly SecoContractRow[]) {}
  load(): Promise<readonly SecoContractRow[]> {
    return Promise.resolve(this.rows);
  }
}

export class StubSecoTimesheetsDataPort implements SecoTimesheetsDataPort {
  constructor(private readonly rows: readonly SecoTimesheetRow[]) {}
  load(): Promise<readonly SecoTimesheetRow[]> {
    return Promise.resolve(this.rows);
  }
}

export class StubSecoLseInfoPort implements SecoLseInfoPort {
  constructor(private readonly info: SecoLseInfo) {}
  load(): Promise<SecoLseInfo> {
    return Promise.resolve(this.info);
  }
}

export class InMemorySecoExportAuditLogger implements SecoExportAuditLogger {
  readonly entries: {
    readonly agencyId: string;
    readonly actorUserId: string;
    readonly actorIp?: string;
    readonly range: SecoExportRange;
    readonly generatedAtIso: string;
    readonly stats: { readonly workersCount: number; readonly timesheetsCount: number };
  }[] = [];

  recordExport(entry: {
    agencyId: string;
    actorUserId: string;
    actorIp?: string;
    range: SecoExportRange;
    generatedAtIso: string;
    stats: { workersCount: number; timesheetsCount: number };
  }): Promise<void> {
    this.entries.push({ ...entry });
    return Promise.resolve();
  }
}
