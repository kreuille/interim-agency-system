'use client';

import { useMemo, useState, useTransition, type CSSProperties, type ReactElement } from 'react';
import { useRouter } from 'next/navigation';
import { isoDateOnly, weekDaysFromMonday } from '../../../../../lib/week.js';

export interface SlotInstance {
  readonly slotId: string;
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly status: 'available' | 'tentative' | 'unavailable';
  readonly source: 'internal' | 'worker_self' | 'api' | 'moveplanner_push';
  readonly reason: string | null;
}

export interface WeekCalendarProps {
  readonly workerId: string;
  readonly weekStart: string; // ISO date YYYY-MM-DD (lundi UTC)
  readonly instances: readonly SlotInstance[];
  readonly freshness: 'realtime' | 'cached' | 'stale';
  readonly canWrite: boolean;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

interface NewSlotState {
  readonly dayIndex: number;
  readonly fromHour: number;
  readonly toHour: number;
}

export function WeekCalendar({
  workerId,
  weekStart,
  instances,
  freshness,
  canWrite,
}: WeekCalendarProps): ReactElement {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<NewSlotState | null>(null);
  const [draftStatus, setDraftStatus] = useState<'available' | 'tentative' | 'unavailable'>(
    'available',
  );
  const [draftReason, setDraftReason] = useState('');

  const monday = useMemo(() => new Date(`${weekStart}T00:00:00.000Z`), [weekStart]);
  const days = useMemo(() => weekDaysFromMonday(monday), [monday]);

  function openDraft(dayIndex: number, hour: number): void {
    if (!canWrite) return;
    setDraft({ dayIndex, fromHour: hour, toHour: Math.min(23, hour + 1) });
    setDraftStatus('available');
    setDraftReason('');
    setError(null);
  }

  function closeDraft(): void {
    setDraft(null);
    setError(null);
  }

  async function submitDraft(): Promise<void> {
    if (!draft) return;
    if (draft.toHour <= draft.fromHour) {
      setError('Heure de fin doit être strictement après le début.');
      return;
    }
    const day = days[draft.dayIndex];
    const dateFrom = new Date(day.getTime() + draft.fromHour * 3600 * 1000).toISOString();
    const dateTo = new Date(day.getTime() + draft.toHour * 3600 * 1000).toISOString();
    const payload: Record<string, unknown> = {
      dateFrom,
      dateTo,
      status: draftStatus,
    };
    if (draftReason.trim().length > 0) payload.reason = draftReason.trim();

    try {
      const res = await fetch(`/api/workers/${workerId}/availability/slots`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Erreur ${String(res.status)}`);
        return;
      }
      closeDraft();
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown_error');
    }
  }

  async function deleteSlot(slotId: string): Promise<void> {
    if (!canWrite) return;
    if (!window.confirm('Supprimer ce créneau ?')) return;
    try {
      const res = await fetch(`/api/workers/${workerId}/availability/slots/${slotId}`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 404) {
        setError(`Erreur ${String(res.status)}`);
        return;
      }
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown_error');
    }
  }

  const segmentsByDay = useMemo(() => groupByDay(instances, days), [instances, days]);

  return (
    <div className="week-calendar" data-testid="week-calendar">
      <div className="legend" aria-label="Légende">
        <span className="chip available">Disponible</span>
        <span className="chip tentative">Tentative</span>
        <span className="chip unavailable">Indisponible</span>
        <span className={`freshness freshness-${freshness}`}>Données : {freshness}</span>
      </div>

      <div className="grid" role="grid">
        <div className="grid-header">
          <div className="hour-header" />
          {days.map((d, i) => (
            <div key={isoDateOnly(d)} className="day-header">
              <strong>{DAY_LABELS[i]}</strong>
              <span>{isoDateOnly(d).slice(5)}</span>
            </div>
          ))}
        </div>
        <div className="grid-body">
          {HOURS.map((h) => (
            <div key={h} className="grid-row">
              <div className="hour-cell">{String(h).padStart(2, '0')}h</div>
              {days.map((day, di) => (
                <button
                  key={`${isoDateOnly(day)}-${String(h)}`}
                  type="button"
                  className="hour-slot"
                  onClick={() => {
                    openDraft(di, h);
                  }}
                  disabled={!canWrite || pending}
                  aria-label={`Créer créneau ${DAY_LABELS[di] ?? ''} ${String(h)}h`}
                />
              ))}
            </div>
          ))}
          {segmentsByDay.map((segs, di) =>
            segs.map((s) => (
              <div
                key={s.slotId + s.dateFrom}
                className={`slot slot-${s.status} ${freshness === 'stale' ? 'slot-stale' : ''}`}
                style={positionStyle(di, s)}
                title={`${s.status}${s.reason ? ` — ${s.reason}` : ''}`}
              >
                <span>{s.status}</span>
                {s.reason ? <small>{s.reason}</small> : null}
                {canWrite ? (
                  <button
                    type="button"
                    className="slot-delete"
                    onClick={() => {
                      void deleteSlot(s.slotId);
                    }}
                    aria-label="Supprimer ce créneau"
                  >
                    ×
                  </button>
                ) : null}
              </div>
            )),
          )}
        </div>
      </div>

      {draft ? (
        <div role="dialog" aria-label="Nouveau créneau" className="draft-modal">
          <div className="draft-card">
            <h3>Nouveau créneau</h3>
            <p>
              {DAY_LABELS[draft.dayIndex]} — de{' '}
              <input
                type="number"
                min={0}
                max={22}
                value={draft.fromHour}
                onChange={(e) => {
                  setDraft({ ...draft, fromHour: Number(e.target.value) });
                }}
              />
              h à{' '}
              <input
                type="number"
                min={1}
                max={23}
                value={draft.toHour}
                onChange={(e) => {
                  setDraft({ ...draft, toHour: Number(e.target.value) });
                }}
              />
              h
            </p>
            <label>
              Statut
              <select
                value={draftStatus}
                onChange={(e) => {
                  setDraftStatus(e.target.value as 'available' | 'tentative' | 'unavailable');
                }}
              >
                <option value="available">Disponible</option>
                <option value="tentative">Tentative</option>
                <option value="unavailable">Indisponible</option>
              </select>
            </label>
            <label>
              Raison (optionnel)
              <input
                type="text"
                value={draftReason}
                onChange={(e) => {
                  setDraftReason(e.target.value);
                }}
                maxLength={200}
              />
            </label>
            {error ? <p className="error">{error}</p> : null}
            <div className="draft-actions">
              <button type="button" onClick={closeDraft} disabled={pending}>
                Annuler
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  void submitDraft();
                }}
                disabled={pending}
              >
                {pending ? 'Création…' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface DaySegment extends SlotInstance {
  readonly dayIndex: number;
  readonly startHour: number;
  readonly endHour: number;
}

function groupByDay(
  instances: readonly SlotInstance[],
  days: readonly Date[],
): readonly DaySegment[][] {
  const result: DaySegment[][] = days.map(() => []);
  for (const inst of instances) {
    const from = new Date(inst.dateFrom);
    const to = new Date(inst.dateTo);
    for (let i = 0; i < days.length; i++) {
      const d = days[i];
      const dayStart = d.getTime();
      const dayEnd = dayStart + 24 * 3600 * 1000;
      const overlapStart = Math.max(from.getTime(), dayStart);
      const overlapEnd = Math.min(to.getTime(), dayEnd);
      if (overlapEnd <= overlapStart) continue;
      const startHour = (overlapStart - dayStart) / (3600 * 1000);
      const endHour = (overlapEnd - dayStart) / (3600 * 1000);
      result[i].push({ ...inst, dayIndex: i, startHour, endHour });
    }
  }
  return result;
}

function positionStyle(dayIndex: number, seg: DaySegment): CSSProperties {
  const colWidthPct = 100 / 7;
  const left = `calc(60px + ${String(dayIndex * colWidthPct)}% - ${String((dayIndex * 60) / 7)}px)`;
  const top = `${String(40 + seg.startHour * 32)}px`;
  const height = `${String(Math.max(20, (seg.endHour - seg.startHour) * 32 - 2))}px`;
  const width = `calc(${String(colWidthPct)}% - ${String(60 / 7 + 4)}px)`;
  return { left, top, height, width, position: 'absolute' };
}
