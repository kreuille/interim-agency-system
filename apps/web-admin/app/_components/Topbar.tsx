import type { ReactElement, ReactNode } from 'react';
import { Icon } from './Icon.js';

interface Props {
  readonly title: string;
  readonly subtitle?: string;
  readonly breadcrumb?: string;
  readonly actions?: ReactNode;
}

export function Topbar({ title, subtitle, breadcrumb, actions }: Props): ReactElement {
  return (
    <header className="app-topbar">
      <div style={{ flex: 1, minWidth: 0 }}>
        {breadcrumb ? <div className="topbar-breadcrumb">{breadcrumb}</div> : null}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h1 className="topbar-title">{title}</h1>
          {subtitle ? <span className="topbar-subtitle">{subtitle}</span> : null}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div className="topbar-search">
          <span className="search-icon">
            <Icon name="search" size={13} />
          </span>
          <input
            placeholder="Chercher intérimaire, mission…"
            aria-label="Rechercher"
            type="search"
          />
          <span className="kbd">⌘K</span>
        </div>
        {actions}
        <button
          type="button"
          className="btn icon ghost"
          title="Notifications"
          aria-label="Notifications"
          style={{ position: 'relative' }}
        >
          <Icon name="bell" />
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 4,
              right: 4,
              width: 6,
              height: 6,
              borderRadius: 3,
              background: 'var(--accent)',
            }}
          />
        </button>
      </div>
    </header>
  );
}
