import type { Role } from '@interim/domain';

/**
 * Auth client minimaliste pour la session navigateur.
 *
 * En dev/local, on lit un cookie `dev-session` posé manuellement (utile en
 * attendant que DETTE-014 — projet Firebase — soit faite).
 *
 * En staging/prod, le SDK Firebase sera initialisé ici (`firebase/auth`)
 * et `getSession()` lira l'ID token depuis IndexedDB.
 */
export interface UserSession {
  readonly userId: string;
  readonly agencyId: string;
  readonly role: Role;
  readonly displayName: string;
  readonly email: string;
}

const DEV_COOKIE = 'dev-session';

export function getDevSessionFromCookie(cookieHeader: string | undefined): UserSession | null {
  if (!cookieHeader) return null;
  const match = new RegExp(`(?:^|; )${DEV_COOKIE}=([^;]+)`).exec(cookieHeader);
  if (!match?.[1]) return null;
  try {
    const decoded = decodeURIComponent(match[1]);
    const parsed = JSON.parse(decoded) as Partial<UserSession>;
    if (!parsed.userId || !parsed.agencyId || !parsed.role) return null;
    return {
      userId: parsed.userId,
      agencyId: parsed.agencyId,
      role: parsed.role,
      displayName: parsed.displayName ?? 'Utilisateur',
      email: parsed.email ?? '',
    };
  } catch {
    return null;
  }
}

export function buildDevSessionCookie(session: UserSession): string {
  return `${DEV_COOKIE}=${encodeURIComponent(JSON.stringify(session))}; Path=/; SameSite=Strict`;
}
