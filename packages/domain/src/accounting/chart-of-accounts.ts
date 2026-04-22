/**
 * Plan comptable suisse PME — référence pour mapping écritures depuis
 * les événements métier (facture, paiement, paie).
 *
 * Source : norme PME suisse (Plan comptable général Suisse), version
 * Veb.ch / Swiss GAAP RPC adaptée. Numérotation à 4 chiffres.
 *
 * **ACTIFS (1xxx)** :
 *   1020 : Compte courant bancaire principal
 *   1100 : Créances résultant de ventes et prestations (clients)
 *   1170 : TVA à récupérer (impôt préalable)
 *   1300 : Actifs de régularisation
 *
 * **PASSIFS (2xxx)** :
 *   2000 : Dettes résultant d'achats et prestations (fournisseurs)
 *   2200 : TVA due
 *   2270 : Salaires à payer
 *   2271 : Cotisations sociales à payer (AVS, AC, LAA)
 *   2272 : LPP à payer
 *   2273 : Impôt à la source à payer
 *
 * **PRODUITS (3xxx)** :
 *   3200 : Ventes de prestations (chiffre d'affaires intérim)
 *   3805 : Escomptes et rabais accordés
 *
 * **CHARGES (5xxx-6xxx)** :
 *   5000 : Salaires bruts
 *   5700 : Cotisations sociales (part employeur)
 *   5710 : LPP (part employeur)
 *   5720 : LAA professionnelle (part employeur)
 *
 * Pour MVP, on couvre les 4 événements pivots :
 *   - Émission facture (3200 / 1100 / 2200)
 *   - Encaissement (1020 / 1100)
 *   - Bulletin de paie (5000 + 5700 / 2270 + 2271 + 2272 + 2273)
 *   - Virement salaire (2270 / 1020)
 */

export const CHART_OF_ACCOUNTS = {
  BANK: '1020',
  RECEIVABLES: '1100',
  VAT_INPUT: '1170',
  REGULARIZATION_ASSETS: '1300',
  PAYABLES: '2000',
  VAT_OUTPUT: '2200',
  WAGES_PAYABLE: '2270',
  SOCIAL_PAYABLE: '2271',
  LPP_PAYABLE: '2272',
  IS_PAYABLE: '2273',
  REVENUE: '3200',
  DISCOUNTS_GRANTED: '3805',
  WAGES_GROSS: '5000',
  EMPLOYER_SOCIAL: '5700',
  EMPLOYER_LPP: '5710',
  EMPLOYER_LAA: '5720',
} as const;

export type AccountCode = (typeof CHART_OF_ACCOUNTS)[keyof typeof CHART_OF_ACCOUNTS];

export const ACCOUNT_LABELS_FR: Readonly<Record<AccountCode, string>> = {
  '1020': 'Banque (compte courant)',
  '1100': 'Créances clients',
  '1170': 'TVA à récupérer',
  '1300': 'Actifs de régularisation',
  '2000': 'Dettes fournisseurs',
  '2200': 'TVA due',
  '2270': 'Salaires à payer',
  '2271': 'Cotisations sociales à payer',
  '2272': 'LPP à payer',
  '2273': 'Impôt à la source à payer',
  '3200': 'Ventes de prestations',
  '3805': 'Escomptes et rabais',
  '5000': 'Salaires bruts',
  '5700': 'Cotisations sociales (employeur)',
  '5710': 'LPP (employeur)',
  '5720': 'LAA prof. (employeur)',
};
