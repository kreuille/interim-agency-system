/**
 * Port de résolution `(canton, branche) → taux horaire CCT minimum`
 * (closes DETTE-053).
 *
 * Implémentations :
 *   - Production : `PrismaCctMinimumLookup` (table `cct_minimum_rates`
 *     indexée par `(canton, branch, periodFrom DESC)` — prend la plus
 *     récente période active à `now`).
 *   - Tests / dev : `InMemoryCctMinimumLookup` (cf. test-helpers.ts).
 *
 * Renvoie `undefined` si pas de taux configuré pour cette combinaison
 * → le détecteur skip alors le check `hourly_rate_below_cct`.
 */

export interface CctMinimumLookupInput {
  readonly canton: string;
  readonly branch?: string;
  /** Date de référence (default: maintenant). Permet de prendre la
   * version CCT en vigueur à cette date pour les timesheets antérieurs. */
  readonly atDate?: Date;
}

export interface CctMinimumLookupPort {
  resolve(input: CctMinimumLookupInput): Promise<number | undefined>;
}
