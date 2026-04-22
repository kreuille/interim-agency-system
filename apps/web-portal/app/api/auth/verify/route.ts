import { NextResponse } from 'next/server';
import { buildPortalSessionCookie } from '../../../../lib/session.js';

/**
 * POST /api/auth/verify
 *
 * **Stub dev** : génère un workerId déterministe à partir de l'e-mail
 * (`worker-${hash}`) et pose un cookie `portal_session`. En prod
 * (DETTE-024), vérifie le token JWT envoyé dans l'e-mail magique
 * + check expiration ≤ 15 min + single-use anti-replay (Redis).
 */
export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { email?: string } | null;
  const email = body?.email?.trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  }

  // workerId dérivé déterministe (dev only — en prod, lookup en base).
  const hash = simpleHash(email);
  const workerId = `worker-${hash}`;

  const cookie = buildPortalSessionCookie({
    email,
    workerId,
    issuedAt: new Date().toISOString(),
  });

  return new NextResponse(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'set-cookie': cookie,
    },
  });
}

function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0').slice(0, 8);
}
