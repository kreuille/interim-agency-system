import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDevSessionFromCookie } from '../../../../../../lib/auth.js';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  const cookieHeader = cookies().toString();
  const session = getDevSessionFromCookie(cookieHeader);
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = await req.text();
  const upstream = await fetch(`${apiBase}/api/v1/workers/${params.id}/availability/slots`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer dev:${session.role}`,
    },
    body,
  });
  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}
