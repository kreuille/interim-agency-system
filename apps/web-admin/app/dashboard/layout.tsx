import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { getDevSessionFromCookie } from '../../lib/auth.js';
import { visibleNavItems } from '../../lib/rbac.js';

const NAV = [
  { label: 'Tableau de bord', href: '/dashboard' },
  { label: 'Intérimaires', href: '/dashboard/workers', requires: 'worker:read' as const },
  { label: 'Clients', href: '/dashboard/clients', requires: 'client:read' as const },
  { label: 'Propositions', href: '/dashboard/proposals', requires: 'proposal:read' as const },
  { label: 'Documents', href: '/dashboard/documents', requires: 'worker:read' as const },
  { label: 'Audit', href: '/dashboard/audit', requires: 'audit:read' as const },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const cookieHeader = cookies().toString();
  const session = getDevSessionFromCookie(cookieHeader);
  if (!session) {
    redirect('/login');
  }

  const items = visibleNavItems(session.role, NAV);

  return (
    <div className="layout">
      <aside className="sidebar" aria-label="Navigation principale">
        <h1>Agence Intérim</h1>
        <p style={{ fontSize: '0.875rem', color: '#aaa', marginBottom: 24 }}>
          {session.displayName} · {session.role}
        </p>
        <nav>
          {items.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="main">{children}</div>
    </div>
  );
}
