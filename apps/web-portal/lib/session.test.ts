import { describe, expect, it } from 'vitest';
import {
  buildPortalLogoutCookie,
  buildPortalSessionCookie,
  getPortalSessionFromCookie,
  type PortalSession,
} from './session.js';

describe('portal session cookie', () => {
  const session: PortalSession = {
    email: 'jean.dupont@example.ch',
    workerId: 'worker-123',
    issuedAt: '2026-04-22T08:00:00.000Z',
  };

  it('round-trip cookie set then read', () => {
    const cookie = buildPortalSessionCookie(session);
    expect(cookie.startsWith('portal_session=')).toBe(true);
    const value = cookie.slice('portal_session='.length, cookie.indexOf(';'));
    const reconstituted = `portal_session=${value}`;
    const parsed = getPortalSessionFromCookie(reconstituted);
    expect(parsed).toEqual(session);
  });

  it('returns undefined for missing cookie', () => {
    expect(getPortalSessionFromCookie('other=42')).toBeUndefined();
  });

  it('returns undefined for invalid base64', () => {
    expect(getPortalSessionFromCookie('portal_session=not_base64!!!')).toBeUndefined();
  });

  it('returns undefined for cookie missing required fields', () => {
    const malformed = encodeURIComponent(
      Buffer.from(JSON.stringify({ email: 'x@y.z' }), 'utf-8').toString('base64'),
    );
    expect(getPortalSessionFromCookie(`portal_session=${malformed}`)).toBeUndefined();
  });

  it('logout cookie has Max-Age=0', () => {
    expect(buildPortalLogoutCookie()).toContain('Max-Age=0');
  });
});
