import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Registry } from 'prom-client';

/**
 * Serveur HTTP léger pour exposer Prometheus `/metrics` côté worker
 * (DETTE-033). Pas de framework — juste `node:http` natif pour réduire
 * la surface (pas d'auth, pas de routing complexe, juste 2 endpoints).
 *
 * Routes :
 *   - `GET /metrics`  → text/plain; version=0.0.4; charset=utf-8 (OpenMetrics)
 *   - `GET /health`   → 200 {status:ok}
 *   - tout le reste   → 404
 *
 * Le port par défaut 9090 matche `ops/prometheus/prometheus.yml` qui scrape
 * `worker:9090` dans le compose `interim_default` network.
 *
 * Sécurité : le port n'est PAS exposé publiquement en prod (réseau privé
 * GCP / pod-interne K8s). Pas d'auth requise sur ce scope.
 */

export interface MetricsServerOptions {
  readonly port?: number;
  readonly registry: Registry;
  /**
   * Hook optionnel pour augmenter les métriques à chaud avant scraping
   * (ex. requêter la DB pour les gauges `availability_outbox_*`).
   * Attendu : retourne une promise qui complète avant que `/metrics`
   * réponde. Erreurs swallowées + logged → ne JAMAIS faire échouer le
   * scrape (Prometheus retry sinon, et on perd l'observabilité).
   */
  readonly onScrape?: () => Promise<void>;
  readonly logger?: {
    info(msg: string, ctx?: Record<string, unknown>): void;
    error(msg: string, ctx?: Record<string, unknown>): void;
  };
}

export function startMetricsServer(opts: MetricsServerOptions): Server {
  const port = opts.port ?? 9090;
  const log = opts.logger ?? consoleLogger();

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    handleRequest(req, res, opts).catch((err: unknown) => {
      log.error('metrics-server request crashed', {
        url: req.url,
        error: err instanceof Error ? err.message : String(err),
      });
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'text/plain' });
        res.end('internal_error');
      }
    });
  });

  server.listen(port, () => {
    log.info('metrics-server listening', { port });
  });

  return server;
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: MetricsServerOptions,
): Promise<void> {
  const url = req.url ?? '/';
  if (req.method !== 'GET') {
    res.writeHead(405, { 'content-type': 'text/plain' });
    res.end('method_not_allowed');
    return;
  }

  if (url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (url === '/metrics') {
    if (opts.onScrape) {
      try {
        await opts.onScrape();
      } catch (err) {
        // Logger mais NE PAS échouer le scrape — Prometheus
        // continuerait à retry et on perdrait des séries.
        opts.logger?.error('onScrape hook failed (continuing)', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    const body = await opts.registry.metrics();
    res.writeHead(200, { 'content-type': opts.registry.contentType });
    res.end(body);
    return;
  }

  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not_found');
}

function consoleLogger(): NonNullable<MetricsServerOptions['logger']> {
  return {
    info(msg, ctx) {
      console.log(`[metrics-server] ${msg}`, ctx ?? {});
    },
    error(msg, ctx) {
      console.error(`[metrics-server] ${msg}`, ctx ?? {});
    },
  };
}
