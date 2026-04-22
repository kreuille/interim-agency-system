import type { NextFunction, Request, Response } from 'express';

/**
 * Rate limiter IP pour l'endpoint webhook MP.
 *
 * Par défaut : 1000 req/min (spec MP §7) avec fenêtre fixe en mémoire.
 * Suffisant pour une seule instance de pod ; pour multi-instance,
 * migrer vers Redis (DETTE-040 existe déjà pour le rate limiter SMS ;
 * cette couche suivra).
 *
 * Allowlist IPs : optionnelle. Si définie, seules les IPs de la liste
 * peuvent poster. Permet de restreindre aux plages Swiss de MP côté
 * réseau. Sans allowlist, le rate limit s'applique partout.
 *
 * Exemptions : aucune IP, aucun path. Appliquer le middleware au router
 * webhook uniquement (pas sur /api/v1).
 */

export interface WebhookIpRateLimitOptions {
  readonly requestsPerMinute?: number;
  readonly allowlist?: readonly string[];
  readonly now?: () => number;
  /** Hook log sécu pour IP refusée (allowlist) ou dépassée (rate). */
  readonly onDenied?: (event: DeniedEvent) => void;
}

export interface DeniedEvent {
  readonly kind: 'not_in_allowlist' | 'rate_limited';
  readonly ip: string;
  readonly countInWindow?: number;
}

interface Bucket {
  count: number;
  windowStartMs: number;
}

const DEFAULT_RPM = 1000;

export function createWebhookIpRateLimitMiddleware(
  opts: WebhookIpRateLimitOptions = {},
): (req: Request, res: Response, next: NextFunction) => void {
  const rpm = opts.requestsPerMinute ?? DEFAULT_RPM;
  const allowlist = opts.allowlist ? new Set(opts.allowlist) : undefined;
  const now = opts.now ?? ((): number => Date.now());
  const onDenied = opts.onDenied ?? defaultDeniedLog;

  // Bucket par IP, fenêtre 60s.
  const buckets = new Map<string, Bucket>();

  return function middleware(req: Request, res: Response, next: NextFunction): void {
    const ip = req.ip ?? 'unknown';

    if (allowlist && !allowlist.has(ip)) {
      onDenied({ kind: 'not_in_allowlist', ip });
      res.status(403).json({ error: 'ip_not_allowed' });
      return;
    }

    const nowMs = now();
    const bucket = buckets.get(ip);
    if (!bucket || nowMs - bucket.windowStartMs >= 60_000) {
      buckets.set(ip, { count: 1, windowStartMs: nowMs });
      next();
      return;
    }
    bucket.count += 1;
    if (bucket.count > rpm) {
      onDenied({ kind: 'rate_limited', ip, countInWindow: bucket.count });
      const retrySeconds = Math.ceil((bucket.windowStartMs + 60_000 - nowMs) / 1000);
      res.set('retry-after', String(retrySeconds));
      res.status(429).json({ error: 'rate_limited', retryAfterSeconds: retrySeconds });
      return;
    }
    next();
  };
}

function defaultDeniedLog(event: DeniedEvent): void {
  console.warn(
    `[security:webhook.ip.${event.kind}] ip=${event.ip} count=${String(event.countInWindow ?? '-')}`,
  );
}
