import { randomUUID } from 'node:crypto';
import type { Result } from '@interim/shared';
import { CircuitOpenError, type CircuitBreaker } from '../reliability/circuit-breaker.js';

/**
 * Erreurs structurées renvoyées par le client MP.
 *
 * - `network`        : timeout, DNS fail, socket reset.
 * - `server_error`   : 5xx — retryable.
 * - `rate_limited`   : 429 — backoff long, ne pas retry immédiatement.
 * - `client_error`   : 4xx (sauf 429) — non retryable, payload invalide.
 * - `circuit_open`   : circuit breaker ouvert (DETTE-029 future).
 * - `cert_invalid`   : mTLS cert expiré ou révoqué (DETTE-025 future).
 */
export type MpErrorKind =
  | 'network'
  | 'server_error'
  | 'rate_limited'
  | 'client_error'
  | 'circuit_open'
  | 'cert_invalid';

export class MpError extends Error {
  constructor(
    public readonly kind: MpErrorKind,
    public readonly status: number | undefined,
    message: string,
    public readonly bodyExcerpt?: string,
  ) {
    super(message);
    this.name = 'MpError';
  }
}

/**
 * Cache idempotency : `OutboundIdempotencyStore`.
 * Stocke `(idempotencyKey → response)` pendant TTL pour rejouer la même réponse.
 */
export interface OutboundIdempotencyStore {
  get(key: string): Promise<{ status: number; body: unknown } | undefined>;
  set(key: string, value: { status: number; body: unknown }): Promise<void>;
}

/**
 * Slot rotation des clés API : courante + précédente (grace 7 jours).
 * Le serveur MP accepte les deux côté Bearer ; côté client, on émet
 * uniquement la `currentKey`.
 */
export interface ApiKeyProvider {
  currentKey(): string;
  /** Renvoyé pour debug / réponse à un challenge MP. */
  previousKey?(): string | undefined;
}

export interface MpClientOptions {
  readonly baseUrl: string;
  readonly apiKey: ApiKeyProvider;
  readonly idempotencyStore: OutboundIdempotencyStore;
  /** Timeout par requête (ms). Default 10s. */
  readonly timeoutMs?: number;
  /** Backoff par défaut. Default [1000, 5000, 15000, 60000, 300000]. */
  readonly retryBackoffMs?: readonly number[];
  /** Override fetch pour tests. */
  readonly fetchFn?: typeof fetch;
  /** Sleep override pour tests (default setTimeout). */
  readonly sleepFn?: (ms: number) => Promise<void>;
  /** Optionnel : circuit breaker partagé pour tous les appels MP. */
  readonly circuitBreaker?: CircuitBreaker;
}

export interface MpRequestOptions {
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  readonly path: string; // ex. `/api/v1/partners/agency-x/workers`
  readonly body?: unknown;
  /** Force une clé d'idempotence (sinon UUID v4 généré). */
  readonly idempotencyKey?: string;
}

const DEFAULT_BACKOFF_MS = [1000, 5000, 15000, 60000, 300000] as const;
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Client HTTP typé pour MovePlanner.
 *
 * Comportement :
 *  1. Idempotency-Key : POST/PUT obtiennent une clé UUID v4 (ou celle fournie),
 *     stockée dans `idempotencyStore`. Rejeu = renvoie réponse cachée sans
 *     refaire l'appel.
 *  2. Bearer auth : header `Authorization: Bearer <currentKey>`.
 *  3. Retry sur erreurs réseau et 5xx, backoff exp [1s, 5s, 15s, 60s, 300s].
 *  4. 429 : pas de retry court, attend uniquement `Retry-After` ou backoff long.
 *  5. 4xx (sauf 429) : pas de retry, renvoie `client_error` immédiatement.
 *
 * mTLS, circuit breaker opossum et métriques Prometheus sont reportés à
 * DETTE-025 / A2.6 / DETTE-026.
 */
export class MpClient {
  private readonly baseUrl: string;
  private readonly apiKey: ApiKeyProvider;
  private readonly idempotencyStore: OutboundIdempotencyStore;
  private readonly timeoutMs: number;
  private readonly retryBackoffMs: readonly number[];
  private readonly fetchFn: typeof fetch;
  private readonly sleepFn: (ms: number) => Promise<void>;
  private readonly circuitBreaker?: CircuitBreaker;

  constructor(opts: MpClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.apiKey = opts.apiKey;
    this.idempotencyStore = opts.idempotencyStore;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retryBackoffMs = opts.retryBackoffMs ?? DEFAULT_BACKOFF_MS;
    this.fetchFn = opts.fetchFn ?? fetch;
    this.sleepFn = opts.sleepFn ?? defaultSleep;
    if (opts.circuitBreaker) this.circuitBreaker = opts.circuitBreaker;
  }

  async request<T>(opts: MpRequestOptions): Promise<Result<T, MpError>> {
    const isMutation = opts.method === 'POST' || opts.method === 'PUT';
    const idempotencyKey = isMutation ? (opts.idempotencyKey ?? randomUUID()) : undefined;

    if (idempotencyKey) {
      const cached = await this.idempotencyStore.get(idempotencyKey);
      if (cached) {
        if (cached.status >= 200 && cached.status < 300) {
          return { ok: true, value: cached.body as T };
        }
        return {
          ok: false,
          error: new MpError(
            classifyStatus(cached.status),
            cached.status,
            `MP cached error ${String(cached.status)}`,
          ),
        };
      }
    }

    let attempt = 0;
    let lastError: MpError | undefined;
    while (attempt <= this.retryBackoffMs.length) {
      const result = await this.executeViaBreaker(opts, idempotencyKey);
      if (result.ok) {
        if (idempotencyKey) {
          await this.idempotencyStore.set(idempotencyKey, {
            status: 200,
            body: result.value,
          });
        }
        return { ok: true, value: result.value as T };
      }

      lastError = result.error;
      // Erreurs non retryables : sortir immédiatement.
      if (
        result.error.kind === 'client_error' ||
        result.error.kind === 'cert_invalid' ||
        result.error.kind === 'circuit_open'
      ) {
        if (idempotencyKey) {
          await this.idempotencyStore.set(idempotencyKey, {
            status: result.error.status ?? 0,
            body: { error: result.error.message },
          });
        }
        return { ok: false, error: result.error };
      }

      // Retry : 5xx, network, 429.
      const backoffIndex = attempt;
      attempt += 1;
      if (backoffIndex >= this.retryBackoffMs.length) break;
      const backoff = this.retryBackoffMs[backoffIndex];
      if (backoff === undefined) break;
      await this.sleepFn(backoff);
    }

    return {
      ok: false,
      error: lastError ?? new MpError('network', undefined, 'unknown failure'),
    };
  }

  private async executeViaBreaker<T>(
    opts: MpRequestOptions,
    idempotencyKey: string | undefined,
  ): Promise<Result<T, MpError>> {
    if (!this.circuitBreaker) {
      return this.doFetch<T>(opts, idempotencyKey);
    }
    try {
      // Le breaker doit "voir" les échecs transients comme des throws
      // pour qu'ils alimentent son err%. On re-throw les `MpError`
      // server_error/network/rate_limited ; les client_error sont
      // renvoyés sans déclencher le breaker (4xx ≠ panne du fournisseur).
      return await this.circuitBreaker.execute(async () => {
        const result = await this.doFetch<T>(opts, idempotencyKey);
        if (
          !result.ok &&
          (result.error.kind === 'server_error' ||
            result.error.kind === 'network' ||
            result.error.kind === 'rate_limited')
        ) {
          throw result.error;
        }
        return result;
      });
    } catch (err) {
      if (err instanceof CircuitOpenError) {
        return {
          ok: false,
          error: new MpError('circuit_open', undefined, err.message),
        };
      }
      if (err instanceof MpError) {
        return { ok: false, error: err };
      }
      throw err;
    }
  }

  private async doFetch<T>(
    opts: MpRequestOptions,
    idempotencyKey: string | undefined,
  ): Promise<Result<T, MpError>> {
    const url = `${this.baseUrl}${opts.path}`;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      authorization: `Bearer ${this.apiKey.currentKey()}`,
    };
    if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      const response = await this.fetchFn(url, {
        method: opts.method,
        headers,
        ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
        signal: controller.signal,
      });
      const text = await response.text();
      const parsed = parseBody(text);
      if (response.status >= 200 && response.status < 300) {
        return { ok: true, value: parsed as T };
      }
      return {
        ok: false,
        error: new MpError(
          classifyStatus(response.status),
          response.status,
          `MP ${opts.method} ${opts.path} → ${String(response.status)}`,
          text.slice(0, 500),
        ),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown';
      return {
        ok: false,
        error: new MpError('network', undefined, `MP fetch failed: ${message}`),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

function classifyStatus(status: number): MpErrorKind {
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server_error';
  if (status >= 400) return 'client_error';
  return 'server_error';
}

function parseBody(text: string): unknown {
  if (text.length === 0) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
