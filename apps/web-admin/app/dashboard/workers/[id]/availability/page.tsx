import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDevSessionFromCookie } from '../../../../../lib/auth.js';
import { uiCanAccess } from '../../../../../lib/rbac.js';
import { isoDateOnly, isoMondayOf, shiftWeek } from '../../../../../lib/week.js';
import { WeekCalendar, type SlotInstance } from './WeekCalendar.js';

interface WeekResponse {
  readonly weekStart: string;
  readonly weekEnd: string;
  readonly freshness: 'realtime' | 'cached' | 'stale';
  readonly instances: readonly SlotInstance[];
}

async function fetchWeek(workerId: string, weekStart: string): Promise<WeekResponse | null> {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';
  try {
    const res = await fetch(
      `${apiBase}/api/v1/workers/${workerId}/availability/week?from=${weekStart}`,
      {
        cache: 'no-store',
        headers: { authorization: 'Bearer dev' },
      },
    );
    if (!res.ok) return null;
    return (await res.json()) as WeekResponse;
  } catch {
    return null;
  }
}

interface PageProps {
  readonly params: { id: string };
  readonly searchParams: { week?: string };
}

export default async function WorkerAvailabilityPage({ params, searchParams }: PageProps) {
  const cookieHeader = cookies().toString();
  const session = getDevSessionFromCookie(cookieHeader);
  if (!session) redirect('/login');

  const requestedWeek = searchParams.week
    ? new Date(`${searchParams.week}T00:00:00.000Z`)
    : new Date();
  const monday = isoMondayOf(requestedWeek);
  const mondayIso = isoDateOnly(monday);
  const prevWeek = isoDateOnly(shiftWeek(monday, -1));
  const nextWeek = isoDateOnly(shiftWeek(monday, 1));

  const week = await fetchWeek(params.id, mondayIso);
  const canWrite = uiCanAccess(session.role, 'worker:write');

  return (
    <div className="card">
      <div className="toolbar">
        <h1>Disponibilités · semaine du {mondayIso}</h1>
        <div className="actions">
          <Link
            href={`/dashboard/workers/${params.id}/availability?week=${prevWeek}`}
            className="btn-secondary"
          >
            ← Semaine précédente
          </Link>
          <Link
            href={`/dashboard/workers/${params.id}/availability?week=${nextWeek}`}
            className="btn-secondary"
          >
            Semaine suivante →
          </Link>
        </div>
      </div>

      {week ? (
        <WeekCalendar
          workerId={params.id}
          weekStart={mondayIso}
          instances={week.instances}
          freshness={week.freshness}
          canWrite={canWrite}
        />
      ) : (
        <p className="empty">
          API indisponible (vérifier <code>docs/dev-setup.md</code>) ou aucun créneau pour cette
          semaine.
        </p>
      )}
    </div>
  );
}
