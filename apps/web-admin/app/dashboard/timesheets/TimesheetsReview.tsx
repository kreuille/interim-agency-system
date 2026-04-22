'use client';

import type React from 'react';
import { useMemo, useState } from 'react';
import {
  computeSignableSelected,
  filterTimesheets,
  formatHours,
  groupByWeek,
  hasBlocker,
  type FilterState,
} from './timesheet-utils.js';

export interface TimesheetAnomalyDto {
  readonly kind: string;
  readonly severity: 'warning' | 'blocker';
  readonly message: string;
}

export interface TimesheetEntryDto {
  readonly workDate: string;
  readonly plannedStart: string;
  readonly plannedEnd: string;
  readonly actualStart: string;
  readonly actualEnd: string;
  readonly breakMinutes: number;
}

export interface TimesheetDto {
  readonly id: string;
  readonly externalTimesheetId: string;
  readonly workerName: string;
  readonly clientName: string;
  readonly weekIso: string; // ex. "2026-W17"
  readonly state: 'received' | 'under_review' | 'signed' | 'disputed' | 'tacit';
  readonly totalMinutes: number;
  readonly hourlyRateRappen: number;
  readonly totalCostRappen: number;
  readonly entries: readonly TimesheetEntryDto[];
  readonly anomalies: readonly TimesheetAnomalyDto[];
  readonly receivedAt: string;
}

interface Props {
  readonly initial: readonly TimesheetDto[];
  readonly canWrite: boolean;
}

const LEGAL_REFS: Record<string, string> = {
  missing_break: 'LTr art. 15 : pause 30 min obligatoire si journée > 7h',
  weekly_limit_exceeded: 'LTr art. 9 al. 1 : max 50h/sem (bâtiment)',
  daily_rest_insufficient: 'LTr art. 15a : repos 11h entre 2 journées',
  planned_actual_divergence: 'Écart horaire — contrôle manuel',
  night_work_undeclared: 'LTr art. 17b : majoration nuit 25% (10%)',
  sunday_work_undeclared: 'LTr art. 19 : majoration dimanche 50%',
  hourly_rate_below_cct: 'CCT : taux horaire sous minimum applicable',
};

export function TimesheetsReview({ initial, canWrite }: Props): React.JSX.Element {
  const [items, setItems] = useState<readonly TimesheetDto[]>(initial);
  const [filter, setFilter] = useState<FilterState>('to_review');
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [disputeFor, setDisputeFor] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState('');

  const visible = useMemo(
    () => filterTimesheets(items, filter, new Date().toISOString().slice(0, 10)),
    [items, filter],
  );

  const groupedByWeek = useMemo(() => groupByWeek(visible), [visible]);

  async function sign(id: string): Promise<void> {
    setBusy((prev) => ({ ...prev, [id]: true }));
    setErrors((prev) => {
      const { [id]: _, ...rest } = prev;
      void _;
      return rest;
    });
    try {
      const res = await fetch(`/api/timesheets/${id}/sign`, { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setErrors((prev) => ({ ...prev, [id]: body.error ?? `HTTP ${String(res.status)}` }));
        return;
      }
      setItems((prev) => prev.map((t) => (t.id === id ? { ...t, state: 'signed' as const } : t)));
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [id]: err instanceof Error ? err.message : 'network_error',
      }));
    } finally {
      setBusy((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function dispute(id: string, reason: string): Promise<void> {
    setBusy((prev) => ({ ...prev, [id]: true }));
    setErrors((prev) => {
      const { [id]: _, ...rest } = prev;
      void _;
      return rest;
    });
    try {
      const res = await fetch(`/api/timesheets/${id}/dispute`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setErrors((prev) => ({ ...prev, [id]: body.error ?? `HTTP ${String(res.status)}` }));
        return;
      }
      setItems((prev) => prev.map((t) => (t.id === id ? { ...t, state: 'disputed' as const } : t)));
      setDisputeFor(null);
      setDisputeReason('');
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [id]: err instanceof Error ? err.message : 'network_error',
      }));
    } finally {
      setBusy((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function bulkSign(): Promise<void> {
    const ids = [...selected];
    // Séquentiel (MP rate limit 100/min, safe) plutôt que parallèle
    for (const id of ids) {
      await sign(id);
    }
    setSelected(new Set());
  }

  function toggleSelect(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const signableSelected = computeSignableSelected(selected, items);

  return (
    <div>
      <div className="toolbar" style={{ gap: 12, marginBottom: 16 }}>
        <label>
          <span style={{ marginRight: 6 }}>Filtre :</span>
          <select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value as FilterState);
            }}
            aria-label="Filtre timesheet"
          >
            <option value="to_review">À contrôler</option>
            <option value="all">Tous</option>
            <option value="signed_today">Signés aujourd&apos;hui</option>
          </select>
        </label>
        <a
          href="/api/timesheets/export.csv"
          className="button"
          style={{ marginLeft: 'auto' }}
          aria-label="Exporter CSV hebdo"
        >
          Export CSV hebdo
        </a>
        {canWrite && selected.size > 0 && (
          <button
            type="button"
            onClick={() => {
              void bulkSign();
            }}
            disabled={signableSelected.length === 0}
            aria-label={`Signer ${String(signableSelected.length)} timesheets sélectionnés`}
          >
            Signer {signableSelected.length} sélectionné
            {signableSelected.length > 1 ? 's' : ''}
          </button>
        )}
      </div>

      {groupedByWeek.length === 0 ? (
        <p style={{ color: '#666' }}>Aucun timesheet à afficher pour ce filtre.</p>
      ) : (
        groupedByWeek.map(([week, tsList]) => (
          <section key={week} style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: '1rem', marginBottom: 8 }}>Semaine {week}</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #ddd', textAlign: 'left' }}>
                  {canWrite && <th style={{ width: 24 }}></th>}
                  <th>Intérimaire</th>
                  <th>Client</th>
                  <th>Heures</th>
                  <th>État</th>
                  <th>Anomalies</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tsList.map((t) => {
                  const isBlocker = hasBlocker(t);
                  return (
                    <tr
                      key={t.id}
                      style={{
                        borderBottom: '1px solid #eee',
                        backgroundColor: isBlocker ? '#fff5f5' : undefined,
                      }}
                    >
                      {canWrite && (
                        <td>
                          <input
                            type="checkbox"
                            checked={selected.has(t.id)}
                            onChange={() => {
                              toggleSelect(t.id);
                            }}
                            disabled={t.state === 'signed' || t.state === 'disputed' || isBlocker}
                            aria-label={`Sélectionner ${t.workerName}`}
                          />
                        </td>
                      )}
                      <td>{t.workerName}</td>
                      <td>{t.clientName}</td>
                      <td>{formatHours(t.totalMinutes)}</td>
                      <td>
                        <span className={`badge badge-${t.state}`}>{t.state}</span>
                      </td>
                      <td>
                        {t.anomalies.length === 0 ? (
                          <span style={{ color: '#28a' }}>OK</span>
                        ) : (
                          <ul style={{ margin: 0, paddingLeft: 16 }}>
                            {t.anomalies.map((a, i) => (
                              <li
                                key={i}
                                title={LEGAL_REFS[a.kind] ?? a.kind}
                                style={{
                                  color: a.severity === 'blocker' ? '#c00' : '#b80',
                                }}
                              >
                                {a.message}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {canWrite && (t.state === 'received' || t.state === 'under_review') && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                void sign(t.id);
                              }}
                              disabled={(busy[t.id] ?? false) || isBlocker}
                              aria-label={`Signer timesheet ${t.workerName}`}
                              style={{ marginRight: 8 }}
                            >
                              Signer
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDisputeFor(t.id);
                                setDisputeReason('');
                              }}
                              disabled={busy[t.id] ?? false}
                              aria-label={`Contester timesheet ${t.workerName}`}
                            >
                              Contester
                            </button>
                          </>
                        )}
                        {errors[t.id] && (
                          <p style={{ color: '#c00', fontSize: '0.75rem', margin: 0 }}>
                            {errors[t.id]}
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ))
      )}

      {disputeFor && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Motif de contestation"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div className="card" style={{ maxWidth: 500, width: '90%' }}>
            <h2>Contester le timesheet</h2>
            <p style={{ fontSize: '0.875rem', color: '#666' }}>
              Motif (10-500 chars) — sera envoyé à MovePlanner.
            </p>
            <textarea
              value={disputeReason}
              onChange={(e) => {
                setDisputeReason(e.target.value);
              }}
              rows={5}
              style={{ width: '100%', marginBottom: 12 }}
              placeholder="Ex. heures non conformes à la feuille de route client signée..."
              aria-label="Motif de contestation"
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => {
                  setDisputeFor(null);
                }}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => {
                  void dispute(disputeFor, disputeReason);
                }}
                disabled={
                  disputeReason.trim().length < 10 ||
                  disputeReason.trim().length > 500 ||
                  (busy[disputeFor] ?? false)
                }
              >
                Envoyer contestation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
