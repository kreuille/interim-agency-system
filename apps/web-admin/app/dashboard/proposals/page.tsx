import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDevSessionFromCookie } from '../../../lib/auth.js';
import { uiCanAccess } from '../../../lib/rbac.js';
import { ProposalsKanban, type ProposalDto } from './ProposalsKanban.js';

interface ListResponse {
  readonly items: readonly ProposalDto[];
}

async function fetchProposals(): Promise<ProposalDto[]> {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';
  try {
    const res = await fetch(`${apiBase}/api/v1/proposals?limit=100`, {
      cache: 'no-store',
      headers: { authorization: 'Bearer dev' },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as ListResponse;
    return [...body.items];
  } catch {
    return [];
  }
}

export default async function ProposalsPage() {
  const cookieHeader = cookies().toString();
  const session = getDevSessionFromCookie(cookieHeader);
  if (!session) redirect('/login');

  const proposals = await fetchProposals();
  const canWrite = uiCanAccess(session.role, 'proposal:write');

  return (
    <div className="card">
      <div className="toolbar">
        <h1>Propositions de mission</h1>
        <span className="me">{proposals.length} au total</span>
      </div>
      <p style={{ fontSize: '0.875rem', color: '#666', marginBottom: 12 }}>
        Vue Kanban temps quasi-réel (poll 10s). Cliquez sur une carte pour voir le détail et
        accepter / refuser. Alerte rouge si délai &lt; 15 min.
      </p>
      <ProposalsKanban initial={proposals} canWrite={canWrite} />
    </div>
  );
}
