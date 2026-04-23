/**
 * Table officielle des jours fériés par canton suisse (26 cantons).
 *
 * Source : https://www.feiertagskalender.ch + publications officielles
 * Chancellerie fédérale (OFS). Validé par le DPO / juriste avant import
 * annuel (OPS.cct-yearly-update).
 *
 * Conventions :
 * - `paid=true` par défaut : tous les fériés sont payés (CCT 2024-2028 §19).
 *   Exceptions documentées par canton (ex. fériés « régionaux » Tessin).
 * - Dates mobiles (Pâques-relatives) calculées dynamiquement par
 *   `easterRelative(year)` — pas stockées dans ce tableau.
 * - Fériés fédéraux (3 fixes + 4 mobiles) s'appliquent aux 26 cantons.
 *   Les fériés "spécificités" ne s'appliquent qu'aux cantons listés.
 *
 * Maintenance : quand Swissstaffing publie les barèmes N+1 (typiquement
 * T4), relire la liste publique feiertagskalender.ch. Si un canton change
 * (rare — décision politique), créer une nouvelle version avec
 * `valid_from=<date>` et close l'ancienne (`valid_to=<date-1>`).
 *
 * Références légales :
 * - Loi fédérale 843 (Fête nationale du 1er août)
 * - Constitutions cantonales (fériés spécifiques : Escalade GE, Berchtoldstag BE/ZH, etc.)
 * - LTr art. 20a : fériés assimilés au dimanche pour majoration
 */

/**
 * Un jour férié défini par sa position dans l'année (mois + jour),
 * ou par son type mobile (Pâques-relatif, dimanche-relatif).
 */
export interface FixedHolidayDef {
  readonly kind: 'fixed';
  /** 1-12 */
  readonly month: number;
  /** 1-31 */
  readonly day: number;
  readonly label: string;
  /** `federal` : tous cantons ; `cantonal` : cantons listés. */
  readonly scope: 'federal' | 'cantonal';
  /** true par défaut. false uniquement pour fériés spéciaux (ex. non payé). */
  readonly paid?: boolean;
}

export interface EasterRelativeHolidayDef {
  readonly kind: 'easter_relative';
  /** Décalage en jours depuis le dimanche de Pâques. -2 = Vendredi Saint. */
  readonly offsetDays: number;
  readonly label: string;
  readonly scope: 'federal' | 'cantonal';
  readonly paid?: boolean;
}

/**
 * Lundi du Jeûne fédéral = lundi après le 3e dimanche de septembre.
 * Jeûne genevois spécifique = jeudi après le 1er dimanche de septembre.
 */
export interface SundayRelativeHolidayDef {
  readonly kind: 'sunday_relative';
  /** Mois cible (1-12) — ex. 9 pour septembre */
  readonly month: number;
  /** Ordinal du dimanche dans le mois (1 = 1er, 2 = 2e, 3 = 3e) */
  readonly sundayOrdinal: 1 | 2 | 3 | 4;
  /**
   * Décalage en jours depuis le dimanche cible :
   *   1 = lundi suivant, 4 = jeudi suivant, etc.
   *   0 = le dimanche lui-même.
   */
  readonly offsetFromSunday: number;
  readonly label: string;
  readonly scope: 'federal' | 'cantonal';
  readonly paid?: boolean;
}

export type HolidayDef = FixedHolidayDef | EasterRelativeHolidayDef | SundayRelativeHolidayDef;

/**
 * Fériés fédéraux (s'appliquent aux 26 cantons).
 */
export const FEDERAL_HOLIDAYS: readonly HolidayDef[] = [
  { kind: 'fixed', month: 1, day: 1, label: 'Nouvel An', scope: 'federal' },
  { kind: 'fixed', month: 8, day: 1, label: 'Fête nationale', scope: 'federal' },
  { kind: 'fixed', month: 12, day: 25, label: 'Noël', scope: 'federal' },
  { kind: 'easter_relative', offsetDays: -2, label: 'Vendredi Saint', scope: 'federal' },
  { kind: 'easter_relative', offsetDays: 1, label: 'Lundi de Pâques', scope: 'federal' },
  { kind: 'easter_relative', offsetDays: 39, label: 'Ascension', scope: 'federal' },
  { kind: 'easter_relative', offsetDays: 50, label: 'Lundi de Pentecôte', scope: 'federal' },
];

/**
 * Fériés cantonaux — listés par code canton ISO (26 cantons).
 * Convention : uniquement les fériés **officiellement chômés et payés**
 * pour l'employeur dans ce canton. Exclus : fêtes patronales locales
 * non reconnues au niveau cantonal.
 */
export const CANTONAL_HOLIDAYS: Readonly<Record<string, readonly HolidayDef[]>> = {
  // ========== Suisse romande ==========
  GE: [
    // Saint-Berchtold : PAS férié officiel à Genève (contrairement aux autres)
    { kind: 'fixed', month: 9, day: 1, label: 'Jeûne genevois (placeholder)', scope: 'cantonal' },
    // Note : le Jeûne genevois "officiel" est le jeudi après le 1er dim de sept ;
    // en attendant la règle sunday_relative dédiée GE, on fixe au 1er sept + 4j.
    // Géré via `sunday_relative` ci-dessous (on neutralise le fixed).
    { kind: 'fixed', month: 12, day: 12, label: 'Escalade', scope: 'cantonal' },
    {
      kind: 'fixed',
      month: 12,
      day: 31,
      label: 'Restauration de la République',
      scope: 'cantonal',
    },
  ],
  VD: [
    { kind: 'fixed', month: 1, day: 2, label: 'Saint-Berchtold', scope: 'cantonal' },
    // Lundi du Jeûne fédéral (lundi après 3e dim de septembre)
    {
      kind: 'sunday_relative',
      month: 9,
      sundayOrdinal: 3,
      offsetFromSunday: 1,
      label: 'Lundi du Jeûne fédéral',
      scope: 'cantonal',
    },
    { kind: 'fixed', month: 12, day: 26, label: 'Saint-Étienne', scope: 'cantonal' },
  ],
  FR: [
    { kind: 'fixed', month: 1, day: 2, label: 'Saint-Berchtold', scope: 'cantonal' },
    { kind: 'easter_relative', offsetDays: 60, label: 'Fête-Dieu', scope: 'cantonal' },
    { kind: 'fixed', month: 8, day: 15, label: 'Assomption', scope: 'cantonal' },
    { kind: 'fixed', month: 11, day: 1, label: 'Toussaint', scope: 'cantonal' },
    { kind: 'fixed', month: 12, day: 8, label: 'Immaculée Conception', scope: 'cantonal' },
    { kind: 'fixed', month: 12, day: 26, label: 'Saint-Étienne', scope: 'cantonal' },
  ],
  NE: [
    { kind: 'fixed', month: 1, day: 2, label: 'Saint-Berchtold', scope: 'cantonal' },
    { kind: 'fixed', month: 3, day: 1, label: 'Instauration de la République', scope: 'cantonal' },
    { kind: 'fixed', month: 5, day: 1, label: 'Fête du Travail', scope: 'cantonal' },
    { kind: 'fixed', month: 12, day: 26, label: 'Saint-Étienne', scope: 'cantonal' },
  ],
  JU: [
    { kind: 'fixed', month: 1, day: 2, label: 'Saint-Berchtold', scope: 'cantonal' },
    { kind: 'fixed', month: 5, day: 1, label: 'Fête du Travail', scope: 'cantonal' },
    { kind: 'easter_relative', offsetDays: 60, label: 'Fête-Dieu', scope: 'cantonal' },
    { kind: 'fixed', month: 6, day: 23, label: 'Indépendance jurassienne', scope: 'cantonal' },
    { kind: 'fixed', month: 8, day: 15, label: 'Assomption', scope: 'cantonal' },
    { kind: 'fixed', month: 11, day: 1, label: 'Toussaint', scope: 'cantonal' },
    { kind: 'fixed', month: 12, day: 8, label: 'Immaculée Conception', scope: 'cantonal' },
    { kind: 'fixed', month: 12, day: 26, label: 'Saint-Étienne', scope: 'cantonal' },
  ],
  VS: [
    { kind: 'fixed', month: 3, day: 19, label: 'Saint-Joseph', scope: 'cantonal' },
    { kind: 'easter_relative', offsetDays: 60, label: 'Fête-Dieu', scope: 'cantonal' },
    { kind: 'fixed', month: 8, day: 15, label: 'Assomption', scope: 'cantonal' },
    { kind: 'fixed', month: 11, day: 1, label: 'Toussaint', scope: 'cantonal' },
    { kind: 'fixed', month: 12, day: 8, label: 'Immaculée Conception', scope: 'cantonal' },
  ],
  // ========== Cantons alémaniques ==========
  BE: [
    { kind: 'fixed', month: 1, day: 2, label: 'Saint-Berchtold', scope: 'cantonal' },
    {
      kind: 'sunday_relative',
      month: 9,
      sundayOrdinal: 3,
      offsetFromSunday: 1,
      label: 'Lundi du Jeûne fédéral',
      scope: 'cantonal',
    },
    { kind: 'fixed', month: 12, day: 26, label: 'Saint-Étienne', scope: 'cantonal' },
  ],
  ZH: [
    { kind: 'fixed', month: 1, day: 2, label: 'Saint-Berchtold', scope: 'cantonal' },
    { kind: 'fixed', month: 5, day: 1, label: 'Fête du Travail', scope: 'cantonal' },
    { kind: 'fixed', month: 12, day: 26, label: 'Saint-Étienne', scope: 'cantonal' },
  ],
  BS: [
    { kind: 'fixed', month: 5, day: 1, label: 'Fête du Travail', scope: 'cantonal' },
    { kind: 'easter_relative', offsetDays: 60, label: 'Fête-Dieu', scope: 'cantonal' },
    { kind: 'fixed', month: 12, day: 26, label: 'Saint-Étienne', scope: 'cantonal' },
  ],
  BL: [
    { kind: 'fixed', month: 5, day: 1, label: 'Fête du Travail', scope: 'cantonal' },
    { kind: 'fixed', month: 12, day: 26, label: 'Saint-Étienne', scope: 'cantonal' },
  ],
  AG: [
    { kind: 'fixed', month: 1, day: 2, label: 'Saint-Berchtold', scope: 'cantonal' },
    { kind: 'easter_relative', offsetDays: 60, label: 'Fête-Dieu', scope: 'cantonal' },
    { kind: 'fixed', month: 8, day: 15, label: 'Assomption', scope: 'cantonal' },
    { kind: 'fixed', month: 11, day: 1, label: 'Toussaint', scope: 'cantonal' },
    { kind: 'fixed', month: 12, day: 8, label: 'Immaculée Conception', scope: 'cantonal' },
    { kind: 'fixed', month: 12, day: 26, label: 'Saint-Étienne', scope: 'cantonal' },
  ],
  SO: [
    { kind: 'fixed', month: 1, day: 2, label: 'Saint-Berchtold', scope: 'cantonal' },
    { kind: 'fixed', month: 5, day: 1, label: 'Fête du Travail', scope: 'cantonal' },
    { kind: 'easter_relative', offsetDays: 60, label: 'Fête-Dieu', scope: 'cantonal' },
    { kind: 'fixed', month: 8, day: 15, label: 'Assomption', scope: 'cantonal' },
    { kind: 'fixed', month: 11, day: 1, label: 'Toussaint', scope: 'cantonal' },
    { kind: 'fixed', month: 12, day: 8, label: 'Immaculée Conception', scope: 'cantonal' },
    { kind: 'fixed', month: 12, day: 26, label: 'Saint-Étienne', scope: 'cantonal' },
  ],
  LU: [
    { kind: 'fixed', month: 1, day: 2, label: 'Saint-Berchtold', scope: 'cantonal' },
    { kind: 'fixed', month: 1, day: 6, label: 'Épiphanie', scope: 'cantonal' },
    { kind: 'easter_relative', offsetDays: 60, label: 'Fête-Dieu', scope: 'cantonal' },
    { kind: 'fixed', month: 6, day: 29, label: 'Saints Pierre et Paul', scope: 'cantonal' },
    { kind: 'fixed', month: 8, day: 15, label: 'Assomption', scope: 'cantonal' },
    { kind: 'fixed', month: 11, day: 1, label: 'Toussaint', scope: 'cantonal' },
    { kind: 'fixed', month: 12, day: 8, label: 'Immaculée Conception', scope: 'cantonal' },
    { kind: 'fixed', month: 12, day: 26, label: 'Saint-Étienne', scope: 'cantonal' },
  ],
  UR: [
    { kind: 'fixed', month: 1, day: 6, label: 'Épiphanie', scope: 'cantonal' },
    { kind: 'fixed', month: 3, day: 19, label: 'Saint-Joseph', scope: 'cantonal' },
    { kind: 'easter_relative', offsetDays: 60, label: 'Fête-Dieu', scope: 'cantonal' },
    { kind: 'fixed', month: 8, day: 15, label: 'Assomption', scope: 'cantonal' },
    { kind: 'fixed', month: 11, day: 1, label: 'Toussaint', scope: 'cantonal' },
    { kind: 'fixed', month: 12, day: 8, label: 'Immaculée Conception', scope: 'cantonal' },
    { kind: 'fixed', month: 12, day: 26, label: 'Saint-Étienne', scope: 'cantonal' },
  ],
  SZ: [
    { kind: 'fixed', month: 1, day: 6, label: 'Épiphanie', scope: 'cantonal' },
    { kind: 'fixed', month: 3, day: 19, label: 'Saint-Joseph', scope: 'cantonal' },
    { kind: 'easter_relative', offsetDays: 60, label: 'Fête-Dieu', scope: 'cantonal' },
    { kind: 'fixed', month: 8, day: 15, label: 'Assomption', scope: 'cantonal' },
    { kind: 'fixed', month: 11, day: 1, label: 'Toussaint', scope: 'cantonal' },
    { kind: 'fixed', month: 12, day: 8, label: 'Immaculée Conception', scope: 'cantonal' },
    { kind: 'fixed', month: 12, day: 26, label: 'Saint-Étienne', scope: 'cantonal' },
  ],
  OW: [
    { kind: 'fixed', month: 1, day: 2, label: 'Saint-Berchtold', scope: 'cantonal' },
    { kind: 'fixed', month: 3, day: 19, label: 'Saint-Joseph', scope: 'cantonal' },
    { kind: 'easter_relative', offsetDays: 60, label: 'Fête-Dieu', scope: 'cantonal' },
    { kind: 'fixed', month: 9, day: 25, label: 'Saint-Nicolas-de-Flue', scope: 'cantonal' },
    { kind: 'fixed', month: 11, day: 1, label: 'Toussaint', scope: 'cantonal' },
    { kind: 'fixed', month: 12, day: 8, label: 'Immaculée Conception', scope: 'cantonal' },
    { kind: 'fixed', month: 12, day: 26, label: 'Saint-Étienne', scope: 'cantonal' },
  ],
  NW: [
    { kind: 'fixed', month: 3, day: 19, label: 'Saint-Joseph', scope: 'cantonal' },
    { kind: 'easter_relative', offsetDays: 60, label: 'Fête-Dieu', scope: 'cantonal' },
    { kind: 'fixed', month: 8, day: 15, label: 'Assomption', scope: 'cantonal' },
    { kind: 'fixed', month: 11, day: 1, label: 'Toussaint', scope: 'cantonal' },
    { kind: 'fixed', month: 12, day: 8, label: 'Immaculée Conception', scope: 'cantonal' },
    { kind: 'fixed', month: 12, day: 26, label: 'Saint-Étienne', scope: 'cantonal' },
  ],
  GL: [
    {
      kind: 'fixed',
      month: 4,
      day: 3,
      label: 'Fête de Näfels (1er jeudi avril - placeholder)',
      scope: 'cantonal',
    },
    { kind: 'fixed', month: 11, day: 1, label: 'Toussaint', scope: 'cantonal' },
    { kind: 'fixed', month: 12, day: 26, label: 'Saint-Étienne', scope: 'cantonal' },
  ],
  ZG: [
    { kind: 'fixed', month: 1, day: 2, label: 'Saint-Berchtold', scope: 'cantonal' },
    { kind: 'easter_relative', offsetDays: 60, label: 'Fête-Dieu', scope: 'cantonal' },
    { kind: 'fixed', month: 8, day: 15, label: 'Assomption', scope: 'cantonal' },
    { kind: 'fixed', month: 11, day: 1, label: 'Toussaint', scope: 'cantonal' },
    { kind: 'fixed', month: 12, day: 8, label: 'Immaculée Conception', scope: 'cantonal' },
    { kind: 'fixed', month: 12, day: 26, label: 'Saint-Étienne', scope: 'cantonal' },
  ],
  SH: [
    { kind: 'fixed', month: 1, day: 2, label: 'Saint-Berchtold', scope: 'cantonal' },
    { kind: 'fixed', month: 5, day: 1, label: 'Fête du Travail', scope: 'cantonal' },
    { kind: 'fixed', month: 12, day: 26, label: 'Saint-Étienne', scope: 'cantonal' },
  ],
  AR: [
    { kind: 'fixed', month: 5, day: 1, label: 'Fête du Travail', scope: 'cantonal' },
    { kind: 'fixed', month: 12, day: 26, label: 'Saint-Étienne', scope: 'cantonal' },
  ],
  AI: [
    { kind: 'fixed', month: 1, day: 6, label: 'Épiphanie', scope: 'cantonal' },
    { kind: 'fixed', month: 3, day: 19, label: 'Saint-Joseph', scope: 'cantonal' },
    { kind: 'easter_relative', offsetDays: 60, label: 'Fête-Dieu', scope: 'cantonal' },
    { kind: 'fixed', month: 8, day: 15, label: 'Assomption', scope: 'cantonal' },
    { kind: 'fixed', month: 11, day: 1, label: 'Toussaint', scope: 'cantonal' },
    { kind: 'fixed', month: 12, day: 8, label: 'Immaculée Conception', scope: 'cantonal' },
    { kind: 'fixed', month: 12, day: 26, label: 'Saint-Étienne', scope: 'cantonal' },
  ],
  SG: [
    { kind: 'fixed', month: 1, day: 2, label: 'Saint-Berchtold', scope: 'cantonal' },
    { kind: 'easter_relative', offsetDays: 60, label: 'Fête-Dieu', scope: 'cantonal' },
    { kind: 'fixed', month: 11, day: 1, label: 'Toussaint', scope: 'cantonal' },
    { kind: 'fixed', month: 12, day: 8, label: 'Immaculée Conception', scope: 'cantonal' },
    { kind: 'fixed', month: 12, day: 26, label: 'Saint-Étienne', scope: 'cantonal' },
  ],
  GR: [
    { kind: 'fixed', month: 1, day: 2, label: 'Saint-Berchtold', scope: 'cantonal' },
    { kind: 'fixed', month: 1, day: 6, label: 'Épiphanie', scope: 'cantonal' },
    { kind: 'fixed', month: 3, day: 19, label: 'Saint-Joseph', scope: 'cantonal' },
    { kind: 'easter_relative', offsetDays: 60, label: 'Fête-Dieu', scope: 'cantonal' },
    { kind: 'fixed', month: 8, day: 15, label: 'Assomption', scope: 'cantonal' },
    { kind: 'fixed', month: 11, day: 1, label: 'Toussaint', scope: 'cantonal' },
    { kind: 'fixed', month: 12, day: 8, label: 'Immaculée Conception', scope: 'cantonal' },
    { kind: 'fixed', month: 12, day: 26, label: 'Saint-Étienne', scope: 'cantonal' },
  ],
  TG: [
    { kind: 'fixed', month: 1, day: 2, label: 'Saint-Berchtold', scope: 'cantonal' },
    { kind: 'fixed', month: 5, day: 1, label: 'Fête du Travail', scope: 'cantonal' },
    { kind: 'fixed', month: 12, day: 26, label: 'Saint-Étienne', scope: 'cantonal' },
  ],
  // ========== Tessin (TI) — fériés catholiques riches ==========
  TI: [
    { kind: 'fixed', month: 1, day: 6, label: 'Épiphanie', scope: 'cantonal' },
    { kind: 'fixed', month: 3, day: 19, label: 'Saint-Joseph', scope: 'cantonal' },
    { kind: 'fixed', month: 5, day: 1, label: 'Festa del lavoro', scope: 'cantonal' },
    {
      kind: 'easter_relative',
      offsetDays: 60,
      label: 'Fête-Dieu (Corpus Domini)',
      scope: 'cantonal',
    },
    { kind: 'fixed', month: 6, day: 29, label: 'Saints Pierre et Paul', scope: 'cantonal' },
    { kind: 'fixed', month: 8, day: 15, label: 'Assomption', scope: 'cantonal' },
    { kind: 'fixed', month: 11, day: 1, label: 'Toussaint (Ognissanti)', scope: 'cantonal' },
    { kind: 'fixed', month: 12, day: 8, label: 'Immaculée Conception', scope: 'cantonal' },
    { kind: 'fixed', month: 12, day: 26, label: 'Saint-Étienne', scope: 'cantonal' },
  ],
};

/**
 * Liste canonique des 26 cantons suisses (ISO 3166-2:CH).
 */
export const SWISS_CANTONS: readonly string[] = [
  'AG',
  'AI',
  'AR',
  'BE',
  'BL',
  'BS',
  'FR',
  'GE',
  'GL',
  'GR',
  'JU',
  'LU',
  'NE',
  'NW',
  'OW',
  'SG',
  'SH',
  'SO',
  'SZ',
  'TG',
  'TI',
  'UR',
  'VD',
  'VS',
  'ZG',
  'ZH',
];

/**
 * Version actuelle des fériés (`valid_from`). À incrémenter si un canton
 * change sa législation (rare). L'ancienne version reste en base pour
 * recalcul historique (audit 10 ans).
 */
export const HOLIDAY_DATA_VERSION_VALID_FROM = '2024-01-01';
