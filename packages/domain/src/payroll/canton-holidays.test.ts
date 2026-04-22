import { describe, expect, it } from 'vitest';
import { easterSundayUtc, StaticCantonHolidaysPort } from './canton-holidays.js';

describe('easterSundayUtc', () => {
  it('Pâques 2026 = 5 avril', () => {
    expect(easterSundayUtc(2026).toISOString().slice(0, 10)).toBe('2026-04-05');
  });

  it('Pâques 2025 = 20 avril', () => {
    expect(easterSundayUtc(2025).toISOString().slice(0, 10)).toBe('2025-04-20');
  });

  it('Pâques 2024 = 31 mars', () => {
    expect(easterSundayUtc(2024).toISOString().slice(0, 10)).toBe('2024-03-31');
  });

  it('Pâques 2030 = 21 avril', () => {
    expect(easterSundayUtc(2030).toISOString().slice(0, 10)).toBe('2030-04-21');
  });
});

describe('StaticCantonHolidaysPort', () => {
  const port = new StaticCantonHolidaysPort();

  it('GE 2026 inclut 1er janv, 1er août, 25 déc', () => {
    const list = port.forCantonAndYear('GE', 2026);
    const dates = list.map((h) => h.date);
    expect(dates).toContain('2026-01-01');
    expect(dates).toContain('2026-08-01');
    expect(dates).toContain('2026-12-25');
  });

  it('GE 2026 inclut Vendredi Saint (Pâques - 2j = 3 avril)', () => {
    const list = port.forCantonAndYear('GE', 2026);
    expect(list.map((h) => h.date)).toContain('2026-04-03');
  });

  it('GE 2026 inclut Lundi de Pâques (6 avril)', () => {
    const list = port.forCantonAndYear('GE', 2026);
    expect(list.map((h) => h.date)).toContain('2026-04-06');
  });

  it('isHoliday GE 2026-08-01 = true (1er août)', () => {
    expect(port.isHoliday('GE', new Date('2026-08-01T12:00:00Z'))).toBe(true);
  });

  it('isHoliday GE 2026-04-22 = false (mer ouvré)', () => {
    expect(port.isHoliday('GE', new Date('2026-04-22T12:00:00Z'))).toBe(false);
  });

  it('VS 2026 a Saint Joseph (19 mars)', () => {
    expect(port.isHoliday('VS', new Date('2026-03-19T12:00:00Z'))).toBe(true);
  });

  it('GE 2026-03-19 = false (Saint Joseph est VS, pas GE)', () => {
    expect(port.isHoliday('GE', new Date('2026-03-19T12:00:00Z'))).toBe(false);
  });

  it('canton inconnu → uniquement les fériés fédéraux', () => {
    const list = port.forCantonAndYear('XX', 2026);
    expect(list.some((h) => h.date === '2026-01-01')).toBe(true);
    expect(list.some((h) => h.date === '2026-08-01')).toBe(true);
  });

  it('cache : appel répété → même référence', () => {
    const a = port.forCantonAndYear('GE', 2026);
    const b = port.forCantonAndYear('GE', 2026);
    expect(a).toBe(b);
  });
});
