import type { ReactElement } from 'react';
import { Icon } from '../_components/Icon.js';

/**
 * Tableau de bord — vue d'ensemble Helvètia Intérim.
 *
 * Données affichées : statiques pour l'instant (le sprint A.6.x câblera la
 * vraie source — `GetComplianceDashboardUseCase` + KPIs missions/intérimaires).
 * Le design correspond à la maquette `screen-dashboard.jsx` du brief design.
 */

interface Alert {
  readonly id: string;
  readonly level: 'accent' | 'warn' | 'info';
  readonly title: string;
  readonly detail: string;
  readonly action: string;
}

const ALERTS: readonly Alert[] = [
  {
    id: 'al_1',
    level: 'accent',
    title: 'Autorisation cantonale LSE — expire dans 58 j',
    detail: 'Canton de Vaud · N° LSE-VD-2021-00421 · expire le 21.06.2026',
    action: 'Renouveler',
  },
  {
    id: 'al_2',
    level: 'warn',
    title: '2 propositions de mission sans réponse',
    detail: 'ar_9f3a21 (12 min restantes), ar_8b1f40 (28 min)',
    action: "Ouvrir l'inbox",
  },
  {
    id: 'al_3',
    level: 'info',
    title: 'Barèmes CCT 2026 — publication swissstaffing disponible',
    detail: 'À importer avant le 01.05.2026 pour mise à jour automatique',
    action: 'Importer',
  },
];

interface Activity {
  readonly t: string;
  readonly ev: string;
  readonly worker: string;
  readonly detail: string;
  readonly color: string;
  readonly action: string;
}

const ACTIVITIES: readonly Activity[] = [
  {
    t: '14:32',
    ev: 'worker.assignment.proposed',
    worker: 'Amadou Diallo',
    detail: "Chef d'équipe · Lausanne → Nyon · 25.04 08h-18h",
    color: 'var(--info)',
    action: 'Ouvrir',
  },
  {
    t: '14:28',
    ev: 'timesheet.ready_for_signature',
    worker: 'Jean Dupont',
    detail: 'S16 · 46.5 h · Mission Martin',
    color: 'var(--warn)',
    action: 'Contrôler',
  },
  {
    t: '14:12',
    ev: 'worker.assignment.accepted',
    worker: 'Sophie Mercier',
    detail: 'Mission Moving Swiss · contrat généré',
    color: 'var(--ok)',
    action: 'Voir',
  },
  {
    t: '13:58',
    ev: 'invoice.paid',
    worker: 'MovePlanner SA',
    detail: "INV-2026-0417 · CHF 30'754 encaissés",
    color: 'var(--ok)',
    action: 'Voir',
  },
  {
    t: '13:44',
    ev: 'worker.assignment.proposed',
    worker: 'Miguel Santos',
    detail: 'Déménageur · Lausanne → Pully · 26.04 07h30-16h30',
    color: 'var(--info)',
    action: 'Ouvrir',
  },
  {
    t: '12:30',
    ev: 'worker.assignment.timeout',
    worker: 'Zarah Hoffmann',
    detail: 'Mission Moving Swiss · fallback 2/5',
    color: 'var(--ink-3)',
    action: '—',
  },
];

const MINI_BARS = [42, 48, 38, 55, 61, 44, 39, 52, 58, 67, 72, 63];
const MAX_BAR = Math.max(...MINI_BARS);

interface UpcomingMission {
  readonly initials: string;
  readonly fullName: string;
  readonly color: string;
  readonly time: string;
  readonly loc: string;
}

const UPCOMING: readonly UpcomingMission[] = [
  {
    initials: 'JD',
    fullName: 'Jean Dupont',
    color: '#c8102e',
    time: '08:00 — 18:00',
    loc: 'Lausanne → Montreux',
  },
  {
    initials: 'SM',
    fullName: 'Sophie Mercier',
    color: '#1f4f8b',
    time: '08:00 — 17:00',
    loc: 'Morges → Rolle',
  },
  {
    initials: 'IÖ',
    fullName: 'Ibrahim Öztürk',
    color: '#157a4a',
    time: '07:30 — 16:30',
    loc: 'Genève → Nyon',
  },
  {
    initials: 'PM',
    fullName: 'Pierre Moreau',
    color: '#b26a00',
    time: '09:00 — 18:00',
    loc: 'Fribourg → Bulle',
  },
];

export default function DashboardHome(): ReactElement {
  return (
    <div style={{ padding: 20 }}>
      {/* Bandeau semaine */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
          padding: '10px 14px',
          background: 'white',
          border: '1px solid var(--border)',
          borderRadius: 6,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div>
            <div className="label">Semaine en cours</div>
            <div style={{ fontSize: 14, fontWeight: 500, marginTop: 2 }}>
              S17 · Lun 20 — Dim 26 avril 2026
            </div>
          </div>
          <div style={{ height: 24, width: 1, background: 'var(--border)' }} />
          <div style={{ display: 'flex', gap: 20 }}>
            <div>
              <div className="label">Missions actives</div>
              <div style={{ fontSize: 14, fontWeight: 500, marginTop: 2 }}>14</div>
            </div>
            <div>
              <div className="label">Heures prévues</div>
              <div style={{ fontSize: 14, fontWeight: 500, marginTop: 2 }}>612 h</div>
            </div>
            <div>
              <div className="label">CA prévisionnel</div>
              <div style={{ fontSize: 14, fontWeight: 500, marginTop: 2 }}>CHF 27&apos;840</div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span className="chip ok">
            <span className="dot" />
            Conforme CCT
          </span>
          <button type="button" className="btn sm">
            <Icon name="download" size={12} />
            Rapport S17
          </button>
        </div>
      </div>

      {/* Alerts */}
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
            Alertes conformité{' '}
            <span style={{ color: 'var(--ink-4)', fontWeight: 400 }}>· {ALERTS.length}</span>
          </h2>
          <button type="button" className="btn sm ghost">
            Tout voir <Icon name="arrow-r" size={12} />
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {ALERTS.map((alert) => (
            <AlertBanner key={alert.id} alert={alert} />
          ))}
        </div>
      </div>

      {/* KPI row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 10,
          marginBottom: 20,
        }}
      >
        <StatCard
          label="Intérimaires actifs"
          value="47"
          unit="/ 62"
          delta="+3"
          hint="9 en mission aujourd'hui"
        />
        <StatCard label="Taux de placement" value="76" unit="%" delta="+4 pts" hint="vs. S16" />
        <StatCard label="Propositions en cours" value="2" hint="Timeout moyen 28 min" />
        <StatCard
          label="Encours client"
          value="63'188"
          unit="CHF"
          delta="1 en retard"
          deltaType="warn"
          hint="3 factures en attente"
        />
      </div>

      {/* Main + side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
        {/* Activity feed */}
        <div className="card" style={{ padding: 0 }}>
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Activité temps réel</h3>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span className="live-dot" />
              <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                Live · webhooks MovePlanner
              </span>
            </div>
          </div>
          <div>
            {ACTIVITIES.map((a) => (
              <div key={a.ev + a.t} className="activity-row">
                <div className="mono activity-time">{a.t}</div>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 2,
                    }}
                  >
                    <span className="mono activity-event" style={{ color: a.color }}>
                      {a.ev}
                    </span>
                    <span className="activity-name">{a.worker}</span>
                  </div>
                  <div className="activity-detail">{a.detail}</div>
                </div>
                {a.action !== '—' ? (
                  <button type="button" className="btn sm">
                    {a.action}
                  </button>
                ) : (
                  <span />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Side */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card" style={{ padding: 14 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 10,
              }}
            >
              <h3 style={{ margin: 0, fontSize: 12.5, fontWeight: 600 }}>Heures / semaine</h3>
              <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>12 dernières sem.</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 72 }}>
              {MINI_BARS.map((v, i) => {
                const isLast = i === MINI_BARS.length - 1;
                return (
                  <div
                    key={`bar-${String(i)}`}
                    style={{
                      flex: 1,
                      height: `${String((v / MAX_BAR) * 100)}%`,
                      background: isLast ? 'var(--accent)' : 'var(--ink-4)',
                      borderRadius: 1,
                      opacity: isLast ? 1 : 0.35,
                    }}
                  />
                );
              })}
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 10,
                color: 'var(--ink-4)',
                marginTop: 4,
              }}
            >
              <span className="mono">S06</span>
              <span className="mono" style={{ color: 'var(--accent)' }}>
                S17 · 612 h
              </span>
            </div>
          </div>

          <div className="card" style={{ padding: 0 }}>
            <div
              style={{
                padding: '10px 14px',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <h3 style={{ margin: 0, fontSize: 12.5, fontWeight: 600 }}>Missions demain</h3>
            </div>
            {UPCOMING.map((m, i) => (
              <div
                key={m.initials + m.time}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 14px',
                  borderBottom: i < UPCOMING.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <div className="avatar sm" style={{ background: m.color }}>
                  {m.initials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{m.fullName}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--ink-4)' }}>
                    <span className="mono">{m.time}</span> · {m.loc}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  readonly label: string;
  readonly value: string;
  readonly unit?: string;
  readonly delta?: string;
  readonly deltaType?: 'ok' | 'warn';
  readonly hint?: string;
}

function StatCard({
  label,
  value,
  unit,
  delta,
  deltaType = 'ok',
  hint,
}: StatCardProps): ReactElement {
  return (
    <div className="kpi-card">
      <div className="stat-label">{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
        <div className="stat-num">{value}</div>
        {unit ? (
          <div style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 500 }}>{unit}</div>
        ) : null}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 4,
        }}
      >
        {hint ? <div style={{ fontSize: 11, color: 'var(--ink-4)' }}>{hint}</div> : <span />}
        {delta ? (
          <div
            style={{
              fontSize: 11,
              color: deltaType === 'ok' ? 'var(--ok)' : 'var(--accent-ink)',
              fontWeight: 500,
            }}
          >
            {delta}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AlertBanner({ alert }: { readonly alert: Alert }): ReactElement {
  const iconName = alert.level === 'info' ? 'info' : 'alert';
  return (
    <div className={`alert-banner ${alert.level}`}>
      <div style={{ marginTop: 1 }}>
        <Icon name={iconName} size={14} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="alert-title">{alert.title}</div>
        <div className="alert-detail">{alert.detail}</div>
      </div>
      <button
        type="button"
        className="btn sm"
        style={{
          background: 'white',
          borderColor: 'rgba(0,0,0,0.1)',
        }}
      >
        {alert.action}
      </button>
    </div>
  );
}
