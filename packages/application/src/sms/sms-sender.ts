import type { AgencyId } from '@interim/domain';

/**
 * Provider SMS supporté. `noop` est utilisé en dev/test/CI : aucun envoi
 * réel, juste log + DB. Swisscom Enterprise SMS est le primaire en CH
 * (numéros gérés en Suisse, conformité nLPD). Twilio est le fallback si
 * Swisscom est down (basculé via `smsProvider` config).
 */
export const SMS_PROVIDERS = ['swisscom', 'twilio', 'noop'] as const;
export type SmsProvider = (typeof SMS_PROVIDERS)[number];

export const SMS_STATUSES = ['queued', 'sent', 'delivered', 'failed', 'opt_out'] as const;
export type SmsStatus = (typeof SMS_STATUSES)[number];

/**
 * Erreurs typées pour les use cases SMS.
 */
export type SmsErrorKind =
  | 'invalid_phone'
  | 'opt_out'
  | 'rate_limited'
  | 'template_not_found'
  | 'template_missing_variable'
  | 'provider_transient'
  | 'provider_permanent';

export class SmsError extends Error {
  constructor(
    public readonly kind: SmsErrorKind,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'SmsError';
  }
}

export interface SmsSendInput {
  /** E.164, ex. `+41791234567`. */
  readonly to: string;
  readonly body: string;
}

export interface SmsSendResult {
  /** ID natif fournisseur (utile pour corréler les webhooks delivery). */
  readonly providerMessageId: string;
  readonly provider: SmsProvider;
}

/**
 * Port outbound : envoi SMS via un fournisseur. Implémentations :
 *   - `NoopSmsSender` (CI/dev)
 *   - `SwisscomSmsSender` (DETTE-037 — sandbox prod requis)
 *   - `TwilioSmsSender` (DETTE-038)
 */
export interface SmsSender {
  send(input: SmsSendInput): Promise<SmsSendResult>;
}

/**
 * Log de chaque tentative d'envoi (succès ou échec) : table `sms_logs`.
 * Sert de journal d'audit + corrélation webhook delivery + opt-out.
 */
export interface SmsLogRecord {
  readonly id: string;
  readonly agencyId: AgencyId;
  readonly toMasked: string;
  readonly templateCode: string;
  readonly provider: SmsProvider;
  readonly providerMessageId: string | undefined;
  readonly status: SmsStatus;
  readonly sentAt: Date | undefined;
  readonly deliveredAt: Date | undefined;
  readonly failureReason: string | undefined;
  readonly createdAt: Date;
}

export interface InsertSmsLogInput {
  readonly id: string;
  readonly agencyId: AgencyId;
  readonly toMasked: string;
  readonly templateCode: string;
  readonly provider: SmsProvider;
  readonly providerMessageId: string | undefined;
  readonly status: SmsStatus;
  readonly sentAt: Date | undefined;
  readonly failureReason: string | undefined;
  readonly createdAt: Date;
}

export interface SmsLogRepository {
  insert(input: InsertSmsLogInput): Promise<void>;
  /**
   * Mise à jour status/deliveredAt par `providerMessageId` (callback
   * provider quand le SMS est `delivered` ou `failed`).
   */
  updateByProviderMessageId(input: {
    readonly providerMessageId: string;
    readonly provider: SmsProvider;
    readonly status: SmsStatus;
    readonly deliveredAt?: Date;
    readonly failureReason?: string;
  }): Promise<void>;

  findRecent(agencyId: AgencyId, limit: number): Promise<readonly SmsLogRecord[]>;
}

/**
 * Mémoire des numéros opt-out (mot-clé STOP reçu). Les envois suivants
 * vers ces numéros doivent être bloqués → SmsError(opt_out).
 *
 * Implémentation Postgres : table `sms_opt_outs(agencyId, phone)`.
 */
export interface OptOutRepository {
  isOptedOut(agencyId: AgencyId, phoneE164: string): Promise<boolean>;
  optOut(agencyId: AgencyId, phoneE164: string, at: Date): Promise<void>;
}
