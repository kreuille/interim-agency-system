import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPortalSessionFromCookie } from '../../../../lib/session.js';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

interface CreateBody {
  readonly workerId: string;
  readonly action: 'create';
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly status: 'available' | 'unavailable';
}

interface DeleteBody {
  readonly workerId: string;
  readonly action: 'delete';
  readonly slotId: string;
}

type Body = CreateBody | DeleteBody;

export async function POST(req: Request): Promise<Response> {
  const cookieHeader = cookies().toString();
  const session = getPortalSessionFromCookie(cookieHeader);
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Body | null;
  if (body?.workerId !== session.workerId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  if (body.action === 'create') {
    const upstream = await fetch(
      `${apiBase}/api/v1/workers/${session.workerId}/availability/slots`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer dev:portal:${session.workerId}`,
        },
        body: JSON.stringify({
          dateFrom: body.dateFrom,
          dateTo: body.dateTo,
          status: body.status,
          source: 'worker_self',
        }),
      },
    );
    return new NextResponse(await upstream.text(), {
      status: upstream.status,
      headers: { 'content-type': 'application/json' },
    });
  }

  // body.action === 'delete' (TS narrowing)
  const upstream = await fetch(
    `${apiBase}/api/v1/workers/${session.workerId}/availability/slots/${body.slotId}`,
    {
      method: 'DELETE',
      headers: { authorization: `Bearer dev:portal:${session.workerId}` },
    },
  );
  return new NextResponse(null, { status: upstream.status });
}
