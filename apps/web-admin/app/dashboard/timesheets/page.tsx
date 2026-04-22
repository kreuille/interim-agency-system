import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type React from 'react';
import { getDevSessionFromCookie } from '../../../lib/auth.js';
import { uiCanAccess } from '../../../lib/rbac.js';
import { TimesheetsReview, type TimesheetDto } from './TimesheetsReview.js';

interface ListResponse {
  readonly items: readonly TimesheetDto[];
}

async function fetchTimesheets(): Promise<TimesheetDto[]> {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';
  try {
    const res = await fetch(`${apiBase}/api/v1/timesheets?limit=200`, {
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

export default async function TimesheetsPage(): Promise<React.JSX.Element> {
  const cookieHeader = cookies().toString();
  const session = getDevSessionFromCookie(cookieHeader);
  if (!session) redirect('/login');

  const canRead = uiCanAccess(session.role, 'timesheet:read');
  if (!canRead) {
    return (
      <div className="card">
        <h1>403 — accès refusé</h1>
        <p>Votre rôle ({session.role}) ne permet pas de consulter les timesheets.</p>
      </div>
    );
  }

  const timesheets = await fetchTimesheets();
  const canWrite = uiCanAccess(session.role, 'timesheet:write');

  const toReview = timesheets.filter((t) => t.state === 'received' || t.state === 'under_review');

  return (
    <div className="card">
      <div className="toolbar">
        <h1>Timesheets à contrôler</h1>
        <span className="me">
          {toReview.length} à contrôler / {timesheets.length} total
        </span>
      </div>
      <p style={{ fontSize: '0.875rem', color: '#666', marginBottom: 12 }}>
        Comparaison horaires planifiés / réels avec anomalies LTr/CCT surlignées. Cliquez sur
        l&apos;anomalie pour voir la référence légale. Bloquant (rouge) → ne peut pas être signé,
        doit être corrigé ou contesté.
      </p>
      <TimesheetsReview initial={timesheets} canWrite={canWrite} />
    </div>
  );
}
