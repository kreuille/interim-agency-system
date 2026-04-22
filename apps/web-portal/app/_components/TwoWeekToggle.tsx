'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { DayCell } from '../../lib/two-weeks.js';
import { enqueue, pending } from '../../lib/offline-queue.js';

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

interface Props {
  readonly workerId: string;
  readonly cells: readonly DayCell[];
}

/**
 * Affiche 7 jours en grille. Tap sur un jour :
 * - status = 'unknown' → crée slot dispo journée entière
 * - status = 'available' → bascule en indispo (delete + create)
 * - status = 'unavailable' → bascule en dispo
 * - status = 'mixed' → ouvre l'édition côté admin (lien) — ici on log seulement.
 *
 * Si offline, la mutation est queue dans `localStorage`.
 */
export function TwoWeekToggle({ workerId, cells }: Props) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setPendingCount(pending(window.localStorage).length);
  }, []);

  async function toggle(cell: DayCell): Promise<void> {
    if (cell.status === 'mixed') return;
    const targetStatus = cell.status === 'available' ? 'unavailable' : 'available';

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      enqueue(window.localStorage, {
        kind: 'create-day-slot',
        dateIso: cell.dateIso,
        status: targetStatus,
        enqueuedAt: new Date().toISOString(),
      });
      setPendingCount((c) => c + 1);
      return;
    }

    try {
      // Supprime tous les slots existants (full-day overwrite simple pour le portail).
      for (const slotId of cell.slotIds) {
        await fetch(`/api/availability/toggle`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ workerId, action: 'delete', slotId }),
        });
      }
      const dateFrom = `${cell.dateIso}T00:00:00.000Z`;
      const dateTo = new Date(new Date(dateFrom).getTime() + 24 * 3600 * 1000).toISOString();
      await fetch(`/api/availability/toggle`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workerId,
          action: 'create',
          dateFrom,
          dateTo,
          status: targetStatus,
        }),
      });
      startTransition(() => {
        router.refresh();
      });
    } catch {
      // Bascule en queue offline si l'erreur survient malgré navigator.onLine=true.
      enqueue(window.localStorage, {
        kind: 'create-day-slot',
        dateIso: cell.dateIso,
        status: targetStatus,
        enqueuedAt: new Date().toISOString(),
      });
      setPendingCount((c) => c + 1);
    }
  }

  return (
    <>
      {pendingCount > 0 ? (
        <div className="banner banner-warn" role="status">
          {pendingCount} modification(s) en attente de synchronisation.
        </div>
      ) : null}
      <div className="week-grid" role="grid">
        {cells.map((c, i) => (
          <button
            key={c.dateIso}
            type="button"
            className={`day-cell ${c.status}`}
            disabled={busy}
            onClick={() => {
              void toggle(c);
            }}
            aria-label={`${DAY_LABELS[i] ?? ''} ${c.dateIso} — ${c.status}`}
          >
            <strong>{DAY_LABELS[i]}</strong>
            <span>{c.dateIso.slice(5)}</span>
            <small>{c.status === 'available' ? '✓' : c.status === 'unavailable' ? '✗' : '·'}</small>
          </button>
        ))}
      </div>
    </>
  );
}
