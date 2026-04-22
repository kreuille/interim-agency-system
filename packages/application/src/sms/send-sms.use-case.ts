import { randomUUID } from 'node:crypto';
import { Phone } from '@interim/shared';
import type { AgencyId } from '@interim/domain';
import type { Clock, Result } from '@interim/shared';
import { renderTemplate, type SmsLang, type SmsTemplateRegistry } from './template-renderer.js';
import { maskPhone } from './phone-mask.js';
import {
  SmsError,
  type OptOutRepository,
  type SmsLogRepository,
  type SmsSender,
} from './sms-sender.js';
import type { SmsRateLimiter } from './rate-limiter.js';

export interface SendSmsInput {
  readonly agencyId: AgencyId;
  readonly to: string; // E.164 ou format CH local — normalisé via Phone
  readonly templateCode: string;
  readonly variables: Readonly<Record<string, unknown>>;
  /**
   * Langue du template à rendre. Si absente, fallback à `fr` (cf.
   * `DEFAULT_SMS_LANG`). Choisi typiquement par le destinataire (canton
   * de résidence ou préférence worker).
   */
  readonly lang?: SmsLang;
}

export interface SendSmsOutput {
  readonly logId: string;
  readonly providerMessageId: string;
}

/**
 * Orchestre l'envoi d'un SMS :
 *   1. Normalise le numéro (Phone.parse → E.164).
 *   2. Vérifie opt-out.
 *   3. Vérifie rate limit (3 couches).
 *   4. Rend le template (validation variables).
 *   5. Appelle le provider.
 *   6. Persist le log.
 *
 * Sur erreur fatale (opt_out, rate_limited, template_*), aucune charge
 * n'est appliquée chez le provider. Sur erreur provider, le log est
 * inséré en `failed` avec la raison (audit trail).
 */
export class SendSmsUseCase {
  constructor(
    private readonly sender: SmsSender,
    private readonly templates: SmsTemplateRegistry,
    private readonly logs: SmsLogRepository,
    private readonly optOut: OptOutRepository,
    private readonly rateLimiter: SmsRateLimiter,
    private readonly clock: Clock,
    private readonly idFactory: () => string = randomUUID,
  ) {}

  async execute(input: SendSmsInput): Promise<Result<SendSmsOutput, SmsError>> {
    let phone;
    try {
      phone = Phone.parse(input.to);
    } catch (err) {
      return {
        ok: false,
        error: new SmsError('invalid_phone', err instanceof Error ? err.message : 'invalid_phone'),
      };
    }
    const e164 = phone.toString();
    const masked = maskPhone(e164);

    if (await this.optOut.isOptedOut(input.agencyId, e164)) {
      return { ok: false, error: new SmsError('opt_out', `${masked} a opt-out`) };
    }

    const decision = await this.rateLimiter.consume({
      agencyId: input.agencyId,
      phoneE164: e164,
      now: this.clock.now(),
    });
    if (!decision.allowed) {
      return {
        ok: false,
        error: new SmsError(
          'rate_limited',
          `Rate limit ${decision.reason ?? 'unknown'} retry in ${String(decision.retryAfterSeconds)}s`,
        ),
      };
    }

    let rendered;
    try {
      rendered = renderTemplate(this.templates, input.templateCode, input.variables, input.lang);
    } catch (err) {
      if (err instanceof SmsError) return { ok: false, error: err };
      throw err;
    }

    const logId = this.idFactory();
    const sentAt = this.clock.now();

    try {
      const result = await this.sender.send({ to: e164, body: rendered.body });
      await this.logs.insert({
        id: logId,
        agencyId: input.agencyId,
        toMasked: masked,
        templateCode: rendered.templateCode,
        provider: result.provider,
        providerMessageId: result.providerMessageId,
        status: 'sent',
        sentAt,
        failureReason: undefined,
        createdAt: sentAt,
      });
      return { ok: true, value: { logId, providerMessageId: result.providerMessageId } };
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown_provider_error';
      await this.logs.insert({
        id: logId,
        agencyId: input.agencyId,
        toMasked: masked,
        templateCode: rendered.templateCode,
        provider: 'noop',
        providerMessageId: undefined,
        status: 'failed',
        sentAt: undefined,
        failureReason: reason,
        createdAt: sentAt,
      });
      return {
        ok: false,
        error: new SmsError('provider_transient', reason, err),
      };
    }
  }
}
