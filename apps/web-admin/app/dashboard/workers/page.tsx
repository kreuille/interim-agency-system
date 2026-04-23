import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDevSessionFromCookie } from '../../../lib/auth.js';
import { uiCanAccess } from '../../../lib/rbac.js';
import { formatDateCh } from '../../../lib/format.js';
import { Icon } from '../../_components/Icon.js';

interface WorkerListItem {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly residenceCanton: string;
  readonly avs: string;
  readonly archivedAt?: string | null;
  readonly createdAt: string;
}

const AVATAR_COLORS = [
  '#c8102e',
  '#1f4f8b',
  '#157a4a',
  '#b26a00',
  '#6b3fa0',
  '#0c6f7c',
  '#8f0b20',
  '#2d5a3f',
];

function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length] ?? '#1f4f8b';
}

function initialsFor(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

/**
 * Liste des intérimaires — design Helvètia (table dense avec avatars,
 * filtres en pill bar, AVS masqué en mono). Server component : appelle
 * l'API avec le cookie de session (en staging, ce sera l'ID token Firebase).
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
  const active = workers.filter((w) => !w.archivedAt).length;
  const archived = workers.length - active;

  return (
    <div style={{ padding: 20, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Filters bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div
          style={{
            display: 'flex',
            gap: 2,
            padding: 2,
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 4,
          }}
        >
          <FilterPill label={`Tous · ${String(workers.length)}`} active />
          <FilterPill label={`Actifs · ${String(active)}`} />
          <FilterPill label={`Archivés · ${String(archived)}`} />
        </div>
        <button type="button" className="btn sm">
          <Icon name="filter" size={12} />
          Filtres avancés
        </button>
        <button type="button" className="btn sm">
          <Icon name="arrow-ud" size={12} />
          Trier
        </button>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn sm">
          <Icon name="download" size={12} />
          Export CSV
        </button>
        {canCreate ? (
          <Link href="/dashboard/workers/new" className="btn sm primary">
            <Icon name="plus" size={12} />
            Nouvel intérimaire
          </Link>
        ) : null}
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, flex: 1, overflow: 'auto' }}>
        {workers.length === 0 ? (
          <p className="empty">
            Aucun intérimaire à afficher (l&apos;API n&apos;est peut-être pas démarrée — voir{' '}
            <code>docs/dev-setup.md</code>).
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Intérimaire</th>
                <th>AVS</th>
                <th>Canton</th>
                <th>Inscrit le</th>
                <th>Statut</th>
                <th style={{ width: 140 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => (
                <tr key={w.id} className="row-enter">
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        className="avatar sm"
                        style={{ background: colorFor(`${w.firstName} ${w.lastName}`) }}
                      >
                        {initialsFor(w.firstName, w.lastName)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 500 }}>
                          <Link href={`/dashboard/workers/${w.id}`} style={{ color: 'var(--ink)' }}>
                            {w.firstName} {w.lastName}
                          </Link>
                        </div>
                        <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink-4)' }}>
                          {w.id.slice(0, 12)}…
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="mono" style={{ fontSize: 11.5 }}>
                    {w.avs}
                  </td>
                  <td>
                    <span className="chip neutral">{w.residenceCanton}</span>
                  </td>
                  <td className="mono" style={{ fontSize: 11.5 }}>
                    {formatDateCh(w.createdAt)}
                  </td>
                  <td>
                    {w.archivedAt ? (
                      <span className="chip neutral">Archivé</span>
                    ) : (
                      <span className="chip ok">
                        <span className="dot" />
                        Actif
                      </span>
                    )}
                  </td>
                  <td>
                    <Link href={`/dashboard/workers/${w.id}/availability`} className="btn sm">
                      <Icon name="calendar" size={12} />
                      Disponibilités
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function FilterPill({
  label,
  active = false,
}: {
  readonly label: string;
  readonly active?: boolean;
}) {
  return (
    <button
      type="button"
      style={{
        padding: '4px 10px',
        fontSize: 11.5,
        borderRadius: 3,
        background: active ? 'white' : 'transparent',
        color: active ? 'var(--ink)' : 'var(--ink-3)',
        fontWeight: active ? 500 : 400,
        boxShadow: active ? 'var(--shadow-sm)' : 'none',
      }}
    >
      {label}
    </button>
  );
}
