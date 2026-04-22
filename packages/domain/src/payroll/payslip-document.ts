import type { PayslipBreakdown } from './payslip-engine.js';

/**
 * Document sémantique du bulletin de salaire — agnostique du rendu PDF.
 *
 * Inspiré du pattern `ContractDocument` (A4.2). Le renderer
 * (`PayslipPdfRenderer` côté application/infra) consomme cette
 * structure et la pose dans un PDF A4.
 *
 * Sections (ordre standard Swissdec recommandation 5.0) :
 *   1. En-tête agence (logo, IDE, n° LSE, adresse)
 *   2. Identité worker (nom, AVS masqué, IBAN masqué, permis)
 *   3. Période de paie (semaine ISO, du-au)
 *   4. Heures travaillées : tableau jour×catégorie + total
 *   5. Brut : worked + 13e + vacances
 *   6. Déductions : AVS, AC, LAA, LPP, IS (par ligne)
 *   7. NET avec arrondi 5cts
 *   8. Quittance + IBAN destinataire + mention paiement
 *   9. Footer : conservation 5 ans (CO 958f), version moteur
 */

export interface PayslipDocument {
  readonly title: string;
  readonly subtitle: string;
  readonly agencyHeader: readonly string[];
  readonly workerSection: PayslipSection;
  readonly periodSection: PayslipSection;
  readonly hoursSection: PayslipHoursSection;
  readonly grossSection: PayslipSection;
  readonly deductionsSection: PayslipSection;
  readonly netSection: PayslipSection;
  readonly quittanceSection: PayslipSection;
  readonly footerLines: readonly string[];
}

export interface PayslipSection {
  readonly heading: string;
  readonly rows: readonly PayslipRow[];
}

export interface PayslipRow {
  readonly label: string;
  /** Si chaîne vide, ligne d'espacement ou séparateur. */
  readonly value: string;
  /** Si true, mettre en gras (totaux). */
  readonly emphasize?: boolean;
}

export interface PayslipHoursSection {
  readonly heading: string;
  /** En-tête tableau. */
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
  readonly totalsRow: readonly string[];
}

/**
 * Identité minimale agence pour bulletin (chargée depuis profil agency
 * — DETTE-071 : pour MVP on injecte directement).
 */
export interface PayslipAgencyInfo {
  readonly name: string;
  readonly ide: string;
  readonly lseAuthorization: string;
  readonly addressLine1: string;
  readonly postalCode: string;
  readonly city: string;
  readonly canton: string;
}

export interface PayslipWorkerLegal {
  readonly firstName: string;
  readonly lastName: string;
  readonly avs: string; // 756.XXXX.XXXX.XX
  readonly iban?: string;
  readonly permit?: string;
}

/**
 * Construit un `PayslipDocument` à partir d'un `PayslipBreakdown` et
 * des infos agence + worker. Logique de présentation pure (pas
 * d'effet de bord). Utilise le format CHF avec arrondi 5cts pour le NET.
 */
export function buildPayslipDocument(input: {
  readonly breakdown: PayslipBreakdown;
  readonly agency: PayslipAgencyInfo;
  readonly worker: PayslipWorkerLegal;
  readonly periodFromIso: string; // YYYY-MM-DD
  readonly periodToIso: string;
  readonly clientName?: string;
  readonly missionTitle?: string;
}): PayslipDocument {
  const b = input.breakdown;
  const agency = input.agency;
  const worker = input.worker;

  const fullName = `${worker.firstName} ${worker.lastName}`;
  const avsMasked = maskAvs(worker.avs);
  const ibanMasked = worker.iban ? maskIban(worker.iban) : '—';
  const totalHours = formatHours(b.workedGrossRappen, b);

  return {
    title: 'Bulletin de salaire',
    subtitle: `Période ${input.periodFromIso} au ${input.periodToIso} (semaine ${b.isoWeek})`,
    agencyHeader: [
      agency.name,
      `IDE ${agency.ide} · LSE ${agency.lseAuthorization}`,
      `${agency.addressLine1}, ${agency.postalCode} ${agency.city} (${agency.canton})`,
    ],
    workerSection: {
      heading: 'Bénéficiaire',
      rows: [
        { label: 'Nom', value: fullName },
        { label: 'AVS', value: avsMasked },
        { label: 'Permis', value: worker.permit ?? '—' },
        { label: 'IBAN', value: ibanMasked },
      ],
    },
    periodSection: {
      heading: 'Période et mission',
      rows: [
        { label: 'Semaine ISO', value: b.isoWeek },
        { label: 'Du', value: input.periodFromIso },
        { label: 'Au', value: input.periodToIso },
        ...(input.clientName ? [{ label: 'Client', value: input.clientName }] : []),
        ...(input.missionTitle ? [{ label: 'Mission', value: input.missionTitle }] : []),
      ],
    },
    hoursSection: {
      heading: 'Heures travaillées',
      headers: ['Catégorie', 'Heures'],
      rows: hoursRowsFromBreakdown(b),
      totalsRow: ['Total', totalHours],
    },
    grossSection: {
      heading: 'Brut de la période',
      rows: [
        { label: 'Salaire travaillé', value: formatChf(b.workedGrossRappen) },
        { label: '13ᵉ mois (8.33%)', value: formatChf(b.bonus13thRappen) },
        { label: 'Indemnité vacances', value: formatChf(b.holidayPayRappen) },
        { label: 'Total brut', value: formatChf(b.totalGrossRappen), emphasize: true },
      ],
    },
    deductionsSection: {
      heading: 'Déductions',
      rows: [
        { label: 'AVS / AI / APG (5.30%)', value: formatChf(b.avsRappen) },
        { label: 'Assurance chômage (AC)', value: formatChf(b.acRappen) },
        { label: 'LAA non-professionnel', value: formatChf(b.laaRappen) },
        {
          label: `LPP (${(b.lpp.totalBp / 200).toFixed(2)}% part salariée)`,
          value: formatChf(b.lpp.employeeWeekRappen),
        },
        ...(b.isCanton
          ? [{ label: `Impôt à la source (${b.isCanton})`, value: formatChf(b.isRappen) }]
          : []),
        {
          label: 'Total déductions',
          value: formatChf(b.totalDeductionsRappen),
          emphasize: true,
        },
      ],
    },
    netSection: {
      heading: 'Net à payer',
      rows: [
        { label: 'Net avant arrondi', value: formatChf(b.netBeforeRoundingRappen) },
        {
          label: 'Ajustement arrondi 5cts',
          value: formatChfSigned(b.round5AdjustmentRappen),
        },
        {
          label: 'NET FINAL (CHF, arrondi 5cts)',
          value: formatChf(b.netRappen),
          emphasize: true,
        },
      ],
    },
    quittanceSection: {
      heading: 'Quittance',
      rows: [
        {
          label: 'Montant net versé',
          value: `CHF ${(Number(b.netRappen) / 100).toFixed(2)} (arrondi 5cts)`,
          emphasize: true,
        },
        { label: 'Sur IBAN', value: ibanMasked },
        { label: 'Mode', value: 'Virement bancaire SEPA / SIC' },
      ],
    },
    footerLines: [
      `Moteur paie v${b.engineVersion} · barème ${String(b.yearApplied)}`,
      'Conservation comptable : 10 ans (CO art. 958f). Confidentiel — usage strictement personnel.',
      "En cas de désaccord : contacter l'agence dans les 30 jours suivant réception.",
    ],
  };
}

function hoursRowsFromBreakdown(b: PayslipBreakdown): readonly (readonly string[])[] {
  // Simplification : on ne dispose pas du minutesByKind ici (PayslipBreakdown
  // ne ré-expose pas le PayrollBreakdown sous-jacent). DETTE-072 : enrichir
  // PayslipBreakdown pour inclure minutesByKind. MVP : on affiche juste un
  // résumé monétaire sans split par catégorie.
  const totalHours = formatHours(b.workedGrossRappen, b);
  return [
    ['Total heures travaillées (toutes catégories)', totalHours],
    ['Inclut majorations (nuit/dim/férié/sup)', '— voir détail contrat'],
  ];
}

function formatHours(workedGrossRappen: bigint, b: PayslipBreakdown): string {
  // workedGrossRappen / hourlyRate ≈ heures, mais pas accès au taux ici.
  // On utilise totalCost / heures n'est pas dispo direct → DETTE-072.
  // Approximation : pas calculable sans le breakdown source.
  void workedGrossRappen;
  void b;
  return '— (cf. timesheets joints)';
}

function formatChf(rappen: bigint): string {
  const sign = rappen < 0n ? '-' : '';
  const abs = rappen < 0n ? -rappen : rappen;
  const chf = abs / 100n;
  const cents = abs % 100n;
  return `${sign}CHF ${chf.toString()}.${cents.toString().padStart(2, '0')}`;
}

function formatChfSigned(rappen: bigint): string {
  if (rappen === 0n) return 'CHF 0.00';
  const prefix = rappen > 0n ? '+' : '';
  return prefix + formatChf(rappen);
}

/** AVS 756.XXXX.XXXX.XX → 756.XX****.****.XX (4 derniers visibles). */
export function maskAvs(avs: string): string {
  if (avs.length < 14) return '***';
  const head = avs.slice(0, 5); // 756.X
  const tail = avs.slice(-2); // XX
  return `${head}***.****.${tail}`;
}

/** IBAN CH56 0900 ... → CH56 **** **** **** **89 (4 derniers visibles). */
export function maskIban(iban: string): string {
  const compact = iban.replace(/\s+/g, '');
  if (compact.length < 8) return '****';
  return `${compact.slice(0, 4)} **** **** **** **${compact.slice(-2)}`;
}
