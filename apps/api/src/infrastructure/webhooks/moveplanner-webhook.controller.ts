import { Router, type Request, type Response } from 'express';
import express from 'express';
import { verifyMoveplannerHmac } from './hmac-verifier.js';
import type { WebhookSecretProvider } from './secret-rotation.service.js';

/**
 * Endpoint webhook MovePlanner.
 *
 * **Critique sécurité** : utilise `express.raw()` (PAS `express.json`)
 * pour préserver les bytes exactes du body, sinon la signature HMAC
 * ne pourrait pas être recalculée à l'identique.
 *
 * Le body parsé en JSON intervient APRÈS la vérif HMAC (et seulement
 * si elle passe). Le payload validé est ensuite délégué à un handler
 * (cf. A3.2 — persistance inbound + dispatch via EventBus).
 *
 * Codes :
 *  - 200 OK  : signature valide, payload accepté pour traitement.
 *  - 401     : signature invalide ou timestamp hors fenêtre. Log sécu.
 *  - 413     : body > 256kb (filtré par express.raw limit).
 *  - 415     : Content-Type ≠ application/json.
 *  - 503     : pas de secret configuré (env manquante).
 */

export interface MoveplannerWebhookHandler {
  /**
   * Appelé seulement après vérification HMAC réussie. Reçoit le payload
   * parsé + les headers MP utiles (eventId, timestamp, eventType).
   * Doit être idempotent — l'idempotence par `eventId` est implémentée
   * en A3.2 (persistance inbound).
   */
  handle(input: {
    readonly eventId: string;
    readonly eventType: string;
    readonly timestamp: string;
    readonly payload: unknown;
  }): Promise<void>;
}

export interface WebhookControllerDeps {
  readonly secrets: WebhookSecretProvider;
  readonly handler: MoveplannerWebhookHandler;
  /** Fournit l'instant courant — override pour tests. */
  readonly now?: () => Date;
  /** Override le logger sécu. Default : console.warn. */
  readonly securityLog?: (event: SecurityLogEntry) => void;
}

export interface SecurityLogEntry {
  readonly kind:
    | 'webhook.hmac.invalid'
    | 'webhook.hmac.skew'
    | 'webhook.hmac.malformed'
    | 'webhook.handler.error';
  readonly remoteIp: string | undefined;
  readonly eventId?: string | undefined;
  readonly reason: string;
}

const MAX_BODY_BYTES = 256 * 1024;

export function createMoveplannerWebhookRouter(deps: WebhookControllerDeps): Router {
  const router = Router();
  const now = deps.now ?? ((): Date => new Date());
  const log = deps.securityLog ?? defaultLog;

  // `_health` ne consomme pas de body, expose les versions de secret acceptées.
  router.get('/_health', (_req: Request, res: Response) => {
    let bundle;
    try {
      bundle = deps.secrets.getSecrets();
    } catch {
      res.status(503).json({ status: 'no_secret_configured' });
      return;
    }
    res.status(200).json({
      status: 'ok',
      secretsAccepted: bundle.previous ? ['current', 'previous'] : ['current'],
      tolerance: '±5min',
    });
  });

  // Body parser raw (préserve les bytes pour HMAC) avec limite stricte.
  router.post('/', express.raw({ type: 'application/json', limit: MAX_BODY_BYTES }), (req, res) => {
    void handle(req, res, deps, now, log);
  });

  return router;
}

async function handle(
  req: Request,
  res: Response,
  deps: WebhookControllerDeps,
  now: () => Date,
  log: (event: SecurityLogEntry) => void,
): Promise<void> {
  const remoteIp = req.ip;

  // Body raw → Buffer (express.raw renseigne req.body comme Buffer si
  // Content-Type matche, sinon un Buffer vide ou un objet vide).
  const rawBody: unknown = req.body;
  if (!Buffer.isBuffer(rawBody)) {
    res.status(415).json({ error: 'expected_application_json' });
    return;
  }

  let bundle;
  try {
    bundle = deps.secrets.getSecrets();
  } catch {
    res.status(503).json({ error: 'no_secret_configured' });
    return;
  }

  const result = verifyMoveplannerHmac({
    headers: req.headers,
    rawBody,
    secrets: bundle,
    now: now(),
  });

  if (!result.ok) {
    const eventId = pickHeader(req, 'x-moveplanner-event-id');
    const failureKind = result.failure.kind;
    const securityKind: SecurityLogEntry['kind'] =
      failureKind === 'timestamp_skew_too_large'
        ? 'webhook.hmac.skew'
        : failureKind === 'missing_header' ||
            failureKind === 'invalid_signature_format' ||
            failureKind === 'invalid_timestamp_format'
          ? 'webhook.hmac.malformed'
          : 'webhook.hmac.invalid';
    log({
      kind: securityKind,
      remoteIp,
      eventId,
      reason: failureKind,
    });
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  // HMAC valide → parse JSON et délègue au handler.
  const eventId = pickHeader(req, 'x-moveplanner-event-id') ?? '';
  const eventType = pickHeader(req, 'x-moveplanner-event-type') ?? 'unknown';
  const timestamp = pickHeader(req, 'x-moveplanner-timestamp') ?? '';

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString('utf-8'));
  } catch {
    log({
      kind: 'webhook.hmac.malformed',
      remoteIp,
      eventId,
      reason: 'json_parse_error',
    });
    res.status(400).json({ error: 'invalid_json' });
    return;
  }

  try {
    await deps.handler.handle({ eventId, eventType, timestamp, payload });
    res.status(200).json({ accepted: true });
  } catch (err) {
    log({
      kind: 'webhook.handler.error',
      remoteIp,
      eventId,
      reason: err instanceof Error ? err.message : 'unknown',
    });
    res.status(500).json({ error: 'handler_failed' });
  }
}

function pickHeader(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value[0];
  return value;
}

function defaultLog(event: SecurityLogEntry): void {
  console.warn(
    `[security:${event.kind}] ip=${event.remoteIp ?? 'unknown'} eventId=${event.eventId ?? '-'} reason=${event.reason}`,
  );
}
