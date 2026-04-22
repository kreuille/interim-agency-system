import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SKEW_MS,
  verifyMoveplannerHmac,
  type WebhookSecretBundle,
} from './hmac-verifier.js';

const NOW = new Date('2026-04-22T08:00:00Z');
const SECRET_CURRENT = 'mp-secret-v2';
const SECRET_PREVIOUS = 'mp-secret-v1';

function sign(secret: string, eventId: string, timestamp: string, body: string): string {
  return createHmac('sha256', secret).update(`${eventId}.${timestamp}.${body}`).digest('hex');
}

function buildHeaders(eventId: string, timestamp: string, signature: string) {
  return {
    'x-moveplanner-event-id': eventId,
    'x-moveplanner-timestamp': timestamp,
    'x-moveplanner-signature': `sha256=${signature}`,
  };
}

const SECRETS: WebhookSecretBundle = {
  current: SECRET_CURRENT,
  previous: SECRET_PREVIOUS,
};

describe('verifyMoveplannerHmac', () => {
  it('signature valide avec secret courant → ok current', () => {
    const eventId = 'evt-1';
    const ts = NOW.toISOString();
    const body = JSON.stringify({ kind: 'mission.proposed', requestId: 'r-1' });
    const sig = sign(SECRET_CURRENT, eventId, ts, body);
    const result = verifyMoveplannerHmac({
      headers: buildHeaders(eventId, ts, sig),
      rawBody: body,
      secrets: SECRETS,
      now: NOW,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.secretVersion).toBe('current');
  });

  it('signature valide avec secret précédent → ok previous (grace rotation)', () => {
    const eventId = 'evt-2';
    const ts = NOW.toISOString();
    const body = '{}';
    const sig = sign(SECRET_PREVIOUS, eventId, ts, body);
    const result = verifyMoveplannerHmac({
      headers: buildHeaders(eventId, ts, sig),
      rawBody: body,
      secrets: SECRETS,
      now: NOW,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.secretVersion).toBe('previous');
  });

  it('signature avec un 3e secret non présent → signature_mismatch', () => {
    const eventId = 'evt-3';
    const ts = NOW.toISOString();
    const body = '{}';
    const sig = sign('mp-secret-v3-not-yet-active', eventId, ts, body);
    const result = verifyMoveplannerHmac({
      headers: buildHeaders(eventId, ts, sig),
      rawBody: body,
      secrets: SECRETS,
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.kind).toBe('signature_mismatch');
  });

  it('body modifié après signature → signature_mismatch (constant-time)', () => {
    const eventId = 'evt-4';
    const ts = NOW.toISOString();
    const original = '{"kind":"x"}';
    const sig = sign(SECRET_CURRENT, eventId, ts, original);
    const result = verifyMoveplannerHmac({
      headers: buildHeaders(eventId, ts, sig),
      rawBody: '{"kind":"y"}',
      secrets: SECRETS,
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.kind).toBe('signature_mismatch');
  });

  it('timestamp à +6 min → timestamp_skew_too_large', () => {
    const eventId = 'evt-5';
    const ts = new Date(NOW.getTime() + 6 * 60 * 1000).toISOString();
    const body = '{}';
    const sig = sign(SECRET_CURRENT, eventId, ts, body);
    const result = verifyMoveplannerHmac({
      headers: buildHeaders(eventId, ts, sig),
      rawBody: body,
      secrets: SECRETS,
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.kind).toBe('timestamp_skew_too_large');
  });

  it('timestamp à -4 min (passé) → ok (dans la fenêtre)', () => {
    const eventId = 'evt-6';
    const ts = new Date(NOW.getTime() - 4 * 60 * 1000).toISOString();
    const body = '{}';
    const sig = sign(SECRET_CURRENT, eventId, ts, body);
    const result = verifyMoveplannerHmac({
      headers: buildHeaders(eventId, ts, sig),
      rawBody: body,
      secrets: SECRETS,
      now: NOW,
    });
    expect(result.ok).toBe(true);
  });

  it('header x-moveplanner-event-id manquant → missing_header', () => {
    const result = verifyMoveplannerHmac({
      headers: {
        'x-moveplanner-timestamp': NOW.toISOString(),
        'x-moveplanner-signature': 'sha256=' + 'a'.repeat(64),
      },
      rawBody: '{}',
      secrets: SECRETS,
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok && result.failure.kind === 'missing_header') {
      expect(result.failure.header).toBe('x-moveplanner-event-id');
    }
  });

  it('signature non hex (format invalide) → invalid_signature_format', () => {
    const result = verifyMoveplannerHmac({
      headers: {
        'x-moveplanner-event-id': 'evt-7',
        'x-moveplanner-timestamp': NOW.toISOString(),
        'x-moveplanner-signature': 'sha256=not_hex_at_all',
      },
      rawBody: '{}',
      secrets: SECRETS,
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.kind).toBe('invalid_signature_format');
  });

  it('timestamp non ISO → invalid_timestamp_format', () => {
    const result = verifyMoveplannerHmac({
      headers: {
        'x-moveplanner-event-id': 'evt-8',
        'x-moveplanner-timestamp': 'pas-une-date',
        'x-moveplanner-signature': 'sha256=' + 'a'.repeat(64),
      },
      rawBody: '{}',
      secrets: SECRETS,
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.kind).toBe('invalid_timestamp_format');
  });

  it('accepte signature sans préfixe sha256= (compat MP older)', () => {
    const eventId = 'evt-9';
    const ts = NOW.toISOString();
    const body = '{}';
    const sig = sign(SECRET_CURRENT, eventId, ts, body);
    const result = verifyMoveplannerHmac({
      headers: {
        'x-moveplanner-event-id': eventId,
        'x-moveplanner-timestamp': ts,
        'x-moveplanner-signature': sig, // sans préfixe
      },
      rawBody: body,
      secrets: SECRETS,
      now: NOW,
    });
    expect(result.ok).toBe(true);
  });

  it('DEFAULT_SKEW_MS = 5 minutes (sanity check)', () => {
    expect(DEFAULT_SKEW_MS).toBe(5 * 60 * 1000);
  });
});
