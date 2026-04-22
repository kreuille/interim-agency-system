import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Vérifie une signature HMAC-SHA256 envoyée par MovePlanner.
 *
 * Format attendu (cf. `docs/02-partners-specification.md §7.5`) :
 *   - Header `x-moveplanner-event-id`     : UUID v4 unique par event
 *   - Header `x-moveplanner-timestamp`    : ISO 8601 UTC d'émission
 *   - Header `x-moveplanner-signature`    : `sha256=<hex>` (préfixe optionnel)
 *   - Body   : raw JSON bytes (NE PAS reparser avant vérif)
 *
 * Le payload signé est `${eventId}.${timestamp}.${rawBody}` (cf. mock
 * `apps/mock-moveplanner/src/hmac.ts`).
 *
 * Vérifications :
 *   1. Format header / timestamp valides.
 *   2. Tolérance d'horloge : ±5 min (cf. CLAUDE.md §4 et spec MP).
 *   3. Calcul HMAC pour CHAQUE secret accepté (rotation 90j → on accepte
 *      `currentSecret` + `previousSecret` pendant la grace period 7j).
 *   4. Comparaison constant-time via `timingSafeEqual`.
 */

export type HmacFailure =
  | { readonly kind: 'missing_header'; readonly header: string }
  | { readonly kind: 'invalid_signature_format' }
  | { readonly kind: 'invalid_timestamp_format' }
  | { readonly kind: 'timestamp_skew_too_large'; readonly skewMs: number }
  | { readonly kind: 'signature_mismatch' };

export type HmacResult =
  | { readonly ok: true; readonly secretVersion: 'current' | 'previous' }
  | { readonly ok: false; readonly failure: HmacFailure };

export const DEFAULT_SKEW_MS = 5 * 60 * 1000;

export interface VerifyHmacInput {
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly rawBody: Buffer | string;
  readonly secrets: WebhookSecretBundle;
  readonly now: Date;
  /** Tolérance d'horloge, default 5 min. */
  readonly skewMs?: number;
}

export interface WebhookSecretBundle {
  readonly current: string;
  readonly previous?: string;
}

export function verifyMoveplannerHmac(input: VerifyHmacInput): HmacResult {
  const eventId = pickHeader(input.headers, 'x-moveplanner-event-id');
  if (!eventId) return failure({ kind: 'missing_header', header: 'x-moveplanner-event-id' });

  const timestamp = pickHeader(input.headers, 'x-moveplanner-timestamp');
  if (!timestamp) return failure({ kind: 'missing_header', header: 'x-moveplanner-timestamp' });

  const signature = pickHeader(input.headers, 'x-moveplanner-signature');
  if (!signature) return failure({ kind: 'missing_header', header: 'x-moveplanner-signature' });

  // `sha256=<hex>` ou `<hex>` — accepte les deux.
  const sigHex = signature.startsWith('sha256=') ? signature.slice('sha256='.length) : signature;
  if (!/^[0-9a-f]{64}$/i.test(sigHex)) return failure({ kind: 'invalid_signature_format' });

  const ts = new Date(timestamp);
  if (Number.isNaN(ts.getTime())) return failure({ kind: 'invalid_timestamp_format' });

  const skewMs = Math.abs(input.now.getTime() - ts.getTime());
  const tolerance = input.skewMs ?? DEFAULT_SKEW_MS;
  if (skewMs > tolerance) return failure({ kind: 'timestamp_skew_too_large', skewMs });

  const rawString =
    typeof input.rawBody === 'string' ? input.rawBody : input.rawBody.toString('utf-8');
  const payload = `${eventId}.${timestamp}.${rawString}`;

  if (matchesSecret(payload, sigHex, input.secrets.current)) {
    return { ok: true, secretVersion: 'current' };
  }
  if (input.secrets.previous && matchesSecret(payload, sigHex, input.secrets.previous)) {
    return { ok: true, secretVersion: 'previous' };
  }
  return failure({ kind: 'signature_mismatch' });
}

function matchesSecret(payload: string, sigHex: string, secret: string): boolean {
  const computed = createHmac('sha256', secret).update(payload).digest();
  let received: Buffer;
  try {
    received = Buffer.from(sigHex, 'hex');
  } catch {
    return false;
  }
  if (received.length !== computed.length) return false;
  return timingSafeEqual(computed, received);
}

function pickHeader(
  headers: Readonly<Record<string, string | string[] | undefined>>,
  name: string,
): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value[0];
  return value;
}

function failure(f: HmacFailure): HmacResult {
  return { ok: false, failure: f };
}
