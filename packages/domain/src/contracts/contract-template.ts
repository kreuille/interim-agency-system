import type { ContractLegalSnapshot } from './mission-contract.js';
import { DomainError } from '../workers/errors.js';

/**
 * Branche CCT supportée. Chaque branche a son propre template avec
 * mentions spécifiques (paniers repas, indemnités déplacement, primes
 * spéciales, etc.). Référence : `skills/compliance/cct-staffing/SKILL.md`.
 */
export const CONTRACT_BRANCHES = [
  'demenagement',
  'btp_gros_oeuvre',
  'btp_second_oeuvre',
  'logistique',
] as const;

export type ContractBranch = (typeof CONTRACT_BRANCHES)[number];

/**
 * Langue du contrat. Suisse romande FR par défaut. DE/IT prévus pour
 * sprint ultérieur (l'agence MVP cible GE/VD/NE/JU/FR/VS, donc FR).
 */
export const CONTRACT_LANGS = ['fr', 'de', 'it'] as const;
export type ContractLang = (typeof CONTRACT_LANGS)[number];
export const DEFAULT_CONTRACT_LANG: ContractLang = 'fr';

export class TemplateNotFound extends DomainError {
  constructor(branch: string, lang: string) {
    super('contract_template_not_found', `Template contrat ${branch}/${lang} introuvable`);
  }
}

/**
 * Sections sémantiques d'un contrat. Le renderer PDF lit ces sections
 * pour produire le document final. C'est plus testable et plus typesafe
 * que des templates Handlebars→HTML→PDF (qu'on aurait dû passer par
 * puppeteer + Chromium).
 *
 * Chaque section est un titre + paragraphes. Le renderer applique son
 * propre style (police, taille, marge). Cf.
 * `apps/api/src/infrastructure/pdf/contract-renderer.ts`.
 */
export interface ContractSection {
  readonly title: string;
  readonly body: readonly string[];
}

export interface ContractDocument {
  readonly title: string; // Titre du contrat (ex. "Contrat de mission temporaire")
  readonly subtitle: string; // Ex. référence + branche
  readonly headerLines: readonly string[]; // En-tête : agence + LSE + IDE
  readonly partiesSection: ContractSection;
  readonly missionSection: ContractSection;
  readonly remunerationSection: ContractSection;
  readonly cctMentionsSection: ContractSection; // Mentions obligatoires CCT
  readonly signaturesSection: ContractSection;
  readonly footerLines: readonly string[];
}

export interface ContractTemplate {
  readonly branch: ContractBranch;
  readonly lang: ContractLang;
  /** Construit le document à partir du snapshot légal + référence. */
  readonly build: (input: ContractTemplateInput) => ContractDocument;
}

export interface ContractTemplateInput {
  readonly reference: string;
  readonly branch: ContractBranch;
  readonly legal: ContractLegalSnapshot;
}

export interface ContractTemplateRegistry {
  get(branch: ContractBranch, lang?: ContractLang): ContractTemplate;
}

export class InMemoryContractTemplateRegistry implements ContractTemplateRegistry {
  private readonly templates = new Map<string, ContractTemplate>();

  register(template: ContractTemplate): this {
    this.templates.set(this.key(template.branch, template.lang), template);
    return this;
  }

  get(branch: ContractBranch, lang?: ContractLang): ContractTemplate {
    const requested = lang ?? DEFAULT_CONTRACT_LANG;
    const template =
      this.templates.get(this.key(branch, requested)) ??
      this.templates.get(this.key(branch, DEFAULT_CONTRACT_LANG));
    if (!template) throw new TemplateNotFound(branch, requested);
    return template;
  }

  private key(branch: ContractBranch, lang: ContractLang): string {
    return `${branch}::${lang}`;
  }
}

/**
 * Helpers de format pour les templates (numéraire CHF, dates fr-CH).
 */
export function formatChfFromRappen(rappen: number): string {
  return (rappen / 100).toFixed(2).replace('.', ',') + ' CHF';
}

export function formatDateFr(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const y = String(date.getUTCFullYear());
  return `${d}.${m}.${y}`;
}

export function formatDateTimeFr(date: Date): string {
  const dStr = formatDateFr(date);
  const h = String(date.getUTCHours()).padStart(2, '0');
  const mn = String(date.getUTCMinutes()).padStart(2, '0');
  return `${dStr} ${h}:${mn}`;
}
