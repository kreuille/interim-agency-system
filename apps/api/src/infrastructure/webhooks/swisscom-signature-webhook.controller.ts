import { Router, type Request, type Response } from 'express';
import express from 'express';
import { verifySwisscomHmac, type SwisscomHmacSecretBundle } from './swisscom-hmac-verifier.js';

/**
 * Endpoint webhook signature électronique Swisscom Trust Signing
 * Services. Swisscom POST sur `/webhooks/signature/swisscom` quand un
 * envelope change d'état (signed, expired, cancelled).
 *
 * **Sécurité** :
 *   - express.raw (PAS json) pour préserver les bytes pour HMAC
 *   - Vérif HMAC SHA-256 obligatoire avant tout traitement
 *   - Tolérance horloge ±5 min (CLAUDE.md §4)
 *   - 401 sur signature invalide / hors fenêtre → log sécu, pas de retry
 *
 * Le payload validé est délégué à un `SwisscomSignatureWebhookHandler`
 * qui résout `envelopeId → contractId → agencyId` (lookup base) puis
 * appelle `HandleSignatureCallbackUseCase` (cf. application).
 *
 * Codes :
 *   - 200 OK  : signature valide, payload accepté pour traitement.
 *   - 400     : JSON invalide (post-HMAC).
 *   - 401     : signature invalide / timestamp hors fenêtre / header manquant.
 *   - 415     : Content-Type ≠ application/json.
 *   - 503     : pas de secret configuré.
 */

export interface SwisscomSignatureWebhookHandler {
  handle(input: {
    readonly eventId: string;
    readonly eventType: string;
    readonly timestamp: string;
    readonly signature: string;
    readonly secretVersion: 'current' | 'previous';
    readonly payload: unknown;
  }): Promise<void>;
}

export interface SwisscomSignatureSecretProvider {
  getSecrets(): SwisscomHmacSecretBundle;
}

export interface SwisscomSignatureWebhookDeps {
  readonly secrets: SwisscomSignatureSecretProvider;
  readonly handler: SwisscomSignatureWebhookHandler;
  readonly now?: () => Date;
  readonly securityLog?: (event: SwisscomSecurityLogEntry) => void;
}

export interface SwisscomSecurityLogEntry {
  readonly kind:
    | 'webhook.swisscom.hmac.invalid'
    | 'webhook.swisscom.hmac.skew'
    | 'webhook.swisscom.hmac.malformed'
    | 'webhook.swisscom.handler.error';
  readonly remoteIp: string | undefined;
  readonly eventId?: string | undefined;
  readonly reason: string;
}

const MAX_BODY_BYTES = 256 * 1024;

export function createSwisscomSignatureWebhookRouter(deps: SwisscomSignatureWebhookDeps): Router {
  const router = Router();
  const now = deps.now ?? ((): Date => new Date());
  const log = deps.securityLog ?? defaultLog;

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

  router.post('/', express.raw({ type: 'application/json', limit: MAX_BODY_BYTES }), (req, res) => {
    void handle(req, res, deps, now, log);
  });

  return router;
}

async function handle(
  req: Request,
  res: Response,
  deps: SwisscomSignatureWebhookDeps,
  now: () => Date,
  log: (event: SwisscomSecurityLogEntry) => void,
): Promise<void> {
  const remoteIp = req.ip;

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

  const result = verifySwisscomHmac({
    headers: req.headers,
    rawBody,
    secrets: bundle,
    now: now(),
  });

  if (!result.ok) {
    const eventId = pickHeader(req, 'x-swisscom-event-id');
    const failureKind = result.failure.kind;
    const securityKind: SwisscomSecurityLogEntry['kind'] =
      failureKind === 'timestamp_skew_too_large'
        ? 'webhook.swisscom.hmac.skew'
        : failureKind === 'missing_header' ||
            failureKind === 'invalid_signature_format' ||
            failureKind === 'invalid_timestamp_format'
          ? 'webhook.swisscom.hmac.malformed'
          : 'webhook.swisscom.hmac.invalid';
    log({
      kind: securityKind,
      remoteIp,
      eventId,
      reason: failureKind,
    });
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const eventId = pickHeader(req, 'x-swisscom-event-id') ?? '';
  const eventType = pickHeader(req, 'x-swisscom-event-type') ?? 'envelope.updated';
  const timestamp = pickHeader(req, 'x-swisscom-timestamp') ?? '';
  const signature = pickHeader(req, 'x-swisscom-signature') ?? '';

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString('utf-8'));
  } catch {
    log({
      kind: 'webhook.swisscom.hmac.malformed',
      remoteIp,
      eventId,
      reason: 'json_parse_error',
    });
    res.status(400).json({ error: 'invalid_json' });
    return;
  }

  try {
    await deps.handler.handle({
      eventId,
      eventType,
      timestamp,
      signature,
      secretVersion: result.secretVersion,
      payload,
    });
    res.status(200).json({ accepted: true });
  } catch (err) {
    log({
      kind: 'webhook.swisscom.handler.error',
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

function defaultLog(event: SwisscomSecurityLogEntry): void {
  console.warn(
    `[security:${event.kind}] ip=${event.remoteIp ?? 'unknown'} eventId=${event.eventId ?? '-'} reason=${event.reason}`,
  );
}
