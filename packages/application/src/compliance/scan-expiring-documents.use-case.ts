import {
  isExpired,
  nextCrossedThreshold,
  thresholdsFor,
  type WorkerDocumentType,
} from '@interim/domain';
import type { Clock } from '@interim/shared';
import type {
  AlertChannel,
  DocumentAlertLedger,
  DocumentAlertPayload,
  ExpiringDocumentsScanner,
  ManagerEmailNotifier,
  OutboundWebhookEmitter,
  WorkerEmailNotifier,
  WorkerSmsNotifier,
} from './document-alert.ports.js';

export interface ScanExpiringDocumentsResult {
  readonly alertsSent: number;
  readonly alertsSkippedDuplicate: number;
  readonly markedExpired: number;
}

const ALL_CHANNELS: readonly AlertChannel[] = [
  'manager_email',
  'worker_sms',
  'worker_email',
  'webhook',
];

/**
 * Scan quotidien : pour chaque document `VALID` dont l'expiration approche
 * un seuil (60/30/7 j selon le type), émet alerte sur 4 canaux. Idempotent
 * via {@link DocumentAlertLedger} (une alerte par documentId×threshold×channel
 * par jour).
 *
 * En complément : passe `EXPIRED` les documents dont `expiresAt < now`.
 *
 * Tourne hors contexte tenant (job système). Le `ExpiringDocumentsScanner`
 * remonte des résultats multi-tenant ; chaque alerte porte son `agencyId`.
 */
export class ScanExpiringDocumentsUseCase {
  constructor(
    private readonly scanner: ExpiringDocumentsScanner,
    private readonly ledger: DocumentAlertLedger,
    private readonly managerEmail: ManagerEmailNotifier,
    private readonly workerSms: WorkerSmsNotifier,
    private readonly workerEmail: WorkerEmailNotifier,
    private readonly webhook: OutboundWebhookEmitter,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<ScanExpiringDocumentsResult> {
    const now = this.clock.now();

    let alertsSent = 0;
    let alertsSkippedDuplicate = 0;
    let markedExpired = 0;

    // 1. Documents qui viennent de passer la date d'expiration.
    const expiredRows = await this.scanner.findExpired({ now });
    for (const row of expiredRows) {
      if (!isExpired(row.expiresAt, now)) continue;
      await this.scanner.markExpired({
        agencyId: row.agencyId,
        documentId: row.documentId,
        now,
      });
      markedExpired += 1;

      // Alerte critique sur tous les canaux, threshold = 0 (passé).
      const payload: DocumentAlertPayload = {
        documentId: row.documentId,
        agencyId: row.agencyId,
        workerId: row.workerId,
        type: row.type,
        expiresAt: row.expiresAt,
        thresholdDays: 0,
      };
      for (const channel of ALL_CHANNELS) {
        const sent = await this.dispatch(channel, payload, now);
        if (sent === 'sent') alertsSent += 1;
        else alertsSkippedDuplicate += 1;
      }
    }

    // 2. Documents VALID approchant un seuil.
    const cutoff = new Date(now.getTime() + maxThresholdDays() * 24 * 3600 * 1000);
    const expiringRows = await this.scanner.findExpiring({ cutoff });
    for (const row of expiringRows) {
      if (row.status !== 'VALID') continue;
      const threshold = nextCrossedThreshold(row.type, row.expiresAt, now);
      if (threshold === undefined) continue;

      const payload: DocumentAlertPayload = {
        documentId: row.documentId,
        agencyId: row.agencyId,
        workerId: row.workerId,
        type: row.type,
        expiresAt: row.expiresAt,
        thresholdDays: threshold,
      };
      for (const channel of ALL_CHANNELS) {
        const sent = await this.dispatch(channel, payload, now);
        if (sent === 'sent') alertsSent += 1;
        else alertsSkippedDuplicate += 1;
      }
    }

    return { alertsSent, alertsSkippedDuplicate, markedExpired };
  }

  private async dispatch(
    channel: AlertChannel,
    payload: DocumentAlertPayload,
    now: Date,
  ): Promise<'sent' | 'skipped'> {
    const already = await this.ledger.hasSentToday({
      agencyId: payload.agencyId,
      documentId: payload.documentId,
      thresholdDays: payload.thresholdDays,
      channel,
      now,
    });
    if (already) return 'skipped';

    switch (channel) {
      case 'manager_email':
        await this.managerEmail.sendExpiryAlert(payload);
        break;
      case 'worker_sms':
        await this.workerSms.sendExpiryAlert(payload);
        break;
      case 'worker_email':
        await this.workerEmail.sendExpiryAlert(payload);
        break;
      case 'webhook':
        await this.webhook.emit({
          type: payload.thresholdDays === 0 ? 'document.expired' : 'document.expiring',
          payload: {
            documentId: payload.documentId,
            workerId: payload.workerId,
            type: payload.type,
            expiresAt: payload.expiresAt.toISOString(),
            thresholdDays: payload.thresholdDays,
          },
        });
        break;
    }

    await this.ledger.record({
      documentId: payload.documentId,
      agencyId: payload.agencyId,
      workerId: payload.workerId,
      thresholdDays: payload.thresholdDays,
      channel,
      sentAt: now,
    });
    return 'sent';
  }
}

function maxThresholdDays(): number {
  // 90 j est le seuil le plus large parmi tous les types.
  return Math.max(
    ...(
      [
        'permit_work',
        'permit_driving',
        'avs_card',
        'lamal_cert',
        'diploma',
        'suva_sst',
        'caces',
        'other',
      ] as readonly WorkerDocumentType[]
    ).flatMap((t) => thresholdsFor(t)),
  );
}
