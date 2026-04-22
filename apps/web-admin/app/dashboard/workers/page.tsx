import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDevSessionFromCookie } from '../../../lib/auth.js';
import { uiCanAccess } from '../../../lib/rbac.js';
import { formatDateCh } from '../../../lib/format.js';

interface WorkerListItem {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly residenceCanton: string;
  readonly avs: string;
  readonly archivedAt?: string | null;
  readonly createdAt: string;
}

/**
 * Page liste des intérimaires. Server component : appelle l'API avec le cookie
 * de session (en staging, ce sera l'ID token Firebase).
 *
 * En attendant le wiring complet (DETTE-014 + un proxy SSR auth), affiche un
 * fallback "API unavailable" si l'appel échoue.
 */
async function fetchWorkers(): Promise<WorkerListItem[]> {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';
  try {
    const response = await fetch(`${apiBase}/api/v1/workers?limit=50`, {
      cache: 'no-store',
      headers: { authorization: 'Bearer dev' },
    });
    if (!response.ok) return [];
    const body = (await response.json()) as { items: WorkerListItem[] };
    return body.items;
  } catch {
    return [];
  }
}

export default async function WorkersPage() {
  const cookieHeader = cookies().toString();
  const session = getDevSessionFromCookie(cookieHeader);
  if (!session) redirect('/login');

  const workers = await fetchWorkers();
  const canCreate = uiCanAccess(session.role, 'worker:write');

  return (
    <div className="card">
      <div className="toolbar">
        <h1>Intérimaires</h1>
        {canCreate && (
          <Link href="/dashboard/workers/new" className="btn-primary">
            Nouveau intérimaire
          </Link>
        )}
      </div>

      {workers.length === 0 ? (
        <p className="empty">
          Aucun intérimaire à afficher (l'API n'est peut-être pas démarrée — voir
          <code> docs/dev-setup.md</code>).
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Nom</th>
              <th>AVS</th>
              <th>Canton</th>
              <th>Inscrit le</th>
              <th>Statut</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {workers.map((w) => (
              <tr key={w.id}>
                <td>
                  <Link href={`/dashboard/workers/${w.id}`}>
                    {w.firstName} {w.lastName}
                  </Link>
                </td>
                <td>{w.avs}</td>
                <td>{w.residenceCanton}</td>
                <td>{formatDateCh(w.createdAt)}</td>
                <td>{w.archivedAt ? 'Archivé' : 'Actif'}</td>
                <td>
                  <Link href={`/dashboard/workers/${w.id}/availability`}>Disponibilités</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
