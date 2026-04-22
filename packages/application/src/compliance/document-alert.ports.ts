import type { WorkerDocumentType } from '@interim/domain';

export type AlertChannel = 'manager_email' | 'worker_sms' | 'worker_email' | 'webhook';

export interface DocumentAlertEntry {
  readonly documentId: string;
  readonly agencyId: string;
  readonly workerId: string;
  readonly thresholdDays: number;
  readonly channel: AlertChannel;
  readonly sentAt: Date;
}

/**
 * Ledger d'idempotence : empêche d'envoyer la même alerte (documentId,
 * thresholdDays, channel) plus d'une fois par 24h.
 */
export interface DocumentAlertLedger {
  hasSentToday(input: {
    agencyId: string;
    documentId: string;
    thresholdDays: number;
    channel: AlertChannel;
    now: Date;
  }): Promise<boolean>;
  record(entry: DocumentAlertEntry): Promise<void>;
}

export interface DocumentAlertPayload {
  readonly documentId: string;
  readonly agencyId: string;
  readonly workerId: string;
  readonly type: WorkerDocumentType;
  readonly expiresAt: Date;
  readonly thresholdDays: number;
}

export interface ManagerEmailNotifier {
  sendExpiryAlert(payload: DocumentAlertPayload): Promise<void>;
}

export interface WorkerSmsNotifier {
  sendExpiryAlert(payload: DocumentAlertPayload): Promise<void>;
}

export interface WorkerEmailNotifier {
  sendExpiryAlert(payload: DocumentAlertPayload): Promise<void>;
}

export interface OutboundWebhookEmitter {
  emit(event: { type: string; payload: Record<string, unknown> }): Promise<void>;
}

export interface ExpiringDocumentRow {
  readonly documentId: string;
  readonly agencyId: string;
  readonly workerId: string;
  readonly type: WorkerDocumentType;
  readonly status: 'VALID' | 'EXPIRED';
  readonly expiresAt: Date;
}

/**
 * Repository read-only utilisé par le scan : remonte tous les documents
 * VALID avec une date d'expiration, agnostique du tenant (le scan tourne
 * en mode système, hors contexte tenant).
 */
export interface ExpiringDocumentsScanner {
  /** Tous les docs VALID avec `expiresAt` <= cutoff (cutoff = now + maxThresholdDays). */
  findExpiring(input: { cutoff: Date }): Promise<readonly ExpiringDocumentRow[]>;
  /** Tous les docs VALID dont `expiresAt < now` (à passer EXPIRED). */
  findExpired(input: { now: Date }): Promise<readonly ExpiringDocumentRow[]>;
  /** Marque un document comme expiré. Idempotent. */
  markExpired(input: { agencyId: string; documentId: string; now: Date }): Promise<void>;
}
