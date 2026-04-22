import { NextResponse } from 'next/server';

/**
 * POST /api/auth/request-link
 *
 * **Stub dev** : accepte toute adresse e-mail, renvoie 200 sans rien faire.
 * Le client redirige ensuite vers /login?sent=... où l'utilisateur peut
 * cliquer "Activer la session" qui appelle /api/auth/verify.
 *
 * En prod (DETTE-024) : génère un token signé, envoie l'e-mail via
 * Firebase Identity Platform → Mailgun/SendGrid/Mailchimp Mandrill avec
 * lien `/api/auth/verify?token=...`.
 */
export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { email?: string } | null;
  const email = body?.email?.trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  }
  // En dev : log uniquement.
  console.warn('[portal-dev] magic link requested for', email);
  return NextResponse.json({ ok: true });
}
