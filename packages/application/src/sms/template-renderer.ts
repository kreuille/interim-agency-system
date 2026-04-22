import { SmsError } from './sms-sender.js';

/**
 * Renderer Mustache-light : remplace `{{variable}}` par la valeur,
 * sans support des sections (`{{#if}}`, `{{#each}}`) ni partials.
 * Suffisant pour les SMS courts (160 chars).
 *
 * Validation stricte : si une variable est référencée dans le template
 * mais absente du `data`, throw `SmsError('template_missing_variable')`.
 * Évite l'envoi de SMS avec `Hello {{firstName}}` non remplacé.
 *
 * Échappement : aucune (les SMS sont du texte brut). Les valeurs sont
 * `String()` puis insérées telles quelles. Pour interdire les retours
 * à la ligne ou caractères de contrôle, normaliser en amont.
 */

const VAR_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

export interface RenderedSms {
  readonly templateCode: string;
  readonly lang: SmsLang;
  readonly body: string;
}

/**
 * Langues supportées. Priorité : fr (défaut Suisse romande) → de (Suisse
 * alémanique) → it (Tessin) → en (fallback EU). Si un template n'existe
 * que dans certaines langues, fallback vers fr par défaut.
 */
export const SMS_LANGS = ['fr', 'de', 'it', 'en'] as const;
export type SmsLang = (typeof SMS_LANGS)[number];
export const DEFAULT_SMS_LANG: SmsLang = 'fr';

export interface SmsTemplate {
  readonly code: string;
  readonly lang?: SmsLang; // default 'fr'
  readonly source: string;
  /** Limite hard du SMS (défaut 1600 = 10 segments). */
  readonly maxLength?: number;
}

export interface SmsTemplateRegistry {
  /**
   * Renvoie le template pour `(code, lang)`. Si absent, fallback vers
   * la langue par défaut (`fr`). `undefined` si ni la langue demandée ni
   * la langue par défaut ne sont enregistrées.
   */
  get(code: string, lang?: SmsLang): SmsTemplate | undefined;
}

/**
 * Registry in-memory simple. Pour MVP, les templates sont chargés au
 * démarrage depuis `apps/api/src/templates/sms/{code}.{lang}.mustache`
 * ou `apps/api/src/templates/sms/{code}.mustache` (fr implicite).
 */
export class InMemorySmsTemplateRegistry implements SmsTemplateRegistry {
  private readonly templates = new Map<string, SmsTemplate>();

  register(template: SmsTemplate): this {
    const lang = template.lang ?? DEFAULT_SMS_LANG;
    this.templates.set(this.key(template.code, lang), { ...template, lang });
    return this;
  }

  get(code: string, lang?: SmsLang): SmsTemplate | undefined {
    const requested = lang ?? DEFAULT_SMS_LANG;
    return (
      this.templates.get(this.key(code, requested)) ??
      this.templates.get(this.key(code, DEFAULT_SMS_LANG))
    );
  }

  private key(code: string, lang: SmsLang): string {
    return `${code}::${lang}`;
  }
}

export function renderTemplate(
  registry: SmsTemplateRegistry,
  code: string,
  data: Readonly<Record<string, unknown>>,
  lang?: SmsLang,
): RenderedSms {
  const template = registry.get(code, lang);
  if (!template) throw new SmsError('template_not_found', `SMS template ${code} non trouvé`);
  const body = template.source.replace(VAR_RE, (_match, name: string) => {
    const value = lookup(data, name);
    if (value === undefined || value === null) {
      throw new SmsError(
        'template_missing_variable',
        `Variable "${name}" manquante pour le template ${code}`,
      );
    }
    return stringifyScalar(value);
  });
  const maxLength = template.maxLength ?? 1600;
  if (body.length > maxLength) {
    throw new SmsError(
      'template_missing_variable',
      `SMS rendu dépasse maxLength (${String(body.length)}/${String(maxLength)} chars)`,
    );
  }
  return {
    templateCode: code,
    lang: template.lang ?? DEFAULT_SMS_LANG,
    body,
  };
}

function lookup(data: Readonly<Record<string, unknown>>, path: string): unknown {
  if (!path.includes('.')) return data[path];
  return path.split('.').reduce<unknown>((acc, segment) => {
    if (acc === null || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[segment];
  }, data);
}

/**
 * Sérialise une valeur scalaire pour interpolation SMS. Refuse
 * objets/arrays (évite `[object Object]` dans les SMS envoyés).
 */
function stringifyScalar(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  throw new SmsError(
    'template_missing_variable',
    `Variable doit être scalaire (got ${typeof value})`,
  );
}
