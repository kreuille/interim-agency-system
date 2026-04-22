import type { AgencyId } from '@interim/domain';

/**
 * Rate limiter SMS par couches :
 *  - 10 / minute / numéro destinataire (anti-flood worker)
 *  - 100 / heure / tenant (limite raisonnable petite agence)
 *  - 500 / jour / tenant (limite quotidienne facturation)
 *
 * Implémentations recommandées :
 *  - dev : `InMemorySmsRateLimiter` (Map locales avec TTL)
 *  - prod : Redis incremnt + EXPIRE par fenêtre (DETTE-040)
 */
export interface SmsRateLimiter {
  consume(input: { agencyId: AgencyId; phoneE164: string; now: Date }): Promise<RateLimitDecision>;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly reason?: 'per_phone_minute' | 'per_tenant_hour' | 'per_tenant_day';
  readonly retryAfterSeconds?: number;
}

export const SMS_RATE_LIMITS = {
  perPhonePerMinute: 10,
  perTenantPerHour: 100,
  perTenantPerDay: 500,
} as const;

interface Bucket {
  count: number;
  windowStartMs: number;
}

/**
 * Implémentation en mémoire pour tests + dev. Buckets fixes par
 * fenêtre (pas glissants — simplification acceptable pour MVP).
 */
export class InMemorySmsRateLimiter implements SmsRateLimiter {
  private readonly perPhone = new Map<string, Bucket>();
  private readonly perTenantHour = new Map<string, Bucket>();
  private readonly perTenantDay = new Map<string, Bucket>();

  consume(input: { agencyId: AgencyId; phoneE164: string; now: Date }): Promise<RateLimitDecision> {
    const nowMs = input.now.getTime();

    const phoneKey = `${input.agencyId}::${input.phoneE164}`;
    const phoneBucket = bumpBucket(this.perPhone, phoneKey, nowMs, 60_000);
    if (phoneBucket.count > SMS_RATE_LIMITS.perPhonePerMinute) {
      return Promise.resolve({
        allowed: false,
        reason: 'per_phone_minute',
        retryAfterSeconds: secondsLeft(phoneBucket.windowStartMs, 60_000, nowMs),
      });
    }

    const hourBucket = bumpBucket(this.perTenantHour, input.agencyId, nowMs, 3_600_000);
    if (hourBucket.count > SMS_RATE_LIMITS.perTenantPerHour) {
      return Promise.resolve({
        allowed: false,
        reason: 'per_tenant_hour',
        retryAfterSeconds: secondsLeft(hourBucket.windowStartMs, 3_600_000, nowMs),
      });
    }

    const dayBucket = bumpBucket(this.perTenantDay, input.agencyId, nowMs, 86_400_000);
    if (dayBucket.count > SMS_RATE_LIMITS.perTenantPerDay) {
      return Promise.resolve({
        allowed: false,
        reason: 'per_tenant_day',
        retryAfterSeconds: secondsLeft(dayBucket.windowStartMs, 86_400_000, nowMs),
      });
    }

    return Promise.resolve({ allowed: true });
  }
}

function bumpBucket(
  map: Map<string, Bucket>,
  key: string,
  nowMs: number,
  windowMs: number,
): Bucket {
  const existing = map.get(key);
  if (!existing || nowMs - existing.windowStartMs >= windowMs) {
    const fresh: Bucket = { count: 1, windowStartMs: nowMs };
    map.set(key, fresh);
    return fresh;
  }
  existing.count += 1;
  return existing;
}

function secondsLeft(windowStartMs: number, windowMs: number, nowMs: number): number {
  return Math.max(1, Math.ceil((windowStartMs + windowMs - nowMs) / 1000));
}
