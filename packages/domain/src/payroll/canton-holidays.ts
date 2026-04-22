/**
 * Référentiel des jours fériés par canton suisse.
 *
 * Source : holidays.ch (fédéral + cantonaux). Le calendrier est figé à
 * l'année — on instancie une `CantonHolidays` par (canton, year) et on
 * la réutilise pour toutes les semaines de l'année.
 *
 * Note : on stocke uniquement la date civile (YYYY-MM-DD) — pas d'heure.
 * Le moteur de paie compare en UTC via la fonction `isHolidayInCanton`.
 *
 * Politique : les fériés mobiles (Vendredi Saint, Pâques, Ascension,
 * Pentecôte) sont calculés via algorithme de Pâques (closed-form).
 * Les fériés fixes (1er janv, 1er août, Noël) sont en table.
 */

export interface CantonHoliday {
  /** Date civile YYYY-MM-DD (UTC). */
  readonly date: string;
  /** Libellé FR (ex. "Fête nationale"). */
  readonly label: string;
  /** Type d'application : `federal` (tous cantons) ou `cantonal`. */
  readonly scope: 'federal' | 'cantonal';
}

/**
 * Repository in-memory + lookup. Multi-canton.
 */
export interface CantonHolidaysPort {
  forCantonAndYear(canton: string, year: number): readonly CantonHoliday[];
  isHoliday(canton: string, date: Date): boolean;
}

/**
 * Calcule la date de Pâques (algorithme de Butcher) pour une année.
 * Renvoie une Date UTC à 00:00.
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
 * Liste des fériés fédéraux + cantonaux pour un canton donné, année donnée.
 *
 * Couverture MVP : GE, VD, FR, NE, JU, BE, ZH, BS, BL, AG, VS (canton
 * romands + alémaniques principaux). Pour les autres cantons, on
 * retourne uniquement les fériés fédéraux.
 *
 * Si le canton réclame des fériés non listés, étendre `CANTONAL_FIXED`
 * dans une PR ciblée (référence : holidays.ch).
 */
const FEDERAL_FIXED: readonly { md: [number, number]; label: string }[] = [
  { md: [1, 1], label: 'Nouvel An' },
  { md: [8, 1], label: 'Fête nationale' },
  { md: [12, 25], label: 'Noël' },
];

const CANTONAL_FIXED: Readonly<Record<string, readonly { md: [number, number]; label: string }[]>> =
  {
    GE: [
      { md: [9, 12], label: 'Jeûne genevois (jeudi de la 1re sem. de sept) — placeholder' },
      { md: [12, 31], label: 'Restauration de la République' },
    ],
    VD: [{ md: [12, 25], label: 'Noël (déjà fédéral)' }],
    FR: [{ md: [11, 1], label: 'Toussaint' }],
    JU: [
      { md: [6, 23], label: 'Indépendance jurassienne' },
      { md: [11, 1], label: 'Toussaint' },
    ],
    NE: [{ md: [3, 1], label: 'Instauration de la République' }],
    BE: [{ md: [5, 1], label: 'Fête du Travail (Berne ville)' }],
    ZH: [],
    BS: [{ md: [5, 1], label: 'Fête du Travail' }],
    BL: [{ md: [5, 1], label: 'Fête du Travail' }],
    AG: [],
    VS: [
      { md: [3, 19], label: 'Saint Joseph' },
      { md: [11, 1], label: 'Toussaint' },
    ],
  };

/**
 * Fériés mobiles (relatifs à Pâques) — appliqués partout (fédéral) :
 *   - Vendredi Saint = Pâques - 2j
 *   - Lundi de Pâques = Pâques + 1j (cantonal majoritaire, non VS/TI)
 *   - Ascension = Pâques + 39j
 *   - Pentecôte (lundi) = Pâques + 50j
 */
function easterRelative(year: number): readonly CantonHoliday[] {
  const easter = easterSundayUtc(year);
  return [
    { date: isoDate(addDays(easter, -2)), label: 'Vendredi Saint', scope: 'federal' },
    { date: isoDate(addDays(easter, 1)), label: 'Lundi de Pâques', scope: 'cantonal' },
    { date: isoDate(addDays(easter, 39)), label: 'Ascension', scope: 'federal' },
    { date: isoDate(addDays(easter, 50)), label: 'Lundi de Pentecôte', scope: 'cantonal' },
  ];
}

export class StaticCantonHolidaysPort implements CantonHolidaysPort {
  private readonly cache = new Map<string, readonly CantonHoliday[]>();

  forCantonAndYear(canton: string, year: number): readonly CantonHoliday[] {
    const key = `${canton}:${String(year)}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const fixed: CantonHoliday[] = [
      ...FEDERAL_FIXED.map((f) => ({
        date: `${String(year)}-${String(f.md[0]).padStart(2, '0')}-${String(f.md[1]).padStart(2, '0')}`,
        label: f.label,
        scope: 'federal' as const,
      })),
      ...(CANTONAL_FIXED[canton] ?? []).map((f) => ({
        date: `${String(year)}-${String(f.md[0]).padStart(2, '0')}-${String(f.md[1]).padStart(2, '0')}`,
        label: f.label,
        scope: 'cantonal' as const,
      })),
    ];
    const all = [...fixed, ...easterRelative(year)];
    // dedup par date, garde le premier (federal en cas d'égalité)
    const seen = new Map<string, CantonHoliday>();
    for (const h of all) {
      if (!seen.has(h.date)) seen.set(h.date, h);
    }
    const result = [...seen.values()].sort((a, b) => a.date.localeCompare(b.date));
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
