import type { TimesheetDto } from './TimesheetsReview.js';

/**
 * Helpers purs testables extraits du composant `TimesheetsReview`.
 * Gardés hors du fichier `.tsx` pour pouvoir les tester sans rendu React.
 */

export function hasBlocker(t: Pick<TimesheetDto, 'anomalies'>): boolean {
  return t.anomalies.some((a) => a.severity === 'blocker');
}

export function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h)}h${m.toString().padStart(2, '0')}`;
}

export function groupByWeek(timesheets: readonly TimesheetDto[]): [string, TimesheetDto[]][] {
  const map = new Map<string, TimesheetDto[]>();
  for (const t of timesheets) {
    const arr = map.get(t.weekIso) ?? [];
    arr.push(t);
    map.set(t.weekIso, arr);
  }
  return [...map.entries()].sort(([a], [b]) => b.localeCompare(a));
}

export type FilterState = 'all' | 'to_review' | 'signed_today';

export function filterTimesheets(
  timesheets: readonly TimesheetDto[],
  filter: FilterState,
  nowIsoDate: string,
): TimesheetDto[] {
  if (filter === 'all') return [...timesheets];
  if (filter === 'to_review') {
    return timesheets.filter((t) => t.state === 'received' || t.state === 'under_review');
  }
  // signed_today
  return timesheets.filter((t) => t.state === 'signed' && t.receivedAt.startsWith(nowIsoDate));
}

/**
 * Filtre parmi les IDs sélectionnés ceux qu'on peut réellement signer
 * (état non terminal + pas de blocker). Le bouton bulk-sign n'enverra
 * que ceux-ci.
 */
export function computeSignableSelected(
  selected: ReadonlySet<string>,
  timesheets: readonly TimesheetDto[],
): string[] {
  const byId = new Map(timesheets.map((t) => [t.id, t]));
  return [...selected].filter((id) => {
    const t = byId.get(id);
    if (!t) return false;
    if (t.state !== 'received' && t.state !== 'under_review') return false;
    return !hasBlocker(t);
  });
}
