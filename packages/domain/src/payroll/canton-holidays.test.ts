import { describe, expect, it } from 'vitest';
import {
  computeHolidaysForCantonYear,
  easterSundayUtc,
  expandHolidayDef,
  InMemoryCantonHolidayRepository,
  StaticCantonHolidaysPort,
  type CantonHolidayPersisted,
} from './canton-holidays.js';
import {
  CANTONAL_HOLIDAYS,
  FEDERAL_HOLIDAYS,
  HOLIDAY_DATA_VERSION_VALID_FROM,
  SWISS_CANTONS,
} from './canton-holidays-data.js';

describe('easterSundayUtc — algorithme de Butcher', () => {
  it('Pâques 2026 = 5 avril', () => {
    expect(easterSundayUtc(2026).toISOString().slice(0, 10)).toBe('2026-04-05');
  });

  it('Pâques 2025 = 20 avril', () => {
    expect(easterSundayUtc(2025).toISOString().slice(0, 10)).toBe('2025-04-20');
  });

  it('Pâques 2024 = 31 mars', () => {
    expect(easterSundayUtc(2024).toISOString().slice(0, 10)).toBe('2024-03-31');
  });

  it('Pâques 2027 = 28 mars', () => {
    expect(easterSundayUtc(2027).toISOString().slice(0, 10)).toBe('2027-03-28');
  });

  it('Pâques 2028 = 16 avril', () => {
    expect(easterSundayUtc(2028).toISOString().slice(0, 10)).toBe('2028-04-16');
  });
});

describe('expandHolidayDef', () => {
  it('fixed : 1er janvier 2026', () => {
    const h = expandHolidayDef(
      { kind: 'fixed', month: 1, day: 1, label: 'Nouvel An', scope: 'federal' },
      2026,
    );
    expect(h.date).toBe('2026-01-01');
    expect(h.label).toBe('Nouvel An');
    expect(h.scope).toBe('federal');
    expect(h.paid).toBe(true);
  });

  it('fixed : `paid` peut être false explicitement', () => {
    const h = expandHolidayDef(
      { kind: 'fixed', month: 5, day: 1, label: 'Test non payé', scope: 'cantonal', paid: false },
      2026,
    );
    expect(h.paid).toBe(false);
  });

  it('easter_relative : Vendredi Saint 2026 = 3 avril (Pâques -2j)', () => {
    const h = expandHolidayDef(
      { kind: 'easter_relative', offsetDays: -2, label: 'Vendredi Saint', scope: 'federal' },
      2026,
    );
    expect(h.date).toBe('2026-04-03');
  });

  it('easter_relative : Ascension 2026 = 14 mai (Pâques +39j)', () => {
    const h = expandHolidayDef(
      { kind: 'easter_relative', offsetDays: 39, label: 'Ascension', scope: 'federal' },
      2026,
    );
    expect(h.date).toBe('2026-05-14');
  });

  it('sunday_relative : Lundi du Jeûne fédéral 2026 = 21 sept (lundi après 3e dim sept)', () => {
    // 1er septembre 2026 = mardi (jour 2)
    // 1er dim = 6 sept ; 2e dim = 13 sept ; 3e dim = 20 sept ; lundi suivant = 21 sept
    const h = expandHolidayDef(
      {
        kind: 'sunday_relative',
        month: 9,
        sundayOrdinal: 3,
        offsetFromSunday: 1,
        label: 'Lundi du Jeûne fédéral',
        scope: 'cantonal',
      },
      2026,
    );
    expect(h.date).toBe('2026-09-21');
  });

  it('sunday_relative : Jeûne genevois 2026 = jeudi après 1er dim sept = 10 septembre', () => {
    // 1er sept 2026 = mardi → 1er dim = 6 sept → jeudi suivant = 10 sept
    const h = expandHolidayDef(
      {
        kind: 'sunday_relative',
        month: 9,
        sundayOrdinal: 1,
        offsetFromSunday: 4,
        label: 'Jeûne genevois',
        scope: 'cantonal',
      },
      2026,
    );
    expect(h.date).toBe('2026-09-10');
  });
});

describe('SWISS_CANTONS — couverture 26 cantons', () => {
  it('liste exactement 26 cantons', () => {
    expect(SWISS_CANTONS).toHaveLength(26);
  });

  it('contient les 6 cantons romands', () => {
    for (const c of ['GE', 'VD', 'FR', 'NE', 'JU', 'VS']) {
      expect(SWISS_CANTONS).toContain(c);
    }
  });

  it('contient le Tessin (TI)', () => {
    expect(SWISS_CANTONS).toContain('TI');
  });

  it('CANTONAL_HOLIDAYS couvre les 26 cantons (au moins une définition par canton)', () => {
    for (const canton of SWISS_CANTONS) {
      expect(CANTONAL_HOLIDAYS[canton], `canton ${canton} sans définition`).toBeDefined();
      expect(
        CANTONAL_HOLIDAYS[canton]?.length,
        `${canton} sans aucun férié cantonal`,
      ).toBeGreaterThan(0);
    }
  });

  it('FEDERAL_HOLIDAYS contient les 7 fériés fédéraux', () => {
    // 3 fixes (1.1, 1.8, 25.12) + 4 mobiles (Vendredi Saint, Lundi Pâques, Ascension, Pentecôte)
    expect(FEDERAL_HOLIDAYS).toHaveLength(7);
  });

  it('HOLIDAY_DATA_VERSION_VALID_FROM matche le format ISO date YYYY-MM-DD', () => {
    expect(HOLIDAY_DATA_VERSION_VALID_FROM).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    // Doit être ≤ aujourd'hui (sinon les seeds n'ont pas de validité actuelle)
    const todayIso = new Date().toISOString().slice(0, 10);
    expect(HOLIDAY_DATA_VERSION_VALID_FROM.localeCompare(todayIso)).toBeLessThanOrEqual(0);
  });
});

describe('computeHolidaysForCantonYear — invariants 26 cantons', () => {
  for (const canton of SWISS_CANTONS) {
    it(`${canton} 2026 inclut les 7 fériés fédéraux`, () => {
      const dates = computeHolidaysForCantonYear(canton, 2026).map((h) => h.date);
      // 3 fixes
      expect(dates).toContain('2026-01-01'); // Nouvel An
      expect(dates).toContain('2026-08-01'); // Fête nationale
      expect(dates).toContain('2026-12-25'); // Noël
      // 4 mobiles (Pâques 2026 = 5 avril)
      expect(dates).toContain('2026-04-03'); // Vendredi Saint
      expect(dates).toContain('2026-04-06'); // Lundi de Pâques
      expect(dates).toContain('2026-05-14'); // Ascension (+39j)
      expect(dates).toContain('2026-05-25'); // Lundi de Pentecôte (+50j)
    });
  }

  it('GE 2026 inclut Escalade (12 décembre)', () => {
    const dates = computeHolidaysForCantonYear('GE', 2026).map((h) => h.date);
    expect(dates).toContain('2026-12-12');
  });

  it('GE 2026 inclut Restauration de la République (31 décembre)', () => {
    const dates = computeHolidaysForCantonYear('GE', 2026).map((h) => h.date);
    expect(dates).toContain('2026-12-31');
  });

  it('VD 2026 inclut Saint-Berchtold (2 janvier) + Lundi Jeûne fédéral (21 sept) + Saint-Étienne (26 déc)', () => {
    const dates = computeHolidaysForCantonYear('VD', 2026).map((h) => h.date);
    expect(dates).toContain('2026-01-02');
    expect(dates).toContain('2026-09-21');
    expect(dates).toContain('2026-12-26');
  });

  it('TI 2026 inclut Épiphanie (6 jan), Saint-Joseph (19 mars), Corpus Domini (Pâques+60), Saints Pierre et Paul (29 juin), Assomption (15 août), Toussaint (1er nov), Immaculée (8 déc), Saint-Étienne (26 déc)', () => {
    const dates = computeHolidaysForCantonYear('TI', 2026).map((h) => h.date);
    expect(dates).toContain('2026-01-06');
    expect(dates).toContain('2026-03-19');
    expect(dates).toContain('2026-06-04'); // Pâques 2026 (5 avril) +60j = 4 juin
    expect(dates).toContain('2026-06-29');
    expect(dates).toContain('2026-08-15');
    expect(dates).toContain('2026-11-01');
    expect(dates).toContain('2026-12-08');
    expect(dates).toContain('2026-12-26');
  });

  it('VS 2026 inclut Saint-Joseph (19 mars), Assomption (15 août), Toussaint, Immaculée mais PAS Saint-Étienne', () => {
    const dates = computeHolidaysForCantonYear('VS', 2026).map((h) => h.date);
    expect(dates).toContain('2026-03-19');
    expect(dates).toContain('2026-08-15');
    expect(dates).toContain('2026-11-01');
    expect(dates).toContain('2026-12-08');
    expect(dates).not.toContain('2026-12-26');
  });

  it('JU 2026 inclut Indépendance jurassienne (23 juin)', () => {
    const dates = computeHolidaysForCantonYear('JU', 2026).map((h) => h.date);
    expect(dates).toContain('2026-06-23');
  });

  it('NE 2026 inclut Instauration de la République (1er mars)', () => {
    const dates = computeHolidaysForCantonYear('NE', 2026).map((h) => h.date);
    expect(dates).toContain('2026-03-01');
  });

  it('canton inconnu (ex. "XX") → uniquement fériés fédéraux (politique défensive)', () => {
    const list = computeHolidaysForCantonYear('XX', 2026);
    expect(list.map((h) => h.date)).toContain('2026-01-01');
    expect(list.map((h) => h.date)).toContain('2026-08-01');
    expect(list.length).toBe(7); // 7 fédéraux
  });

  it('couverture 2027 et 2028 : Pâques 2027 = 28 mars → Vendredi Saint = 26 mars', () => {
    const dates2027 = computeHolidaysForCantonYear('VD', 2027).map((h) => h.date);
    expect(dates2027).toContain('2027-03-26'); // Vendredi Saint
    expect(dates2027).toContain('2027-03-29'); // Lundi de Pâques
    const dates2028 = computeHolidaysForCantonYear('VD', 2028).map((h) => h.date);
    expect(dates2028).toContain('2028-04-14'); // Vendredi Saint 2028 (Pâques 16/4 - 2)
  });

  it('toutes les dates retournées sont uniques (pas de doublon si jour férié fédéral + cantonal coïncident)', () => {
    for (const canton of SWISS_CANTONS) {
      const dates = computeHolidaysForCantonYear(canton, 2026).map((h) => h.date);
      const unique = new Set(dates);
      expect(dates.length).toBe(unique.size);
    }
  });

  it('résultat trié par date croissante', () => {
    const dates = computeHolidaysForCantonYear('GE', 2026).map((h) => h.date);
    const sorted = [...dates].sort((a, b) => a.localeCompare(b));
    expect(dates).toEqual(sorted);
  });
});

describe('StaticCantonHolidaysPort — wrapper cache', () => {
  it('GE 2026 inclut Escalade', () => {
    const port = new StaticCantonHolidaysPort();
    expect(port.isHoliday('GE', new Date('2026-12-12T12:00:00Z'))).toBe(true);
  });

  it('VD 2026 inclut Lundi de Pâques', () => {
    const port = new StaticCantonHolidaysPort();
    expect(port.isHoliday('VD', new Date('2026-04-06T12:00:00Z'))).toBe(true);
  });

  it('TI 2026 inclut Saints Pierre et Paul', () => {
    const port = new StaticCantonHolidaysPort();
    expect(port.isHoliday('TI', new Date('2026-06-29T12:00:00Z'))).toBe(true);
  });

  it('GE mer ouvré 2026-04-22 → false', () => {
    const port = new StaticCantonHolidaysPort();
    expect(port.isHoliday('GE', new Date('2026-04-22T12:00:00Z'))).toBe(false);
  });

  it('cache : appel répété → même référence (économise re-calcul)', () => {
    const port = new StaticCantonHolidaysPort();
    const a = port.forCantonAndYear('GE', 2026);
    const b = port.forCantonAndYear('GE', 2026);
    expect(a).toBe(b);
  });
});

describe('InMemoryCantonHolidayRepository — versioning', () => {
  function makePersisted(
    canton: string,
    date: string,
    label: string,
    validFrom = HOLIDAY_DATA_VERSION_VALID_FROM,
    validTo: string | null = null,
  ): CantonHolidayPersisted {
    return { canton, date, label, scope: 'cantonal', paid: true, validFrom, validTo };
  }

  it('upsertMany insère les rows et forCantonAndYear les retrouve', async () => {
    const repo = new InMemoryCantonHolidayRepository();
    await repo.upsertMany([
      makePersisted('GE', '2026-12-12', 'Escalade'),
      makePersisted('GE', '2026-12-31', 'Restauration'),
    ]);
    const list = repo.forCantonAndYear('GE', 2026);
    expect(list.map((h) => h.date)).toEqual(['2026-12-12', '2026-12-31']);
  });

  it('upsertMany idempotent : même PK → update sans doublon', async () => {
    const repo = new InMemoryCantonHolidayRepository();
    await repo.upsertMany([makePersisted('GE', '2026-12-12', 'Escalade v1')]);
    await repo.upsertMany([makePersisted('GE', '2026-12-12', 'Escalade v2')]);
    const list = repo.forCantonAndYear('GE', 2026);
    expect(list).toHaveLength(1);
    expect(list[0]?.label).toBe('Escalade v2');
  });

  it('versioning : un row avec validTo antérieur à la date est exclu', async () => {
    const repo = new InMemoryCantonHolidayRepository();
    await repo.upsertMany([
      // Row obsolète : validité expire avant la date du férié
      makePersisted('GE', '2026-12-12', 'Escalade obsolète', '2020-01-01', '2025-12-31'),
    ]);
    const list = repo.forCantonAndYear('GE', 2026);
    expect(list).toHaveLength(0);
  });

  it('versioning : un row avec validFrom postérieur à la date est exclu', async () => {
    const repo = new InMemoryCantonHolidayRepository();
    await repo.upsertMany([makePersisted('GE', '2026-12-12', 'Future', '2027-01-01', null)]);
    expect(repo.forCantonAndYear('GE', 2026)).toHaveLength(0);
  });

  it('listAllVersions retourne toutes les versions (valides + périmées)', async () => {
    const repo = new InMemoryCantonHolidayRepository();
    await repo.upsertMany([
      makePersisted('GE', '2026-12-12', 'v1', '2020-01-01', '2025-12-31'),
      makePersisted('GE', '2026-12-12', 'v2', '2026-01-01', null),
      makePersisted('GE', '2026-12-31', 'restauration', '2024-01-01', null),
    ]);
    const all = await repo.listAllVersions('GE');
    expect(all).toHaveLength(3);
  });
});
