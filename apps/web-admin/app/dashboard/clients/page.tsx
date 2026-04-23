import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDevSessionFromCookie } from '../../../lib/auth.js';
import { uiCanAccess } from '../../../lib/rbac.js';
import { formatMoneyChf } from '../../../lib/format.js';
import { Icon } from '../../_components/Icon.js';

interface ClientListItem {
  readonly id: string;
  readonly legalName: string;
  readonly ide: string | null;
  readonly status: string;
  readonly paymentTermDays: number;
  readonly creditLimitRappen: string | null;
  readonly archivedAt?: string | null;
}

async function fetchClients(): Promise<ClientListItem[]> {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';
  try {
    const response = await fetch(`${apiBase}/api/v1/clients?limit=50`, {
      cache: 'no-store',
      headers: { authorization: 'Bearer dev' },
    });
    if (!response.ok) return [];
    const body = (await response.json()) as { items: ClientListItem[] };
    return body.items;
  } catch {
    return [];
  }
}

export default async function ClientsPage() {
  const cookieHeader = cookies().toString();
  const session = getDevSessionFromCookie(cookieHeader);
  if (!session) redirect('/login');

  const clients = await fetchClients();
  const canCreate = uiCanAccess(session.role, 'client:write');

  return (
    <div style={{ padding: 20 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <div>
          <div className="label">Comptes & contrats</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 2 }}>
            {clients.length} client(s) référencé(s)
          </div>
        </div>
        {canCreate && (
          <Link href="/dashboard/clients/new" className="btn sm primary">
            <Icon name="plus" size={12} />
            Nouveau client
          </Link>
        )}
      </div>

      <div className="card" style={{ padding: 0 }}>
        {clients.length === 0 ? (
          <p className="empty">Aucun client à afficher.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Nom</th>
                <th>IDE</th>
                <th>Statut</th>
                <th className="num">Délai paiement</th>
                <th className="num">Plafond crédit</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className="row-enter">
                  <td style={{ fontWeight: 500 }}>
                    <Link href={`/dashboard/clients/${c.id}`} style={{ color: 'var(--ink)' }}>
                      {c.legalName}
                    </Link>
                  </td>
                  <td className="mono" style={{ fontSize: 11.5 }}>
                    {c.ide ?? '—'}
                  </td>
                  <td>
                    <span className="chip neutral">{c.status}</span>
                  </td>
                  <td className="num mono">{String(c.paymentTermDays)} j</td>
                  <td className="num mono">{formatMoneyChf(c.creditLimitRappen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
