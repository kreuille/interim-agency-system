import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDevSessionFromCookie } from '../../../lib/auth.js';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(req: Request): Promise<Response> {
  const cookieHeader = cookies().toString();
  const session = getDevSessionFromCookie(cookieHeader);
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const url = new URL(req.url);
  const upstream = await fetch(`${apiBase}/api/v1/proposals?${url.searchParams.toString()}`, {
    cache: 'no-store',
    headers: { authorization: `Bearer dev:${session.role}` },
  });
  return new NextResponse(await upstream.text(), {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}
