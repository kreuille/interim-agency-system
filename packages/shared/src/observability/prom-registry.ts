import { createHash } from 'node:crypto';
import { collectDefaultMetrics, Registry } from 'prom-client';

/**
 * Helpers Prometheus partagés entre `apps/api` et `apps/worker`.
 *
 * Conformité (CLAUDE.md §3.4 + skill `dev/observability`) :
 * - **PII hygiene** : aucun label `worker_id`, `staff_id`, `iban`, `avs`,
 *   `email`, `phone`. `agency_id` doit toujours être hashé via
 *   `hashAgencyId()`. Les labels high-cardinality sont bannis (jamais
 *   `request_id`, `timestamp`, `user_agent`).
 * - **Conventions OpenMetrics** :
 *   - Noms en `snake_case`, suffixe `_total` pour les counters monotones,
 *     `_seconds` pour les durées, `_bytes` pour les tailles.
 *   - Préfixe `interim_` pour les métriques globales process Node ;
 *     pas de préfixe pour les métriques métier (la convention par
 *     domaine `payroll_*`, `availability_*`, `mp_*` suffit).
 *
 * Architecture : un seul `Registry` par process. L'app expose le
 * registre via un endpoint HTTP `/metrics` (text/plain; version=0.0.4).
 * Voir `apps/worker/src/observability/server.ts` côté worker.
 */

/**
 * Hash SHA-256 tronqué d'un identifiant d'agence (UUID) pour pouvoir
 * corréler les séries Prometheus par tenant sans exposer l'ID en clair
 * (nLPD : ne pas faciliter le ciblage à partir des séries publiques).
 *
 * 12 hex chars = 48 bits → suffisant pour distinguer les agences (collision
 * pratique impossible jusqu'à ~16M agences distinctes — 2^24 par anniversaire).
 *
 * Pourquoi 12 et pas 16 (comme `hashWorkerId`) : les workers sont
 * potentiellement plus nombreux que les agences (millions vs centaines),
 * d'où la tolérance 64 bits côté workers et 48 bits côté agences.
 */
export function hashAgencyId(agencyId: string): string {
  return createHash('sha256').update(agencyId).digest('hex').slice(0, 12);
}

/**
 * Liste des labels **interdits** comme labels Prometheus (PII ou
 * high-cardinality dangereux). À auditer en code review et via le test
 * `validateLabelHygiene` ci-dessous.
 */
export const FORBIDDEN_LABELS = [
  'agency_id', // doit être hashé
  'worker_id',
  'staff_id',
  'iban',
  'avs',
  'email',
  'phone',
  'firstname',
  'first_name',
  'lastname',
  'last_name',
  'full_name',
  'request_id',
  'correlation_id',
  'timestamp',
  'user_agent',
  'authorization',
  'token',
] as const;

export type ForbiddenLabel = (typeof FORBIDDEN_LABELS)[number];

/**
 * Vérifie qu'aucun label déclaré n'est dans la liste interdite. Utilisé
 * comme garde-fou en test et en code review (lever l'erreur tôt plutôt
 * que de découvrir une fuite PII en prod via `curl /metrics`).
 *
 * @returns liste des labels interdits trouvés (vide = OK)
 */
export function validateLabelHygiene(labelNames: readonly string[]): readonly ForbiddenLabel[] {
  const lower = labelNames.map((l) => l.toLowerCase());
  return FORBIDDEN_LABELS.filter((bad) => lower.includes(bad));
}

/**
 * Erreur jetée par `assertLabelHygiene` — utilisée en bootstrap pour
 * fail-fast si un développeur a déclaré un label PII par erreur.
 */
export class ForbiddenLabelError extends Error {
  constructor(
    public readonly metricName: string,
    public readonly forbiddenLabels: readonly ForbiddenLabel[],
  ) {
    super(
      `Métrique "${metricName}" déclare des labels interdits : ${forbiddenLabels.join(', ')}. ` +
        `Voir packages/shared/src/observability/prom-registry.ts § FORBIDDEN_LABELS pour la liste.`,
    );
    this.name = 'ForbiddenLabelError';
  }
}

/**
 * Variante "throw" de `validateLabelHygiene` — appelée à l'instanciation
 * d'un counter/gauge/histogram pour fail-fast.
 */
export function assertLabelHygiene(metricName: string, labelNames: readonly string[]): void {
  const forbidden = validateLabelHygiene(labelNames);
  if (forbidden.length > 0) {
    throw new ForbiddenLabelError(metricName, forbidden);
  }
}

/**
 * Crée un nouveau registre Prometheus avec les métriques système
 * Node.js (cpu, memory, gc, event loop) auto-collectées sous le prefix
 * `interim_<service>_`.
 *
 * Le `service` label est posé sur toutes les métriques (différencie
 * `api` / `worker` / etc.).
 */
export function createPromRegistry(opts: {
  readonly service: 'api' | 'worker';
  readonly enableDefaultMetrics?: boolean;
}): Registry {
  const registry = new Registry();
  registry.setDefaultLabels({ service: opts.service });
  if (opts.enableDefaultMetrics !== false) {
    collectDefaultMetrics({
      register: registry,
      prefix: `interim_${opts.service}_`,
    });
  }
  return registry;
}
