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
    <div style={{ padding: 20 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
        }}
      >
        <div>
          <div className="label">Webhooks MovePlanner</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 2 }}>
            {proposals.length} proposition(s) au total · vue Kanban temps quasi-réel (poll 10s) ·
            alerte rouge si délai &lt; 15 min
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span className="live-dot" />
          <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>Live</span>
        </div>
      </div>
      <ProposalsKanban initial={proposals} canWrite={canWrite} />
    </div>
  );
}
