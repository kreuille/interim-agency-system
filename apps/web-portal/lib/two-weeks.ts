/**
 * Modèle "deux semaines" pour le portail intérimaire :
 * - cette semaine ISO (lundi → dimanche)
 * - semaine suivante
 * - statut par jour (available / unavailable / mixed / unknown)
 *
 * Contrairement à l'admin (grille horaire), l'intérimaire saisit en
 * granularité jour : un tap sur lundi crée un slot 00:00→24:00 UTC
 * (ou un slot existant est supprimé si re-tap).
 */

const MS_PER_DAY = 24 * 3600 * 1000;

export type DayStatus = 'available' | 'unavailable' | 'mixed' | 'unknown';

export interface DayCell {
  readonly dateIso: string; // YYYY-MM-DD
  readonly status: DayStatus;
  /** slotIds qui couvrent ce jour (utile pour suppression). */
  readonly slotIds: readonly string[];
}

export interface SlotInstance {
  readonly slotId: string;
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly status: 'available' | 'tentative' | 'unavailable';
}

export function isoMondayOf(d: Date): Date {
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
  const dow = utc.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  utc.setUTCDate(utc.getUTCDate() + diff);
  return utc;
}

export function isoDateOnly(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${String(y)}-${m}-${day}`;
}

/**
 * Calcule les 14 jours à partir du lundi de la semaine courante.
 */
export function buildTwoWeeks(monday: Date, instances: readonly SlotInstance[]): DayCell[] {
  const cells: DayCell[] = [];
  for (let i = 0; i < 14; i++) {
    const dayStart = new Date(monday.getTime() + i * MS_PER_DAY);
    const dayEnd = new Date(dayStart.getTime() + MS_PER_DAY);
    const covering = instances.filter((inst) => {
      const from = new Date(inst.dateFrom).getTime();
      const to = new Date(inst.dateTo).getTime();
      return from < dayEnd.getTime() && to > dayStart.getTime();
    });
    let status: DayStatus = 'unknown';
    if (covering.length > 0) {
      const statuses = new Set(covering.map((c) => c.status));
      if (statuses.size === 1) {
        const only = [...statuses][0];
        status =
          only === 'available' ? 'available' : only === 'unavailable' ? 'unavailable' : 'mixed';
      } else {
        status = 'mixed';
      }
    }
    cells.push({
      dateIso: isoDateOnly(dayStart),
      status,
      slotIds: covering.map((c) => c.slotId),
    });
  }
  return cells;
}
