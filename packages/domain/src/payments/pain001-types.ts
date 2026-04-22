/**
 * Types domain pour la génération `pain.001.001.09 CH` — ordre de
 * virement bancaire ISO 20022 (SIX / SEPA Suisse).
 *
 * Spec officielle :
 *   - https://www.six-group.com/en/products-services/banking-services/standardization.html
 *   - SIX Implementation Guidelines for Customer-Bank Messages V1.13.5
 *
 * Stratégie MVP : on génère du XML pain.001.001.09 conforme aux règles
 * SIX CH (BICFI optionnel pour les CH IBAN, format CHF avec 2 décimales,
 * remittance info Ustrd ≤ 140 chars). Validation XSD structurelle en
 * domain (présence balises) + DETTE pour validation libxmljs2 réelle
 * en infra (DETTE-077).
 */

export type Pain001PaymentMethod = 'TRF'; // Transfer (virement)

/** Service Level codes officiels ISO 20022. SEPA = virement européen. */
export type Pain001ServiceLevel = 'SEPA' | 'NURG' | 'SDVA';

/** Category Purpose codes — `SALA` = salaire (recommandé pour paie). */
export type Pain001CategoryPurpose = 'SALA' | 'PENS' | 'BONU' | 'OTHR';

/** Coordonnées bancaires d'un titulaire de compte. */
export interface PartyCoordinates {
  readonly name: string;
  /** IBAN complet (espaces autorisés à l'input, retirés en sortie XML). */
  readonly iban: string;
  /** BIC/SWIFT optionnel pour les IBAN CH (la banque le déduit du IBAN). */
  readonly bicfi?: string;
}

/**
 * Une instruction de virement = une ligne du fichier pain.001.
 * Mapping bulletin → instruction :
 *   - amountRappen = `PayslipBreakdown.netRappen`
 *   - creditor = worker (nom + IBAN)
 *   - remittanceInfo = "Salaire {workerId} {isoWeek}"
 *   - endToEndId = ID unique stable pour rapprochement camt.053
 */
export interface PaymentInstruction {
  /** ID unique pour cette instruction (≤ 35 chars). Stable inter-runs. */
  readonly instructionId: string;
  /** End-to-End identifier (≤ 35 chars), retourné dans pain.002 + camt.053. */
  readonly endToEndId: string;
  /** Montant en rappen (bigint). Sera converti en CHF avec 2 décimales. */
  readonly amountRappen: bigint;
  readonly creditor: PartyCoordinates;
  /** Texte libre ≤ 140 chars affiché sur le relevé bancaire. */
  readonly remittanceInfo: string;
}

export interface BuildPain001Input {
  /** ID unique du message (≤ 35 chars). Doit changer à chaque export. */
  readonly messageId: string;
  /** ID unique du PmtInf bloc (≤ 35 chars). Stable par batch. */
  readonly paymentInfoId: string;
  /** Date d'exécution demandée (YYYY-MM-DD). */
  readonly requestedExecutionDate: string;
  /** Date/heure de création du message (ISO 8601 sans timezone, locale CH). */
  readonly creationDateTime: string;
  /** Coordonnées de l'agence (initiating party + débiteur). */
  readonly debtor: PartyCoordinates;
  /** Liste des virements (≥ 1, max 99'999 par batch). */
  readonly instructions: readonly PaymentInstruction[];
  /** Service level (default SEPA). */
  readonly serviceLevel?: Pain001ServiceLevel;
  /** Category purpose (default SALA pour paie). */
  readonly categoryPurpose?: Pain001CategoryPurpose;
}
