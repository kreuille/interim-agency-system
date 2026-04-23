import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

/**
 * Middleware `X-Request-Id` / `X-Correlation-Id`.
 *
 * Pose un identifiant de corrélation unique par requête, accessible via
 * `req.id` (la propriété est aussi déclarée par `pino-http` qui partage
 * la même augmentation `Request.id: ReqId`), propagé dans le header
 * `X-Request-Id` côté réponse, et utilisé par le logger pino pour
 * corréler toutes les lignes émises pendant le traitement de la requête
 * (cf. `skills/dev/observability/SKILL.md`).
 *
 * Si le client fournit déjà un `X-Request-Id` (ex: gateway en amont,
 * scénario de chaîne), on le respecte ; sinon on génère un UUIDv4.
 */

const HEADER_NAMES = ['x-request-id', 'x-correlation-id'] as const;

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  let id: string | undefined;
  for (const name of HEADER_NAMES) {
    const header = req.headers[name];
    if (typeof header === 'string' && header.length > 0 && header.length <= 128) {
      id = header;
      break;
    }
  }
  id ??= randomUUID();
  // pino-http augmente Request avec `id: ReqId` (= string | number | object).
  // L'assignation est sûre car notre id est toujours un string.
  (req as Request & { id: string }).id = id;
  res.setHeader('x-request-id', id);
  next();
}
