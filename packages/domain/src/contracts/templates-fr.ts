import {
  formatChfFromRappen,
  formatDateFr,
  type ContractBranch,
  type ContractDocument,
  type ContractTemplate,
  type ContractTemplateInput,
} from './contract-template.js';

/**
 * Templates FR par branche CCT. Chaque template hérite de l'ossature
 * commune `buildBaseDocument` et ajoute des mentions spécifiques à la
 * branche dans `cctMentionsSection`.
 *
 * Les minima vacances/13e/repos sont issus de la CCT Location de Services
 * Suisse 2026 (réf. swissstaffing). À mettre à jour annuellement
 * (DETTE-044 si table Postgres dédiée).
 */

const COMMON_CCT_LINES_FR: readonly string[] = [
  'Vacances : 5 semaines/an pour les < 20 ans et les ≥ 50 ans, sinon 4 semaines/an, payées au prorata des heures effectuées.',
  '13ᵉ salaire : 8.33 % du salaire brut, versé mensuellement ou en fin de mission.',
  'Pauses : 15 min après 5 h 30 de travail, 30 min après 7 h, 1 h après 9 h.',
  'Repos quotidien : 11 h consécutives entre deux missions (LTr art. 15a).',
  'Durée hebdomadaire maximale : 50 h (LTr art. 9 al. 1 let. b).',
  'Référence : CCT Location de Services Suisse 2026.',
];

function buildBaseDocument(input: ContractTemplateInput): ContractDocument {
  const { reference, legal } = input;
  return {
    title: 'Contrat de mission temporaire',
    subtitle: `Réf. ${reference} — Branche : ${input.branch}`,
    headerLines: [
      `Agence : ${legal.agencyName}`,
      `IDE : ${legal.agencyIde}`,
      `Autorisation LSE : ${legal.agencyLseAuthorization} (valide jusqu'au ${formatDateFr(legal.agencyLseExpiresAt)})`,
    ],
    partiesSection: {
      title: 'Parties au contrat',
      body: [
        `Bailleur de services : ${legal.agencyName}, ${legal.agencyIde}.`,
        `Entreprise utilisatrice : ${legal.clientName}, ${legal.clientIde}.`,
        `Intérimaire : ${legal.workerFirstName} ${legal.workerLastName}, AVS ${maskAvs(legal.workerAvs)}.`,
      ],
    },
    missionSection: {
      title: 'Mission',
      body: [
        `Poste : ${legal.missionTitle}.`,
        `Lieu de travail : ${legal.siteAddress} (canton ${legal.canton}).`,
        `Période : du ${formatDateFr(legal.startsAt)} au ${formatDateFr(legal.endsAt)}.`,
        `Durée hebdomadaire prévue : ${String(legal.weeklyHours)} h.`,
      ],
    },
    remunerationSection: {
      title: 'Rémunération',
      body: [
        `Taux horaire brut : ${formatChfFromRappen(legal.hourlyRateRappen)}.`,
        `Référence CCT applicable : ${legal.cctReference}.`,
        `Le taux ci-dessus est conforme au minimum CCT applicable au poste, au canton et à la qualification.`,
      ],
    },
    cctMentionsSection: {
      title: 'Mentions CCT obligatoires',
      body: [...COMMON_CCT_LINES_FR],
    },
    signaturesSection: {
      title: 'Signatures',
      body: [
        `Lieu et date : Genève, ${formatDateFr(new Date())}.`,
        `Signature du bailleur : ${'_'.repeat(40)}`,
        `Signature de l'entreprise utilisatrice : ${'_'.repeat(40)}`,
        `Signature de l'intérimaire : ${'_'.repeat(40)}`,
      ],
    },
    footerLines: [
      `Contrat archivé 10 ans (LSE art. 19, OSE art. 51). Toute modification doit faire l'objet d'un avenant écrit.`,
      `Référence : ${reference}.`,
    ],
  };
}

/**
 * Masque l'AVS pour audit (12 derniers caractères → ****). Conformité
 * CLAUDE.md §3.4 : pas de PII en clair.
 */
function maskAvs(avs: string): string {
  if (avs.length <= 6) return avs;
  return avs.slice(0, 6) + '****' + avs.slice(-2);
}

function withSpecific(
  base: ContractDocument,
  branch: ContractBranch,
  extras: readonly string[],
): ContractDocument {
  return {
    ...base,
    cctMentionsSection: {
      title: base.cctMentionsSection.title,
      body: [
        ...base.cctMentionsSection.body,
        `--- Spécificités de la branche ${branch} ---`,
        ...extras,
      ],
    },
  };
}

export const FR_DEMENAGEMENT_TEMPLATE: ContractTemplate = {
  branch: 'demenagement',
  lang: 'fr',
  build: (input) =>
    withSpecific(buildBaseDocument(input), 'demenagement', [
      'Indemnités de panier repas selon CCT Déménagement Suisse.',
      'Heures supplémentaires majorées 25 % au-delà de 45 h/sem.',
      'Indemnités kilométriques pour déplacements imposés.',
    ]),
};

export const FR_BTP_GROS_OEUVRE_TEMPLATE: ContractTemplate = {
  branch: 'btp_gros_oeuvre',
  lang: 'fr',
  build: (input) =>
    withSpecific(buildBaseDocument(input), 'btp_gros_oeuvre', [
      'CN 2024-2028 (Convention nationale du secteur principal de la construction).',
      'Indemnité repas CHF 16.00/jour si > 1 h éloignement domicile.',
      'Heures supplémentaires majorées 25 %.',
      "Préavis : 7 jours pendant la période d'essai, 1 mois après.",
    ]),
};

export const FR_BTP_SECOND_OEUVRE_TEMPLATE: ContractTemplate = {
  branch: 'btp_second_oeuvre',
  lang: 'fr',
  build: (input) =>
    withSpecific(buildBaseDocument(input), 'btp_second_oeuvre', [
      'CCT Métiers techniques de la construction (cadres / sanitaire / chauffage).',
      'Indemnité repas CHF 16.00/jour si > 1 h éloignement.',
      'Heures supplémentaires majorées 25 % ; nuit majorée 50 %.',
    ]),
};

export const FR_LOGISTIQUE_TEMPLATE: ContractTemplate = {
  branch: 'logistique',
  lang: 'fr',
  build: (input) =>
    withSpecific(buildBaseDocument(input), 'logistique', [
      'CCT Logistique (transports + entreposage).',
      'Indemnités déplacement selon politique entreprise utilisatrice.',
      'Travail dominical majoré 50 % (cf. art. 19 LTr).',
    ]),
};

export const FR_TEMPLATES: readonly ContractTemplate[] = [
  FR_DEMENAGEMENT_TEMPLATE,
  FR_BTP_GROS_OEUVRE_TEMPLATE,
  FR_BTP_SECOND_OEUVRE_TEMPLATE,
  FR_LOGISTIQUE_TEMPLATE,
];
