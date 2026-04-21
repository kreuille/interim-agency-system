import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { currentTenant } from '../context/tenant-context.js';

const IDEMPOTENCY_TTL_HOURS = 24;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface CachedResponse {
  readonly method: string;
  readonly path: string;
  readonly requestHash: string;
  readonly responseStatus: number;
  readonly responseBody: unknown;
  readonly expiresAt: Date;
}

export interface IdempotencyStore {
  find(agencyId: string, key: string): Promise<CachedResponse | null>;
  save(agencyId: string, key: string, entry: CachedResponse): Promise<void>;
}

export interface IdempotencyOptions {
  readonly store: IdempotencyStore;
  readonly now?: () => Date;
  readonly methods?: ReadonlySet<string>;
}

const DEFAULT_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function createIdempotencyMiddleware(options: IdempotencyOptions) {
  const now = options.now ?? (() => new Date());
  const methods = options.methods ?? DEFAULT_METHODS;

  return async function idempotencyMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    if (!methods.has(req.method)) {
      next();
      return;
    }

    const key = req.header('idempotency-key');
    if (!key) {
      next();
      return;
    }

    if (!UUID_V4.test(key)) {
      res.status(400).json({ error: 'idempotency_key_format', message: 'UUID v4 required' });
      return;
    }

    const tenant = currentTenant();
    const requestHash = hashRequest(req.method, req.originalUrl, req.body);

    const existing = await options.store.find(tenant.agencyId, key);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        res.status(422).json({
          error: 'idempotency_key_conflict',
          message: 'Idempotency-Key reused with a different payload',
        });
        return;
      }
      if (existing.expiresAt.getTime() > now().getTime()) {
        res.status(existing.responseStatus).json(existing.responseBody);
        return;
      }
      // expired → fall-through and overwrite on save
    }

    const ttlMs = IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000;
    const expiresAt = new Date(now().getTime() + ttlMs);

    interceptAndStore(res, {
      agencyId: tenant.agencyId,
      key,
      method: req.method,
      path: req.originalUrl,
      requestHash,
      expiresAt,
      store: options.store,
    });

    next();
  };
}

interface InterceptContext {
  readonly agencyId: string;
  readonly key: string;
  readonly method: string;
  readonly path: string;
  readonly requestHash: string;
  readonly expiresAt: Date;
  readonly store: IdempotencyStore;
}

function interceptAndStore(res: Response, ctx: InterceptContext): void {
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    const status = res.statusCode;
    if (status >= 200 && status < 300) {
      void ctx.store.save(ctx.agencyId, ctx.key, {
        method: ctx.method,
        path: ctx.path,
        requestHash: ctx.requestHash,
        responseStatus: status,
        responseBody: body,
        expiresAt: ctx.expiresAt,
      });
    }
    return originalJson(body);
  };
}

function hashRequest(method: string, path: string, body: unknown): string {
  const serialized = serializeBody(body);
  return createHash('sha256').update(`${method}|${path}|${serialized}`).digest('hex');
}

function serializeBody(body: unknown): string {
  if (body === null || body === undefined) return '';
  if (typeof body === 'object') return JSON.stringify(body);
  if (typeof body === 'string') return body;
  if (typeof body === 'number' || typeof body === 'boolean' || typeof body === 'bigint') {
    return String(body);
  }
  return '';
}
