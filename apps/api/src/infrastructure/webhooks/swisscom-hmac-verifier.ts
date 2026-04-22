import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Vérification HMAC pour les webhooks Swisscom Trust Signing Services.
 *
 * Swisscom AIS / Trust Sign expose des callbacks pour notifier la
 * complétion d'une enveloppe (signed / expired / cancelled). Format
 * minimum (cf. `docs/swisscom-trust-integration.md` — à rédiger pour
 * production) :
 *
 *   - Header `x-swisscom-event-id`     : UUID v4 unique par event
 *   - Header `x-swisscom-timestamp`    : ISO 8601 UTC d'émission
 *   - Header `x-swisscom-signature`    : `sha256=<hex>` (préfixe optionnel)
 *   - Body   : raw JSON bytes (NE PAS reparser avant vérif)
 *
 * Payload signé : `${eventId}.${timestamp}.${rawBody}` (même schéma que
 * MP pour homogénéité interne ; à ajuster côté production selon le
 * document final fourni par Swisscom Sandbox).
 *
 * Vérifications :
 *   1. Présence des headers.
 *   2. Format signature (hex 64 chars).
 *   3. Tolérance horloge ±5 min (CLAUDE.md §4).
 *   4. Comparaison constant-time. Rotation des secrets supportée
 *      (current + previous pendant la grace period).
 */

export type SwisscomHmacFailure =
  | { readonly kind: 'missing_header'; readonly header: string }
  | { readonly kind: 'invalid_signature_format' }
  | { readonly kind: 'invalid_timestamp_format' }
  | { readonly kind: 'timestamp_skew_too_large'; readonly skewMs: number }
  | { readonly kind: 'signature_mismatch' };

export type SwisscomHmacResult =
  | { readonly ok: true; readonly secretVersion: 'current' | 'previous' }
  | { readonly ok: false; readonly failure: SwisscomHmacFailure };

export const SWISSCOM_DEFAULT_SKEW_MS = 5 * 60 * 1000;

export interface SwisscomHmacSecretBundle {
  readonly current: string;
  readonly previous?: string;
}

export interface VerifySwisscomHmacInput {
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly rawBody: Buffer | string;
  readonly secrets: SwisscomHmacSecretBundle;
  readonly now: Date;
  readonly skewMs?: number;
}

export function verifySwisscomHmac(input: VerifySwisscomHmacInput): SwisscomHmacResult {
  const eventId = pickHeader(input.headers, 'x-swisscom-event-id');
  if (!eventId) return failure({ kind: 'missing_header', header: 'x-swisscom-event-id' });

  const timestamp = pickHeader(input.headers, 'x-swisscom-timestamp');
  if (!timestamp) return failure({ kind: 'missing_header', header: 'x-swisscom-timestamp' });

  const signature = pickHeader(input.headers, 'x-swisscom-signature');
  if (!signature) return failure({ kind: 'missing_header', header: 'x-swisscom-signature' });

  const sigHex = signature.startsWith('sha256=') ? signature.slice('sha256='.length) : signature;
  if (!/^[0-9a-f]{64}$/i.test(sigHex)) return failure({ kind: 'invalid_signature_format' });

  const ts = new Date(timestamp);
  if (Number.isNaN(ts.getTime())) return failure({ kind: 'invalid_timestamp_format' });

  const skewMs = Math.abs(input.now.getTime() - ts.getTime());
  const tolerance = input.skewMs ?? SWISSCOM_DEFAULT_SKEW_MS;
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

/**
 * Helper test : génère le header x-swisscom-signature attendu pour un
 * payload donné. Utilisé par les tests d'intégration et le mock.
 */
export function signSwisscomPayload(input: {
  readonly eventId: string;
  readonly timestamp: string;
  readonly rawBody: string;
  readonly secret: string;
}): string {
  const payload = `${input.eventId}.${input.timestamp}.${input.rawBody}`;
  const hex = createHmac('sha256', input.secret).update(payload).digest('hex');
  return `sha256=${hex}`;
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

function failure(f: SwisscomHmacFailure): SwisscomHmacResult {
  return { ok: false, failure: f };
}
