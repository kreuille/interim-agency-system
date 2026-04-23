/**
 * Référentiel des jours fériés par canton suisse (26 cantons).
 *
 * Ce module expose :
 * 1. **`CantonHoliday`** : entité immutable (date civile + label + scope
 *    fédéral/cantonal + paid).
 * 2. **`CantonHolidaysPort`** : port applicatif (read-only) utilisé par
 *    `PayrollEngine` pour classifier un segment comme `holiday` ou non.
 * 3. **`CantonHolidayRepository`** : port applicatif (read + write) pour
 *    les seeds et les migrations. L'adapter Prisma l'implémente ; les
 *    tests unitaires utilisent un `InMemoryCantonHolidayRepository`.
 * 4. **`StaticCantonHolidaysPort`** : implémentation in-memory calculée
 *    depuis `canton-holidays-data.ts` (les 26 cantons codés en TS).
 *    Utilisée en dev/test et comme fallback si la table Prisma est vide.
 *
 * Versioning : chaque ferié a `validFrom` / `validTo?`. Une règle cantonale
 * qui change (ex. ajout d'un férié par vote populaire) crée un nouveau
 * tuple avec `validFrom=<date-du-vote>` et clôt l'ancien via `validTo`.
 * `forCantonAndYear` retourne la vue cohérente pour l'année demandée.
 *
 * Politique : les fériés mobiles (Vendredi Saint, Pâques, Ascension,
 * Pentecôte) sont calculés via algorithme de Pâques (closed-form Butcher).
 * Les fériés fixes sont expandés depuis la table `FEDERAL_HOLIDAYS` +
 * `CANTONAL_HOLIDAYS` (cf. `canton-holidays-data.ts`).
 */

import {
  CANTONAL_HOLIDAYS,
  FEDERAL_HOLIDAYS,
  type HolidayDef,
  SWISS_CANTONS,
} from './canton-holidays-data.js';

// ============================================================
// Types
// ============================================================

export interface CantonHoliday {
  /** Date civile YYYY-MM-DD (UTC). */
  readonly date: string;
  /** Libellé FR/IT selon usage cantonal (ex. « Fête nationale »). */
  readonly label: string;
  /** `federal` (tous cantons) ou `cantonal` (canton listé). */
  readonly scope: 'federal' | 'cantonal';
  /** Payé par l'employeur (default true). */
  readonly paid: boolean;
}

/**
 * Port read-only pour `PayrollEngine` — lookup rapide par (canton, date).
 * C'est le port **minimal** consommé par le domaine pur ; garde-le léger.
 */
export interface CantonHolidaysPort {
  forCantonAndYear(canton: string, year: number): readonly CantonHoliday[];
  isHoliday(canton: string, date: Date): boolean;
}

/**
 * Port étendu pour les seeds, migrations, consultations admin. Implémenté
 * par l'adapter Prisma. **Pas** consommé par `PayrollEngine` (qui reste
 * sur `CantonHolidaysPort` pour garder le domaine ignorant de l'IO).
 */
export interface CantonHolidayRepository extends CantonHolidaysPort {
  /**
   * Insère ou met à jour un ensemble de fériés. Idempotent par `(canton,
   * date, validFrom)`. Les anciens tuples avec `validTo` antérieur à
   * `validFrom` de la nouvelle entrée sont préservés (audit historique).
   */
  upsertMany(holidays: readonly CantonHolidayPersisted[]): Promise<void>;

  /**
   * Liste toutes les versions d'un férié pour debug/audit (valide ou
   * périmé). Utilisé par `OPS.cct-yearly-update` pour vérifier qu'une
   * mise à jour n'écrase pas silencieusement une version historique.
   */
  listAllVersions(canton: string): Promise<readonly CantonHolidayPersisted[]>;
}

/**
 * Tuple persisté : inclut le versioning pour traçabilité.
 */
export interface CantonHolidayPersisted extends CantonHoliday {
  readonly canton: string;
  /** ISO date ≤ `date` — à partir de quand cette définition s'applique. */
  readonly validFrom: string;
  /** ISO date > `date` — jusqu'à quand (null = toujours valide). */
  readonly validTo: string | null;
}

// ============================================================
// Calcul de Pâques (algorithme de Butcher, closed-form)
// ============================================================

/**
 * Dimanche de Pâques pour une année donnée, en UTC 00:00.
 * Algorithme de Butcher — exact pour les années 1583-4099.
 */
export function easterSundayUtc(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function isoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${String(y)}-${m}-${dd}`;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

/**
 * Trouve la date du N-ième dimanche du mois donné.
 * Ex: `nthSundayOfMonth(2026, 9, 3)` = 3e dimanche de septembre 2026.
 */
function nthSundayOfMonth(year: number, month: number, nth: 1 | 2 | 3 | 4): Date {
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const firstDayOfWeek = firstOfMonth.getUTCDay(); // 0 = dim
  const daysUntilFirstSunday = firstDayOfWeek === 0 ? 0 : 7 - firstDayOfWeek;
  const firstSundayDay = 1 + daysUntilFirstSunday;
  const targetDay = firstSundayDay + (nth - 1) * 7;
  return new Date(Date.UTC(year, month - 1, targetDay));
}

// ============================================================
// Expansion d'une définition en date concrète (année donnée)
// ============================================================

/**
 * Matérialise un `HolidayDef` abstrait en `CantonHoliday` concret pour
 * une année donnée. Gère les 3 types : fixed, easter_relative, sunday_relative.
 */
export function expandHolidayDef(def: HolidayDef, year: number): CantonHoliday {
  const paid = def.paid ?? true;
  if (def.kind === 'fixed') {
    const date = new Date(Date.UTC(year, def.month - 1, def.day));
    return { date: isoDate(date), label: def.label, scope: def.scope, paid };
  }
  if (def.kind === 'easter_relative') {
    const date = addDays(easterSundayUtc(year), def.offsetDays);
    return { date: isoDate(date), label: def.label, scope: def.scope, paid };
  }
  // sunday_relative
  const sunday = nthSundayOfMonth(year, def.month, def.sundayOrdinal);
  const date = addDays(sunday, def.offsetFromSunday);
  return { date: isoDate(date), label: def.label, scope: def.scope, paid };
}

/**
 * Énumère tous les fériés (fédéraux + cantonaux) pour un canton et
 * une année. Dédupliqué par date (si deux définitions coïncident, la
 * première wins — federal avant cantonal dans la concat).
 *
 * Exporté pour alimenter le seed Prisma et les tests d'invariant
 * (ex: « GE a toujours l'Escalade le 12 décembre »).
 */
export function computeHolidaysForCantonYear(
  canton: string,
  year: number,
): readonly CantonHoliday[] {
  // Politique défensive : si le code canton est inconnu (typo, code
  // non-suisse), on retourne au minimum les fériés fédéraux. Sous-payer
  // les majorations fériés est une exposition légale plus grave que
  // sur-payer un cas marginal.
  const federalDefs: readonly HolidayDef[] = FEDERAL_HOLIDAYS;
  const cantonalDefs: readonly HolidayDef[] = SWISS_CANTONS.includes(canton)
    ? (CANTONAL_HOLIDAYS[canton] ?? [])
    : [];
  const seen = new Map<string, CantonHoliday>();
  for (const def of [...federalDefs, ...cantonalDefs]) {
    const holiday = expandHolidayDef(def, year);
    if (!seen.has(holiday.date)) {
      seen.set(holiday.date, holiday);
    }
  }
  return [...seen.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// ============================================================
// Static in-memory implementation
// ============================================================

/**
 * Adapter in-memory calculé depuis `canton-holidays-data.ts`.
 *
 * Utilisé :
 * - en dev/test (pas besoin de DB en unit tests)
 * - comme fallback si la table Prisma est vide (premier démarrage avant seed)
 *
 * En prod, le `PrismaCantonHolidayRepository` est préféré pour permettre
 * aux admins de corriger/étendre la table sans redéployer.
 */
export class StaticCantonHolidaysPort implements CantonHolidaysPort {
  private readonly cache = new Map<string, readonly CantonHoliday[]>();

  forCantonAndYear(canton: string, year: number): readonly CantonHoliday[] {
    const key = `${canton}:${String(year)}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const result = computeHolidaysForCantonYear(canton, year);
    this.cache.set(key, result);
    return result;
  }

  isHoliday(canton: string, date: Date): boolean {
    const year = date.getUTCFullYear();
    const list = this.forCantonAndYear(canton, year);
    const iso = isoDate(date);
    return list.some((h) => h.date === iso);
  }
}

// ============================================================
// InMemory repository (pour les tests)
// ============================================================

/**
 * Implémentation in-memory du repository **étendu** — pour les tests qui
 * valident le contrat `upsertMany`/`listAllVersions` sans toucher Prisma.
 * L'adapter Prisma est dans `apps/api/src/infrastructure/persistence/`.
 */
export class InMemoryCantonHolidayRepository implements CantonHolidayRepository {
  private readonly rows: CantonHolidayPersisted[] = [];

  forCantonAndYear(canton: string, year: number): readonly CantonHoliday[] {
    const yearStart = `${String(year)}-01-01`;
    const yearEnd = `${String(year)}-12-31`;
    const active = this.rows.filter(
      (r) =>
        r.canton === canton &&
        r.date >= yearStart &&
        r.date <= yearEnd &&
        r.validFrom <= r.date &&
        (r.validTo === null || r.validTo >= r.date),
    );
    return active.map((r) => ({
      date: r.date,
      label: r.label,
      scope: r.scope,
      paid: r.paid,
    }));
  }

  isHoliday(canton: string, date: Date): boolean {
    const year = date.getUTCFullYear();
    const iso = isoDate(date);
    return this.forCantonAndYear(canton, year).some((h) => h.date === iso);
  }

  async upsertMany(holidays: readonly CantonHolidayPersisted[]): Promise<void> {
    for (const h of holidays) {
      const existing = this.rows.findIndex(
        (r) => r.canton === h.canton && r.date === h.date && r.validFrom === h.validFrom,
      );
      if (existing >= 0) {
        this.rows[existing] = h;
      } else {
        this.rows.push(h);
      }
    }
    return Promise.resolve();
  }

  async listAllVersions(canton: string): Promise<readonly CantonHolidayPersisted[]> {
    return Promise.resolve(
      [...this.rows]
        .filter((r) => r.canton === canton)
        .sort((a, b) => {
          if (a.date !== b.date) return a.date.localeCompare(b.date);
          return a.validFrom.localeCompare(b.validFrom);
        }),
    );
  }
}
