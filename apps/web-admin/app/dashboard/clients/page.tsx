import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDevSessionFromCookie } from '../../../lib/auth.js';
import { uiCanAccess } from '../../../lib/rbac.js';
import { formatMoneyChf } from '../../../lib/format.js';

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
    <div className="card">
      <div className="toolbar">
        <h1>Clients</h1>
        {canCreate && (
          <Link href="/dashboard/clients/new" className="btn-primary">
            Nouveau client
          </Link>
        )}
      </div>

      {clients.length === 0 ? (
        <p className="empty">Aucun client à afficher.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Nom</th>
              <th>IDE</th>
              <th>Statut</th>
              <th>Délai paiement</th>
              <th>Plafond crédit</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link href={`/dashboard/clients/${c.id}`}>{c.legalName}</Link>
                </td>
                <td>{c.ide ?? '—'}</td>
                <td>{c.status}</td>
                <td>{String(c.paymentTermDays)} jours</td>
                <td>{formatMoneyChf(c.creditLimitRappen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
