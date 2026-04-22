'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

export interface ProposalDto {
  readonly id: string;
  readonly externalRequestId: string;
  readonly state:
    | 'proposed'
    | 'pass_through_sent'
    | 'agency_review'
    | 'accepted'
    | 'refused'
    | 'timeout'
    | 'expired';
  readonly routingMode: 'pass_through' | 'agency_controlled' | null;
  readonly proposedAt: string;
  readonly responseDeadline: string | null;
  readonly stateChangedAt: string;
  readonly responseReason: string | null;
  readonly mission: {
    readonly title: string;
    readonly clientName: string;
    readonly siteAddress: string;
    readonly canton: string;
    readonly hourlyRateRappen: number;
    readonly startsAt: string;
    readonly endsAt: string;
  };
}

const COLUMNS: readonly {
  readonly key: string;
  readonly label: string;
  readonly states: readonly ProposalDto['state'][];
}[] = [
  {
    key: 'pending',
    label: 'En attente',
    states: ['proposed', 'agency_review', 'pass_through_sent'],
  },
  { key: 'accepted', label: 'Acceptées', states: ['accepted'] },
  { key: 'refused', label: 'Refusées', states: ['refused'] },
  { key: 'timeout', label: 'Timeout / expirées', states: ['timeout', 'expired'] },
];

const REFUSAL_REASONS = [
  { value: 'unavailable', label: 'Pas dispo' },
  { value: 'not_qualified', label: 'Non qualifié' },
  { value: 'distance_too_far', label: 'Trop loin' },
  { value: 'cct_below_minimum', label: 'Sous CCT min' },
  { value: 'worker_declined', label: 'Refus intérimaire' },
  { value: 'client_changed_mind', label: 'Client annule' },
  { value: 'other', label: 'Autre…' },
];

interface Props {
  readonly initial: readonly ProposalDto[];
  readonly canWrite: boolean;
}

export function ProposalsKanban({ initial, canWrite }: Props) {
  const router = useRouter();
  const [proposals, setProposals] = useState<readonly ProposalDto[]>(initial);
  const [selected, setSelected] = useState<ProposalDto | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Tick toutes les secondes pour le compteur live MM:SS.
  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(id);
    };
  }, []);

  // Poll API toutes les 10s pour MAJ (fallback SSE — DETTE-042).
  useEffect(() => {
    const id = window.setInterval(() => {
      void refreshProposals(setProposals);
    }, 10_000);
    return () => {
      window.clearInterval(id);
    };
  }, []);

  const grouped = useMemo(() => groupByColumn(proposals), [proposals]);

  return (
    <>
      <div className="kanban">
        {COLUMNS.map((col) => (
          <div key={col.key} className="kanban-col">
            <h2 className="kanban-col-title">
              {col.label} <span className="kanban-count">{grouped[col.key].length}</span>
            </h2>
            <div className="kanban-cards">
              {grouped[col.key].map((p) => (
                <ProposalCard
                  key={p.id}
                  proposal={p}
                  now={now}
                  onClick={() => {
                    setSelected(p);
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {selected ? (
        <DetailDrawer
          proposal={selected}
          canWrite={canWrite}
          onClose={() => {
            setSelected(null);
          }}
          onMutated={() => {
            setSelected(null);
            void refreshProposals(setProposals);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}

function groupByColumn(proposals: readonly ProposalDto[]): Record<string, readonly ProposalDto[]> {
  const map: Record<string, ProposalDto[]> = {};
  for (const col of COLUMNS) map[col.key] = [];
  for (const p of proposals) {
    const col = COLUMNS.find((c) => c.states.includes(p.state));
    if (col) map[col.key].push(p);
  }
  for (const col of COLUMNS) {
    map[col.key].sort((a, b) => (a.responseDeadline ?? '').localeCompare(b.responseDeadline ?? ''));
  }
  return map;
}

async function refreshProposals(
  setProposals: (next: readonly ProposalDto[]) => void,
): Promise<void> {
  try {
    const res = await fetch('/api/proposals', { cache: 'no-store' });
    if (!res.ok) return;
    const body = (await res.json()) as { items: readonly ProposalDto[] };
    setProposals(body.items);
  } catch {
    // ignore — prochain tick réessayera
  }
}

interface CardProps {
  readonly proposal: ProposalDto;
  readonly now: number;
  readonly onClick: () => void;
}

function ProposalCard({ proposal, now, onClick }: CardProps) {
  const remaining = computeRemainingMs(proposal.responseDeadline, now);
  const urgent = remaining !== null && remaining > 0 && remaining < 15 * 60 * 1000;
  return (
    <button type="button" className={`kanban-card ${urgent ? 'urgent' : ''}`} onClick={onClick}>
      <div className="kanban-card-title">{proposal.mission.title}</div>
      <div className="kanban-card-client">{proposal.mission.clientName}</div>
      <div className="kanban-card-meta">
        {proposal.mission.canton} · {(proposal.mission.hourlyRateRappen / 100).toFixed(2)} CHF/h
      </div>
      <div className="kanban-card-meta">
        {formatDateRange(proposal.mission.startsAt, proposal.mission.endsAt)}
      </div>
      {remaining !== null &&
      (proposal.state === 'proposed' ||
        proposal.state === 'agency_review' ||
        proposal.state === 'pass_through_sent') ? (
        <div className={`kanban-card-deadline ${urgent ? 'urgent' : ''}`}>
          {remaining > 0 ? `⏱ ${formatRemaining(remaining)}` : '⏰ Expirée'}
        </div>
      ) : null}
    </button>
  );
}

interface DrawerProps {
  readonly proposal: ProposalDto;
  readonly canWrite: boolean;
  readonly onClose: () => void;
  readonly onMutated: () => void;
}

function DetailDrawer({ proposal, canWrite, onClose, onMutated }: DrawerProps) {
  const [pending, setPending] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [refusalKind, setRefusalKind] = useState('unavailable');
  const [refusalFreeform, setRefusalFreeform] = useState('');

  async function callApi(action: 'accept' | 'refuse' | 'routing', body: unknown): Promise<void> {
    setPending('loading');
    setError(null);
    try {
      const res = await fetch(`/api/proposals/${proposal.id}/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? `HTTP ${String(res.status)}`);
        setPending('error');
        return;
      }
      onMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown');
      setPending('error');
    }
  }

  const isTerminal =
    proposal.state === 'accepted' ||
    proposal.state === 'refused' ||
    proposal.state === 'timeout' ||
    proposal.state === 'expired';

  return (
    <div className="drawer-overlay" role="dialog" aria-label="Détail proposition" onClick={onClose}>
      <div
        className="drawer"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="drawer-header">
          <h2>{proposal.mission.title}</h2>
          <button type="button" className="drawer-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>
        <dl className="drawer-meta">
          <dt>Client</dt>
          <dd>{proposal.mission.clientName}</dd>
          <dt>Adresse</dt>
          <dd>{proposal.mission.siteAddress}</dd>
          <dt>Canton</dt>
          <dd>{proposal.mission.canton}</dd>
          <dt>Tarif</dt>
          <dd>{(proposal.mission.hourlyRateRappen / 100).toFixed(2)} CHF/h</dd>
          <dt>Période</dt>
          <dd>{formatDateRange(proposal.mission.startsAt, proposal.mission.endsAt)}</dd>
          <dt>État</dt>
          <dd>{proposal.state}</dd>
          {proposal.routingMode ? (
            <>
              <dt>Routing</dt>
              <dd>{proposal.routingMode}</dd>
            </>
          ) : null}
          {proposal.responseDeadline ? (
            <>
              <dt>Délai</dt>
              <dd>{new Date(proposal.responseDeadline).toLocaleString('fr-CH')}</dd>
            </>
          ) : null}
          {proposal.responseReason ? (
            <>
              <dt>Raison</dt>
              <dd>{proposal.responseReason}</dd>
            </>
          ) : null}
        </dl>

        {error ? <p className="drawer-error">{error}</p> : null}

        {canWrite && !isTerminal ? (
          <div className="drawer-actions">
            {proposal.routingMode === null ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    void callApi('routing', { mode: 'pass_through' });
                  }}
                  disabled={pending === 'loading'}
                >
                  Pass-through
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void callApi('routing', { mode: 'agency_controlled' });
                  }}
                  disabled={pending === 'loading'}
                >
                  Agency review
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    void callApi('accept', {});
                  }}
                  disabled={pending === 'loading'}
                >
                  ✓ Accepter
                </button>
                <div className="drawer-refuse">
                  <select
                    value={refusalKind}
                    onChange={(e) => {
                      setRefusalKind(e.target.value);
                    }}
                  >
                    {REFUSAL_REASONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  {refusalKind === 'other' ? (
                    <input
                      type="text"
                      value={refusalFreeform}
                      placeholder="Précisez…"
                      onChange={(e) => {
                        setRefusalFreeform(e.target.value);
                      }}
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      void callApi('refuse', {
                        reason: {
                          kind: refusalKind,
                          ...(refusalKind === 'other' && refusalFreeform.length > 0
                            ? { freeform: refusalFreeform }
                            : {}),
                        },
                      });
                    }}
                    disabled={
                      pending === 'loading' ||
                      (refusalKind === 'other' && refusalFreeform.length === 0)
                    }
                  >
                    ✗ Refuser
                  </button>
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function computeRemainingMs(deadlineIso: string | null, nowMs: number): number | null {
  if (!deadlineIso) return null;
  return new Date(deadlineIso).getTime() - nowMs;
}

export function formatRemaining(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDateRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  return `${start.toLocaleDateString('fr-CH')} ${start.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })}–${end.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })}`;
}
