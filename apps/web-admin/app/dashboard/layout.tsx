import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { canAccess, type Action } from '@interim/domain';
import { getDevSessionFromCookie } from '../../lib/auth.js';
import { Sidebar, type NavItemView } from '../_components/Sidebar.js';
import { Topbar } from '../_components/Topbar.js';

/**
 * Catalogue de navigation Helvètia. Les groupes (principal/gestion/exécution/
 * pilotage) suivent le design Swiss-precise : on regroupe par phase métier
 * plutôt que par CRUD.
 *
 * `requires` filtre côté serveur via RBAC ; les API doivent dans tous les cas
 * revérifier (le filtre UI n'est qu'une commodité).
 */
const NAV_CATALOG: readonly (NavItemView & { readonly requires?: Action })[] = [
  {
    id: 'dashboard',
    label: 'Tableau de bord',
    href: '/dashboard',
    icon: 'home',
    group: 'principal',
  },
  {
    id: 'proposals',
    label: 'Propositions',
    href: '/dashboard/proposals',
    icon: 'inbox',
    group: 'principal',
    requires: 'proposal:read',
  },
  {
    id: 'workers',
    label: 'Intérimaires',
    href: '/dashboard/workers',
    icon: 'users',
    group: 'gestion',
    requires: 'worker:read',
  },
  {
    id: 'clients',
    label: 'Clients',
    href: '/dashboard/clients',
    icon: 'briefcase',
    group: 'gestion',
    requires: 'client:read',
  },
  {
    id: 'timesheets',
    label: "Relevés d'heures",
    href: '/dashboard/timesheets',
    icon: 'clock',
    group: 'execution',
    requires: 'timesheet:read',
  },
];

interface ScreenMeta {
  readonly title: string;
  readonly subtitle?: string;
  readonly breadcrumb?: string;
}

const SCREEN_META: Record<string, ScreenMeta> = {
  '/dashboard': {
    title: 'Tableau de bord',
    subtitle: "Helvètia Intérim — Vue d'ensemble",
    breadcrumb: 'Principal',
  },
  '/dashboard/proposals': {
    title: 'Propositions',
    subtitle: 'Webhooks MovePlanner entrants',
    breadcrumb: 'Principal / Propositions de mission',
  },
  '/dashboard/workers': {
    title: 'Intérimaires',
    subtitle: 'Liste & dossiers',
    breadcrumb: 'Gestion / Intérimaires',
  },
  '/dashboard/workers/new': {
    title: 'Nouvel intérimaire',
    subtitle: 'Création d’un dossier',
    breadcrumb: 'Gestion / Intérimaires / Nouveau',
  },
  '/dashboard/clients': {
    title: 'Clients',
    subtitle: 'Comptes & contrats',
    breadcrumb: 'Gestion / Clients',
  },
  '/dashboard/timesheets': {
    title: "Relevés d'heures",
    subtitle: 'Contrôle hebdomadaire & signature',
    breadcrumb: "Exécution / Relevés d'heures",
  },
};

const FALLBACK_META: ScreenMeta = {
  title: 'Tableau de bord',
  subtitle: "Helvètia Intérim — Vue d'ensemble",
  breadcrumb: 'Principal',
};

function resolveMeta(pathname: string): ScreenMeta {
  // Plus long préfixe correspondant.
  const sorted = [...Object.entries(SCREEN_META)]
    .filter(([key]) => pathname === key || pathname.startsWith(`${key}/`))
    .sort(([a], [b]) => b.length - a.length);
  return sorted[0]?.[1] ?? FALLBACK_META;
}

interface LayoutProps {
  readonly children: ReactNode;
}

export default function DashboardLayout({ children }: LayoutProps) {
  const cookieHeader = cookies().toString();
  const session = getDevSessionFromCookie(cookieHeader);
  if (!session) {
    redirect('/login');
  }

  const visibleNav: NavItemView[] = NAV_CATALOG.filter(
    (item) => !item.requires || canAccess(session.role, item.requires),
  ).map(({ requires: _requires, ...rest }) => rest);

  // Sans accès au pathname côté layout server, on calcule la meta via une
  // heuristique : l'écran par défaut est le tableau de bord. Chaque page peut
  // surcharger via `<Topbar>` si nécessaire (DETTE — futur : metadata par page).
  const meta = resolveMeta('/dashboard');

  return (
    <div className="app-shell">
      <Sidebar
        nav={visibleNav}
        displayName={session.displayName}
        role={humanizeRole(session.role)}
      />
      <main className="app-main">
        <Topbar title={meta.title} subtitle={meta.subtitle} breadcrumb={meta.breadcrumb} />
        <div className="app-content">{children}</div>
      </main>
    </div>
  );
}

function humanizeRole(role: string): string {
  const map: Record<string, string> = {
    agency_admin: 'Administrateur agence',
    agency_user: 'Gestionnaire agence',
    payroll_officer: 'Responsable paie',
    auditor: 'Auditeur',
  };
  return map[role] ?? role;
}
