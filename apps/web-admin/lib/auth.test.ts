import { describe, it, expect } from 'vitest';
import { buildDevSessionCookie, getDevSessionFromCookie } from './auth.js';

describe('dev session cookie', () => {
  const session = {
    userId: 'u-1',
    agencyId: 'a-1',
    role: 'agency_admin' as const,
    displayName: 'Anne Admin',
    email: 'anne@example.ch',
  };

  it('roundtrip build → parse', () => {
    const cookie = buildDevSessionCookie(session);
    const parsed = getDevSessionFromCookie(cookie);
    expect(parsed).toEqual(session);
  });

  it('returns null for missing cookie', () => {
    expect(getDevSessionFromCookie(undefined)).toBeNull();
    expect(getDevSessionFromCookie('other=foo')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(getDevSessionFromCookie('dev-session=notjson')).toBeNull();
  });

  it('returns null when required fields are missing', () => {
    expect(
      getDevSessionFromCookie(`dev-session=${encodeURIComponent(JSON.stringify({ userId: 'u' }))}`),
    ).toBeNull();
  });
});
