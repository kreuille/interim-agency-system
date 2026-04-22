import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getPortalSessionFromCookie } from '../lib/session.js';
import { buildTwoWeeks, isoDateOnly, isoMondayOf, type SlotInstance } from '../lib/two-weeks.js';
import { TwoWeekToggle } from './_components/TwoWeekToggle.js';

interface WeekResponse {
  readonly instances: readonly SlotInstance[];
}

async function fetchTwoWeeks(workerId: string, mondayIso: string): Promise<SlotInstance[]> {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';
  const all: SlotInstance[] = [];
  // Une requête par semaine (l'API admin filtre lundi ISO).
  for (let i = 0; i < 2; i++) {
    const wkStart = new Date(`${mondayIso}T00:00:00.000Z`);
    wkStart.setUTCDate(wkStart.getUTCDate() + i * 7);
    const wkIso = isoDateOnly(wkStart);
    try {
      const res = await fetch(
        `${apiBase}/api/v1/workers/${workerId}/availability/week?from=${wkIso}`,
        { cache: 'no-store', headers: { authorization: 'Bearer dev' } },
      );
      if (!res.ok) continue;
      const body = (await res.json()) as WeekResponse;
      all.push(...body.instances);
    } catch {
      // tolère API down (mode offline test côté serveur improbable, mais sûr).
    }
  }
  return all;
}

export default async function HomePage() {
  const cookieHeader = cookies().toString();
  const session = getPortalSessionFromCookie(cookieHeader);
  if (!session) redirect('/login');

  const monday = isoMondayOf(new Date());
  const mondayIso = isoDateOnly(monday);
  const slots = await fetchTwoWeeks(session.workerId, mondayIso);
  const cells = buildTwoWeeks(monday, slots);

  return (
    <main>
      <div className="toolbar">
        <h1 style={{ fontSize: '1.25rem' }}>Mes disponibilités</h1>
        <span className="me">{session.email}</span>
      </div>
      <p style={{ fontSize: '0.875rem', color: '#666', marginBottom: 8 }}>
        Tapez sur un jour pour basculer disponible / indisponible. Les modifications hors-ligne sont
        synchronisées à la reconnexion.
      </p>

      <h2 style={{ fontSize: '1rem', marginTop: 16 }}>Cette semaine</h2>
      <TwoWeekToggle workerId={session.workerId} cells={cells.slice(0, 7)} />

      <h2 style={{ fontSize: '1rem', marginTop: 16 }}>Semaine prochaine</h2>
      <TwoWeekToggle workerId={session.workerId} cells={cells.slice(7, 14)} />

      <div className="legend" aria-label="Légende">
        <span className="available">Disponible</span>
        <span className="unavailable">Indisponible</span>
        <span className="mixed">Partiellement</span>
        <span className="unknown">Non renseigné</span>
      </div>
    </main>
  );
}
