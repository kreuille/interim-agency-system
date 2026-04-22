import { Phone } from '@interim/shared';
import type { AgencyId } from '@interim/domain';
import type { Clock, Result } from '@interim/shared';
import { SmsError, type OptOutRepository } from './sms-sender.js';

/**
 * Webhook entrant Swisscom/Twilio : SMS reçu d'un destinataire.
 * Si le body normalisé matche un mot-clé STOP/UNSUBSCRIBE, on opt-out
 * définitivement (RGPD/nLPD-friendly : auto-désinscription respectée
 * sans intervention humaine).
 *
 * Mots-clés acceptés (insensibles casse, après trim) : STOP, UNSUBSCRIBE,
 * STOPALL, ARRET, DESINSCRIPTION.
 */

const OPT_OUT_KEYWORDS = new Set([
  'STOP',
  'STOPALL',
  'UNSUBSCRIBE',
  'ARRET',
  'ARRÊT',
  'DESINSCRIPTION',
  'DÉSINSCRIPTION',
]);

export interface HandleOptOutInput {
  readonly agencyId: AgencyId;
  readonly from: string;
  readonly body: string;
}

export type HandleOptOutResult =
  | { readonly status: 'opted_out' }
  | { readonly status: 'not_a_keyword' };

export class HandleOptOutUseCase {
  constructor(
    private readonly optOut: OptOutRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: HandleOptOutInput): Promise<Result<HandleOptOutResult, SmsError>> {
    let phone;
    try {
      phone = Phone.parse(input.from);
    } catch (err) {
      return {
        ok: false,
        error: new SmsError('invalid_phone', err instanceof Error ? err.message : 'invalid_phone'),
      };
    }
    const normalized = input.body.trim().toUpperCase();
    if (!OPT_OUT_KEYWORDS.has(normalized)) {
      return { ok: true, value: { status: 'not_a_keyword' } };
    }
    await this.optOut.optOut(input.agencyId, phone.toString(), this.clock.now());
    return { ok: true, value: { status: 'opted_out' } };
  }
}
