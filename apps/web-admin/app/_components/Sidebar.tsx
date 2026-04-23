'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactElement } from 'react';
import { Icon, type IconName } from './Icon.js';

export interface NavItemView {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly icon: IconName;
  readonly group: 'principal' | 'gestion' | 'execution' | 'pilotage';
  readonly badge?: number;
}

const GROUPS = [
  { id: 'principal', label: 'Principal' },
  { id: 'gestion', label: 'Gestion' },
  { id: 'execution', label: 'Exécution' },
  { id: 'pilotage', label: 'Pilotage' },
] as const;

interface Props {
  readonly nav: readonly NavItemView[];
  readonly displayName: string;
  readonly role: string;
}

/**
 * Sidebar Helvètia — brand block, sélecteur d'agence, navigation groupée,
 * bandeau intégration MovePlanner, bloc utilisateur.
 *
 * Le surlignage actif est calculé côté client via usePathname (préfixe).
 */
export function Sidebar({ nav, displayName, role }: Props): ReactElement {
  const pathname = usePathname();
  const initials = displayName
    .split(/\s+/u)
    .map((n) => n.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <aside className="app-sidebar" aria-label="Navigation principale">
      {/* Brand */}
      <div className="brand">
        <div className="brand-mark" aria-hidden="true" />
        <div>
          <div className="brand-name">Helvètia Intérim</div>
          <div className="brand-sub">Lausanne · VD</div>
        </div>
      </div>

      {/* Agency selector */}
      <div className="agency-selector">
        <button type="button" className="agency-btn">
          <span style={{ display: 'flex', alignItems: 'center' }}>
            <span className="agency-badge">H</span>
            Helvètia SA
          </span>
          <Icon name="chevron-d" size={12} color="var(--ink-4)" />
        </button>
      </div>

      {/* Nav */}
      <nav>
        {GROUPS.map((group) => {
          const items = nav.filter((n) => n.group === group.id);
          if (items.length === 0) return null;
          return (
            <div key={group.id} className="nav-group">
              <div className="nav-group-label">{group.label}</div>
              {items.map((item) => {
                const active =
                  item.href === '/dashboard'
                    ? pathname === '/dashboard'
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={`nav-link${active ? ' active' : ''}`}
                  >
                    <span className="nav-icon">
                      <Icon
                        name={item.icon}
                        size={14}
                        color={active ? 'var(--accent)' : 'var(--ink-3)'}
                      />
                    </span>
                    <span style={{ flex: 1 }}>{item.label}</span>
                    {item.badge !== undefined && item.badge > 0 ? (
                      <span className="nav-badge">{item.badge}</span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Integration status */}
      <div className="integration">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 6,
          }}
        >
          <span className="label">Intégration MovePlanner</span>
          <span className="live-dot" aria-hidden="true" />
        </div>
        <div className="integration-row">
          <span className="key">API</span>
          <span className="mono val" style={{ color: 'var(--ok)' }}>
            ● 200 OK
          </span>
        </div>
        <div className="integration-row">
          <span className="key">Webhooks</span>
          <span className="mono val">12 / dernière 2 min</span>
        </div>
        <div className="integration-row">
          <span className="key">Rate</span>
          <span className="mono val">23/100 min</span>
        </div>
      </div>

      {/* User block */}
      <div className="user-block">
        <div className="avatar" style={{ background: '#1f4f8b' }}>
          {initials || 'MB'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="user-name">{displayName}</div>
          <div className="user-role">{role}</div>
        </div>
        <button type="button" className="btn icon ghost" aria-label="Paramètres">
          <Icon name="settings" />
        </button>
      </div>
    </aside>
  );
}
