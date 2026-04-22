import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDevSessionFromCookie } from '../../../../lib/auth.js';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

/**
 * Proxy vers l'export CSV API pour validation croisée chef équipe MP.
 * Authenticated proxy (session cookie), passe l'autorisation backend.
 */
export async function GET(): Promise<Response> {
  const cookieHeader = cookies().toString();
  const session = getDevSessionFromCookie(cookieHeader);
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const upstream = await fetch(`${apiBase}/api/v1/timesheets/export.csv`, {
    headers: { authorization: `Bearer dev:${session.role}` },
  });
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="timesheets-hebdo.csv"',
    },
  });
}
