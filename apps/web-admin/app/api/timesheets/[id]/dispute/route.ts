import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomUUID } from 'node:crypto';
import { getDevSessionFromCookie } from '../../../../../lib/auth.js';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

interface DisputeBody {
  readonly reason?: string;
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  const cookieHeader = cookies().toString();
  const session = getDevSessionFromCookie(cookieHeader);
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const parsed = (await req.json().catch(() => ({}))) as DisputeBody;
  const reason = (parsed.reason ?? '').trim();
  if (reason.length < 10 || reason.length > 500) {
    return NextResponse.json({ error: 'invalid_reason' }, { status: 422 });
  }

  const upstream = await fetch(`${apiBase}/api/v1/timesheets/${params.id}/dispute`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer dev:${session.role}`,
      'idempotency-key': randomUUID(),
    },
    body: JSON.stringify({ reviewerUserId: session.displayName, reason }),
  });
  return new NextResponse(await upstream.text(), {
    status: upstream.status,
    headers: { 'content-type': 'application/json' },
  });
}
