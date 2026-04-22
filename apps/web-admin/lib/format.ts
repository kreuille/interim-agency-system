/**
 * Helpers d'affichage suisses (CLAUDE.md §3.1, §3.2).
 * - Dates en `dd.MM.yyyy` Europe/Zurich
 * - Montants en CHF formatés via Intl
 * - Téléphones préservés en E.164
 */

const dateFormatter = new Intl.DateTimeFormat('fr-CH', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Zurich',
});

const dateTimeFormatter = new Intl.DateTimeFormat('fr-CH', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Zurich',
});

const moneyFormatter = new Intl.NumberFormat('fr-CH', {
  style: 'currency',
  currency: 'CHF',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatDateCh(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '—';
  return dateFormatter.format(d);
}

export function formatDateTimeCh(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '—';
  return dateTimeFormatter.format(d);
}

/**
 * Formate un montant stocké en Rappen (centimes CHF) en CHF.
 * Accepte string (sérialisation REST) ou bigint (domain).
 */
export function formatMoneyChf(rappen: bigint | string | null | undefined): string {
  if (rappen === null || rappen === undefined || rappen === '') return '—';
  const asBigInt = typeof rappen === 'bigint' ? rappen : BigInt(rappen);
  // CHF format avec 2 décimales = Rappen / 100.
  // On évite Number() pour préserver la précision sur les gros montants.
  const negative = asBigInt < 0n;
  const abs = negative ? -asBigInt : asBigInt;
  const integer = abs / 100n;
  const cents = abs % 100n;
  const formatted = moneyFormatter.format(Number(integer) + Number(cents) / 100);
  return negative ? formatted.replace('CHF', '-CHF') : formatted;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} kB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}
