import { DomainError } from '../workers/errors.js';

/**
 * Impôt à la source (IS) — barèmes cantonaux progressifs.
 *
 * **Règles d'application** :
 *   - Permis L (séjour < 12 mois) : IS oui
 *   - Permis B (séjour > 12 mois) : IS oui
 *   - Permis G (frontalier) : IS oui, **canton de travail** (pas
 *     domicile car domicile = France/UE)
 *   - Permis C (établissement) : IS non, sauf si conjoint non-C
 *     (DETTE-067 : gestion conjoint à charge)
 *   - Suisse / non-permis : IS non
 *
 * **Canton appliqué** :
 *   - Permis L/B : barème du **canton de domicile** suisse
 *   - Permis G : barème du **canton de travail**
 *
 * **État civil** :
 *   - A : célibataire sans enfant
 *   - B : marié sans enfant (1 revenu)
 *   - C : marié 2 revenus (chacun A0)
 *   - H : famille monoparentale
 *   - + chiffre = nombre d'enfants à charge (A0, A1, A2...)
 *
 * Pour MVP, on supporte les codes principaux : A0, A1, B0, B1.
 * DETTE-068 : extension complète (C, H, lectures de barèmes officiels
 * cantonaux importés depuis ESTV format CSV).
 */

export const PERMIT_TYPES_TAXED_AT_SOURCE = ['L', 'B', 'G'] as const;
export type PermitType = (typeof PERMIT_TYPES_TAXED_AT_SOURCE)[number] | 'C' | 'CH';

export const IS_TARIF_CODES = ['A0', 'A1', 'B0', 'B1', 'H0'] as const;
export type IsTarifCode = (typeof IS_TARIF_CODES)[number];

/**
 * Une tranche du barème : pour brut hebdo dans [fromRappen, toRappen[,
 * appliquer `rateBp` (basis points sur le brut total — pas marginal).
 */
export interface IsBracket {
  readonly fromRappen: bigint;
  readonly toRappen: bigint; // exclusif. `null` représenté par MAX
  readonly rateBp: number;
}

export interface IsBracketsTable {
  readonly canton: string;
  readonly tarif: IsTarifCode;
  readonly year: number;
  readonly brackets: readonly IsBracket[];
}

export class NoIsBracketsFound extends DomainError {
  constructor(canton: string, tarif: IsTarifCode, year: number) {
    super('no_is_brackets_found', `Aucun barème IS pour ${canton} / ${tarif} / ${String(year)}`);
  }
}

export interface IsBracketsPort {
  /**
   * Renvoie la table de barème pour `(canton, tarif, year)`.
   * @throws NoIsBracketsFound si pas de table.
   */
  load(input: { canton: string; tarif: IsTarifCode; year: number }): IsBracketsTable;
}

/**
 * Applique le barème : trouve la tranche qui contient grossRappen et
 * applique le `rateBp` correspondant. Renvoie 0n si aucune tranche
 * matche (cas exotique : grossRappen négatif ou table vide).
 */
export function computeIs(grossWeekRappen: bigint, table: IsBracketsTable): bigint {
  if (grossWeekRappen <= 0n) return 0n;
  const bracket = table.brackets.find(
    (b) => grossWeekRappen >= b.fromRappen && grossWeekRappen < b.toRappen,
  );
  if (!bracket) return 0n;
  return (grossWeekRappen * BigInt(bracket.rateBp)) / 10000n;
}

export function permitIsTaxedAtSource(permit: PermitType): boolean {
  return (PERMIT_TYPES_TAXED_AT_SOURCE as readonly string[]).includes(permit);
}

/**
 * Renvoie le canton à utiliser pour le barème selon le permis :
 *   - G : canton de travail
 *   - autres : canton de domicile
 */
export function selectIsCanton(input: {
  permit: PermitType;
  domicileCanton: string;
  workCanton: string;
}): string {
  if (input.permit === 'G') return input.workCanton;
  return input.domicileCanton;
}

/**
 * Adapter in-memory pour tests + dev. Permet d'enregistrer des
 * barèmes minimaux par canton.
 */
export class StaticIsBracketsPort implements IsBracketsPort {
  private readonly tables = new Map<string, IsBracketsTable>();

  register(table: IsBracketsTable): this {
    const key = `${table.canton}:${table.tarif}:${String(table.year)}`;
    this.tables.set(key, table);
    return this;
  }

  load(input: { canton: string; tarif: IsTarifCode; year: number }): IsBracketsTable {
    const key = `${input.canton}:${input.tarif}:${String(input.year)}`;
    const t = this.tables.get(key);
    if (!t) throw new NoIsBracketsFound(input.canton, input.tarif, input.year);
    return t;
  }
}

/**
 * Barèmes synthétiques 2026 pour usage MVP / tests. Valeurs simplifiées
 * (vraies valeurs ESTV à charger en production via DETTE-068).
 *
 * Logique :
 *   - 0-1500 CHF/sem : 0%
 *   - 1500-3000 : 5%
 *   - 3000-5000 : 10%
 *   - 5000-+ : 15%
 *
 * Marié sans enfant (B0) : -2% sur chaque tranche.
 * Avec enfants (A1, B1) : -1% par enfant.
 */
export function buildDefaultIsTable(
  canton: string,
  tarif: IsTarifCode,
  year: number,
): IsBracketsTable {
  let baseAdj = 0;
  if (tarif === 'B0' || tarif === 'B1') baseAdj -= 200;
  if (tarif === 'A1' || tarif === 'B1') baseAdj -= 100;
  if (tarif === 'H0') baseAdj -= 300;

  const MAX = 100_000_00n; // CHF 100'000 hebdo (cap effectif)
  return {
    canton,
    tarif,
    year,
    brackets: [
      { fromRappen: 0n, toRappen: 150_000n, rateBp: Math.max(0, 0 + baseAdj) },
      { fromRappen: 150_000n, toRappen: 300_000n, rateBp: Math.max(0, 500 + baseAdj) },
      { fromRappen: 300_000n, toRappen: 500_000n, rateBp: Math.max(0, 1000 + baseAdj) },
      { fromRappen: 500_000n, toRappen: MAX, rateBp: Math.max(0, 1500 + baseAdj) },
    ],
  };
}
