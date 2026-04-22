import { describe, expect, it } from 'vitest';
import { signSwisscomPayload, verifySwisscomHmac } from './swisscom-hmac-verifier.js';

const NOW = new Date('2026-04-22T08:00:00Z');
const SECRET = 'swisscom-secret-current';
const PREVIOUS = 'swisscom-secret-previous';

function buildHeaders(opts: {
  readonly eventId: string;
  readonly timestamp: string;
  readonly signature: string;
}): Record<string, string> {
  return {
    'x-swisscom-event-id': opts.eventId,
    'x-swisscom-timestamp': opts.timestamp,
    'x-swisscom-signature': opts.signature,
  };
}

describe('verifySwisscomHmac', () => {
  it('signature valide avec secret current → ok', () => {
    const ts = NOW.toISOString();
    const rawBody = JSON.stringify({ envelopeId: 'env-1', status: 'signed' });
    const sig = signSwisscomPayload({
      eventId: 'evt-1',
      timestamp: ts,
      rawBody,
      secret: SECRET,
    });
    const result = verifySwisscomHmac({
      headers: buildHeaders({ eventId: 'evt-1', timestamp: ts, signature: sig }),
      rawBody,
      secrets: { current: SECRET },
      now: NOW,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.secretVersion).toBe('current');
  });

  it('signature valide avec previous secret pendant rotation → ok previous', () => {
    const ts = NOW.toISOString();
    const rawBody = '{}';
    const sig = signSwisscomPayload({
      eventId: 'evt-rot',
      timestamp: ts,
      rawBody,
      secret: PREVIOUS,
    });
    const result = verifySwisscomHmac({
      headers: buildHeaders({ eventId: 'evt-rot', timestamp: ts, signature: sig }),
      rawBody,
      secrets: { current: SECRET, previous: PREVIOUS },
      now: NOW,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.secretVersion).toBe('previous');
  });

  it('header manquant → missing_header', () => {
    const result = verifySwisscomHmac({
      headers: {},
      rawBody: '{}',
      secrets: { current: SECRET },
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok && result.failure.kind === 'missing_header') {
      expect(result.failure.header).toBe('x-swisscom-event-id');
    }
  });

  it('signature mal formée → invalid_signature_format', () => {
    const ts = NOW.toISOString();
    const result = verifySwisscomHmac({
      headers: buildHeaders({ eventId: 'evt-x', timestamp: ts, signature: 'sha256=zzz' }),
      rawBody: '{}',
      secrets: { current: SECRET },
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.kind).toBe('invalid_signature_format');
  });

  it('timestamp hors fenêtre 5min → timestamp_skew_too_large', () => {
    const ts = new Date(NOW.getTime() - 6 * 60 * 1000).toISOString();
    const sig = signSwisscomPayload({
      eventId: 'evt-old',
      timestamp: ts,
      rawBody: '{}',
      secret: SECRET,
    });
    const result = verifySwisscomHmac({
      headers: buildHeaders({ eventId: 'evt-old', timestamp: ts, signature: sig }),
      rawBody: '{}',
      secrets: { current: SECRET },
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok && result.failure.kind === 'timestamp_skew_too_large') {
      expect(result.failure.skewMs).toBeGreaterThan(5 * 60 * 1000);
    }
  });

  it('signature ne matche pas → signature_mismatch', () => {
    const ts = NOW.toISOString();
    const sig = signSwisscomPayload({
      eventId: 'evt-1',
      timestamp: ts,
      rawBody: '{}',
      secret: 'wrong-secret',
    });
    const result = verifySwisscomHmac({
      headers: buildHeaders({ eventId: 'evt-1', timestamp: ts, signature: sig }),
      rawBody: '{}',
      secrets: { current: SECRET },
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.kind).toBe('signature_mismatch');
  });

  it('accepte signature sans préfixe sha256= (raw hex)', () => {
    const ts = NOW.toISOString();
    const rawBody = '{}';
    const withPrefix = signSwisscomPayload({
      eventId: 'evt-1',
      timestamp: ts,
      rawBody,
      secret: SECRET,
    });
    const noPrefix = withPrefix.slice('sha256='.length);
    const result = verifySwisscomHmac({
      headers: buildHeaders({ eventId: 'evt-1', timestamp: ts, signature: noPrefix }),
      rawBody,
      secrets: { current: SECRET },
      now: NOW,
    });
    expect(result.ok).toBe(true);
  });
});
