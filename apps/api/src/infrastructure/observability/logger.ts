import { createHash } from 'node:crypto';
import pino, { type Logger } from 'pino';

/**
 * Logger structuré JSON (pino) pour l'API.
 *
 * Contrats observabilité (`skills/dev/observability/SKILL.md`) :
 * - Sortie JSON Lines sur stdout — Loki via Promtail scrape directement.
 * - **PII redactée** : `authorization`, `iban`, `avs`, `email`, `phone`,
 *   `password`, `token`, `secret` masqués partout (paths génériques + nested).
 * - **Pas de `firstName + lastName`** en clair — utiliser `workerIdHash`
 *   (helper `hashWorkerId`) pour corréler sans exposer.
 * - **Correlation ID** : chaque ligne porte `correlationId` (le request-id
 *   middleware le propage via `req.id`).
 * - Niveau par env : `LOG_LEVEL=debug` en dev/test, `info` en prod.
 *
 * Conventions OpenTelemetry log fields :
 *   - `level` (string) — pino `formatters.level` produit `"info"` au lieu de `30`
 *   - `time` ISO 8601 — `pino.stdTimeFunctions.isoTime`
 *   - `correlationId` — propagé par `requestIdMiddleware`
 */
export function createLogger(
  opts: { readonly level?: string; readonly service?: string } = {},
): Logger {
  return pino({
    level: opts.level ?? process.env.LOG_LEVEL ?? 'info',
    base: { service: opts.service ?? 'api' },
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        // Headers HTTP auth
        'req.headers.authorization',
        'req.headers["x-api-key"]',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        // PII génériques (peu importe la profondeur dans l'objet)
        '*.iban',
        '*.avs',
        '*.email',
        '*.phone',
        '*.password',
        '*.token',
        '*.secret',
        '*.firstName',
        '*.lastName',
        '*.fullName',
        // Body MovePlanner contient parfois des PII
        'mp.body.iban',
        'mp.body.avs',
      ],
      censor: '[REDACTED]',
    },
  });
}

/**
 * Hash SHA-256 tronqué d'un identifiant (worker, mission, etc.) pour
 * pouvoir corréler les lignes de logs sans exposer la valeur en clair.
 *
 * 16 hex chars = 64 bits → suffisant pour corréler sans collision pratique
 * sur la taille du dataset attendu (< 1M workers/missions actifs simultanés).
 */
export function hashWorkerId(workerId: string): string {
  return createHash('sha256').update(workerId).digest('hex').slice(0, 16);
}

/**
 * Logger global (lazy-init pour faciliter les tests qui veulent override
 * via `createLogger`). Préférer l'injection dans les use cases plutôt
 * que cet import direct ; ce singleton n'est utilisé que par le bootstrap
 * `main.ts` et les middlewares HTTP.
 */
let _defaultLogger: Logger | undefined;
export function getDefaultLogger(): Logger {
  _defaultLogger ??= createLogger();
  return _defaultLogger;
}

/** Reset le logger global — uniquement pour les tests. */
export function resetDefaultLogger(): void {
  _defaultLogger = undefined;
}
