import type { PrismaClient } from '@prisma/client';
import type {
  CantonHoliday,
  CantonHolidayPersisted,
  CantonHolidayRepository,
} from '@interim/domain';

/**
 * Adapter Postgres pour `canton_holidays` (DETTE-036).
 *
 * Stratégie de cache : pour l'usage `PayrollEngine`, on appelle
 * `forCantonAndYear` souvent (1 fois par client × année par batch paie).
 * On wrap dans un cache in-memory `Map<string, CantonHoliday[]>` invalidé
 * uniquement par redéploiement (la table évolue rarement — au max 1
 * fois/an via `OPS.cct-yearly-update`).
 *
 * Si un canton/année n'a jamais été fetché, on hit la DB ; sinon on rend
 * la copie cachée. Pour invalidation explicite (ex. après seed), créer
 * une nouvelle instance via `createPrismaCantonHolidayRepository`.
 *
 * Idempotence `upsertMany` : Prisma `upsert` par PK composite (canton,
 * date, validFrom). Update label/scope/paid/validTo si row existe.
 */
export class PrismaCantonHolidayRepository implements CantonHolidayRepository {
  private readonly cache = new Map<string, readonly CantonHoliday[]>();

  constructor(private readonly prisma: PrismaClient) {}

  /**
   * NB : `forCantonAndYear` est SYNCHRONE par contrat (`CantonHolidaysPort`).
   * On utilise donc le cache UNIQUEMENT après un préchargement explicite via
   * `preload(canton, year)` ; sinon on retourne `[]` (cache miss).
   *
   * Le bootstrap d'API doit appeler `preload` pour les cantons + années
   * actifs (typiquement année courante + N+1) au démarrage.
   */
  forCantonAndYear(canton: string, year: number): readonly CantonHoliday[] {
    const key = `${canton}:${String(year)}`;
    return this.cache.get(key) ?? [];
  }

  isHoliday(canton: string, date: Date): boolean {
    const year = date.getUTCFullYear();
    const list = this.forCantonAndYear(canton, year);
    const iso = isoDate(date);
    return list.some((h) => h.date === iso);
  }

  /**
   * Précharge le cache pour (canton, year). Appelé au bootstrap de l'API
   * et après chaque `upsertMany` pour invalider/rafraîchir.
   */
  async preload(canton: string, year: number): Promise<readonly CantonHoliday[]> {
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year, 11, 31));
    const rows = await this.prisma.cantonHoliday.findMany({
      where: {
        canton,
        date: { gte: yearStart, lte: yearEnd },
        validFrom: { lte: yearEnd },
        OR: [{ validTo: null }, { validTo: { gte: yearStart } }],
      },
      orderBy: { date: 'asc' },
    });
    const list: CantonHoliday[] = rows.map((r) => ({
      date: isoDate(r.date),
      label: r.label,
      scope: r.scope === 'federal' ? 'federal' : 'cantonal',
      paid: r.paid,
    }));
    const key = `${canton}:${String(year)}`;
    this.cache.set(key, list);
    return list;
  }

  async upsertMany(holidays: readonly CantonHolidayPersisted[]): Promise<void> {
    // Pas de Prisma createMany car on a besoin d'upsert (idempotence).
    // On fait des upsert batchés en transaction pour rester atomique
    // (rollback complet si une seule ligne échoue).
    await this.prisma.$transaction(
      holidays.map((h) =>
        this.prisma.cantonHoliday.upsert({
          where: {
            canton_date_validFrom: {
              canton: h.canton,
              date: new Date(h.date),
              validFrom: new Date(h.validFrom),
            },
          },
          create: {
            canton: h.canton,
            date: new Date(h.date),
            label: h.label,
            scope: h.scope,
            paid: h.paid,
            validFrom: new Date(h.validFrom),
            validTo: h.validTo === null ? null : new Date(h.validTo),
          },
          update: {
            label: h.label,
            scope: h.scope,
            paid: h.paid,
            validTo: h.validTo === null ? null : new Date(h.validTo),
          },
        }),
      ),
    );
    // Invalidation des entrées de cache pour les cantons touchés
    const touchedCantons = new Set(holidays.map((h) => h.canton));
    for (const key of this.cache.keys()) {
      const [canton] = key.split(':');
      if (canton !== undefined && touchedCantons.has(canton)) {
        this.cache.delete(key);
      }
    }
  }

  async listAllVersions(canton: string): Promise<readonly CantonHolidayPersisted[]> {
    const rows = await this.prisma.cantonHoliday.findMany({
      where: { canton },
      orderBy: [{ date: 'asc' }, { validFrom: 'asc' }],
    });
    return rows.map((r) => ({
      canton: r.canton,
      date: isoDate(r.date),
      label: r.label,
      scope: r.scope === 'federal' ? 'federal' : 'cantonal',
      paid: r.paid,
      validFrom: isoDate(r.validFrom),
      validTo: r.validTo === null ? null : isoDate(r.validTo),
    }));
  }
}

function isoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${String(y)}-${m}-${dd}`;
}
