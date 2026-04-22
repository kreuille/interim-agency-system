/**
 * Session intérimaire pour le portail PWA.
 *
 * **Stub dev** : un cookie `portal_session=<base64(json)>` mémorise
 * `email` + `workerId`. En prod (DETTE-024), Firebase Identity Platform
 * génère un magic-link avec lien single-use 15 min, puis remplace cette
 * session par un ID token JWT.
 */

const COOKIE_NAME = 'portal_session';
const COOKIE_MAX_AGE_S = 30 * 24 * 3600; // 30 jours (refresh à chaque visite)

export interface PortalSession {
  readonly email: string;
  readonly workerId: string;
  /** ISO timestamp de création. */
  readonly issuedAt: string;
}

export function getPortalSessionFromCookie(cookieHeader: string): PortalSession | undefined {
  const match = /(?:^|;\s*)portal_session=([^;]+)/.exec(cookieHeader);
  if (!match?.[1]) return undefined;
  try {
    const decoded = Buffer.from(decodeURIComponent(match[1]), 'base64').toString('utf-8');
    const parsed = JSON.parse(decoded) as Partial<PortalSession>;
    if (!parsed.email || !parsed.workerId || !parsed.issuedAt) return undefined;
    return {
      email: parsed.email,
      workerId: parsed.workerId,
      issuedAt: parsed.issuedAt,
    };
  } catch {
    return undefined;
  }
}

export function buildPortalSessionCookie(session: PortalSession): string {
  const json = JSON.stringify(session);
  const value = encodeURIComponent(Buffer.from(json, 'utf-8').toString('base64'));
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${String(COOKIE_MAX_AGE_S)}`;
}

export function buildPortalLogoutCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
