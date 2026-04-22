import { describe, expect, it } from 'vitest';
import { asAgencyId } from '@interim/domain';
import { InMemorySmsRateLimiter, SMS_RATE_LIMITS } from './rate-limiter.js';

const AGENCY = asAgencyId('agency-a');
const PHONE = '+41791234567';
const NOW = new Date('2026-04-22T08:00:00Z');

describe('InMemorySmsRateLimiter', () => {
  it("autorise jusqu'à perPhonePerMinute, refuse au-delà", async () => {
    const rl = new InMemorySmsRateLimiter();
    for (let i = 0; i < SMS_RATE_LIMITS.perPhonePerMinute; i++) {
      const d = await rl.consume({ agencyId: AGENCY, phoneE164: PHONE, now: NOW });
      expect(d.allowed).toBe(true);
    }
    const blocked = await rl.consume({ agencyId: AGENCY, phoneE164: PHONE, now: NOW });
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe('per_phone_minute');
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('réinitialise après la fenêtre 60s', async () => {
    const rl = new InMemorySmsRateLimiter();
    for (let i = 0; i < SMS_RATE_LIMITS.perPhonePerMinute; i++) {
      await rl.consume({ agencyId: AGENCY, phoneE164: PHONE, now: NOW });
    }
    const after = new Date(NOW.getTime() + 61_000);
    const next = await rl.consume({ agencyId: AGENCY, phoneE164: PHONE, now: after });
    expect(next.allowed).toBe(true);
  });

  it('bloque au seuil tenant per hour avec un autre numéro', async () => {
    const rl = new InMemorySmsRateLimiter();
    // Numéros différents → la limite per_phone_minute n'est pas atteinte.
    // On envoie 100 SMS vers 100 numéros distincts.
    for (let i = 0; i < SMS_RATE_LIMITS.perTenantPerHour; i++) {
      const d = await rl.consume({
        agencyId: AGENCY,
        phoneE164: `+41791234${String(i).padStart(3, '0')}`,
        now: NOW,
      });
      expect(d.allowed).toBe(true);
    }
    const blocked = await rl.consume({
      agencyId: AGENCY,
      phoneE164: '+41799999999',
      now: NOW,
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe('per_tenant_hour');
  });
});
