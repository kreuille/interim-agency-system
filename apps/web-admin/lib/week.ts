/**
 * Helpers semaine ISO (lundi → dimanche), tout en UTC pour aligner avec
 * l'API. L'affichage utilise ensuite `formatDateCh` pour passer en
 * Europe/Zurich.
 */

const MS_PER_DAY = 24 * 3600 * 1000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

/**
 * Renvoie le lundi (00:00 UTC) de la semaine ISO contenant `date`.
 */
export function isoMondayOf(date: Date): Date {
  const utc = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0),
  );
  const dow = utc.getUTCDay(); // 0 = dim, 1 = lun ... 6 = sam
  const diff = dow === 0 ? -6 : 1 - dow;
  utc.setUTCDate(utc.getUTCDate() + diff);
  return utc;
}

/**
 * Renvoie le tableau [lundi, ..., dimanche] (00:00 UTC) à partir d'un lundi.
 */
export function weekDaysFromMonday(monday: Date): readonly Date[] {
  const result: Date[] = [];
  for (let i = 0; i < 7; i++) {
    result.push(new Date(monday.getTime() + i * MS_PER_DAY));
  }
  return result;
}

export function shiftWeek(monday: Date, deltaWeeks: number): Date {
  return new Date(monday.getTime() + deltaWeeks * MS_PER_WEEK);
}

/**
 * Format ISO `YYYY-MM-DD` à partir d'une date UTC normalisée (00:00).
 */
export function isoDateOnly(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${String(y)}-${m}-${d}`;
}
