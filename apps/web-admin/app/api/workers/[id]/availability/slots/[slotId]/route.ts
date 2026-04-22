import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDevSessionFromCookie } from '../../../../../../../lib/auth.js';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; slotId: string } },
): Promise<Response> {
  const cookieHeader = cookies().toString();
  const session = getDevSessionFromCookie(cookieHeader);
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const upstream = await fetch(
    `${apiBase}/api/v1/workers/${params.id}/availability/slots/${params.slotId}`,
    {
      method: 'DELETE',
      headers: {
        authorization: `Bearer dev:${session.role}`,
      },
    },
  );
  return new NextResponse(null, { status: upstream.status });
}
