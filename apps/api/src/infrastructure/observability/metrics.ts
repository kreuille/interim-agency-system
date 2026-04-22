import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Registre Prometheus pour l'API.
 *
 * Expose un endpoint `GET /metrics` (cf. `app.ts`) au format text/plain
 * consommé par le scraper Prometheus. Les métriques de process Node
 * (cpu, memory, gc, event loop) sont activées par défaut pour gratter
 * l'observabilité basique sans effort.
 *
 * Conventions OpenMetrics :
 *   - Noms en snake_case
 *   - `_total` suffix pour les counters monotones
 *   - `_seconds` pour les durées
 *   - Labels low-cardinality (pas d'ID utilisateur ou URL brute)
 */

export const metricsRegistry = new Registry();
collectDefaultMetrics({ register: metricsRegistry, prefix: 'interim_api_' });

/**
 * MovePlanner outbound requests (côté `apps/api/src/infrastructure/moveplanner/mp-client.ts`).
 * Labels : endpoint (path templatisé — PAS le path brut avec IDs), method,
 * status code bucketisé (2xx/3xx/4xx/5xx/error).
 */
export const mpRequestTotal = new Counter({
  name: 'mp_request_total',
  help: 'MovePlanner outbound requests counter',
  labelNames: ['endpoint', 'method', 'status'] as const,
  registers: [metricsRegistry],
});

export const mpRequestDurationSeconds = new Histogram({
  name: 'mp_request_duration_seconds',
  help: 'MovePlanner outbound request duration (seconds)',
  labelNames: ['endpoint', 'method', 'status'] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

/**
 * Circuit breaker state gauge : 0=closed, 1=half-open, 2=open.
 * Pas un Counter car c'est un état instantané.
 */
export const mpCbState = new Gauge({
  name: 'mp_cb_state',
  help: 'Circuit breaker state (0=closed, 1=half-open, 2=open)',
  labelNames: ['name'] as const,
  registers: [metricsRegistry],
});

/**
 * Webhook inbound events — ingest rate + processing lag.
 */
export const inboundWebhookReceivedTotal = new Counter({
  name: 'inbound_webhook_received_total',
  help: 'Inbound MovePlanner webhook events received',
  labelNames: ['event_type', 'outcome'] as const, // outcome: accepted|duplicate|rejected
  registers: [metricsRegistry],
});

export const inboundWebhookDispatchDurationSeconds = new Histogram({
  name: 'inbound_webhook_dispatch_duration_seconds',
  help: 'Time from webhook receipt to dispatch completion',
  labelNames: ['event_type', 'outcome'] as const, // outcome: processed|failed|dead
  buckets: [0.05, 0.1, 0.5, 1, 5, 30, 60, 300],
  registers: [metricsRegistry],
});

/**
 * SMS sent counter.
 */
export const smsSentTotal = new Counter({
  name: 'sms_sent_total',
  help: 'SMS sent counter',
  labelNames: ['provider', 'template', 'outcome'] as const, // outcome: sent|failed|opt_out
  registers: [metricsRegistry],
});

/**
 * Bucketise un HTTP status dans ses familles (2xx, 4xx, 5xx, error).
 */
export function statusBucket(status: number | undefined): string {
  if (status === undefined) return 'error';
  if (status >= 500) return '5xx';
  if (status >= 400) return '4xx';
  if (status >= 300) return '3xx';
  if (status >= 200) return '2xx';
  return 'unknown';
}

/**
 * Extrait le template de path d'une URL MP brute (remplace les IDs par `:id`).
 * Utilisé pour éviter l'explosion de cardinalité Prometheus.
 *
 * Ex: `/api/v1/partners/agency-42/workers/staff-7/availability`
 *  → `/api/v1/partners/:partnerId/workers/:staffId/availability`
 */
export function pathTemplate(path: string): string {
  return path
    .replace(/\/partners\/[^/]+/g, '/partners/:partnerId')
    .replace(/\/workers\/[^/]+/g, '/workers/:staffId')
    .replace(/\/assignments\/[^/]+/g, '/assignments/:requestId')
    .replace(/\/timesheets\/[^/]+/g, '/timesheets/:timesheetId');
}

/**
 * Hook `onStateChange` pour `CircuitBreaker` qui pousse l'état dans la
 * gauge Prometheus. À utiliser en complément du hook Sentry.
 */
export function buildCircuitBreakerPrometheusHook(): (event: {
  name: string;
  from: string;
  to: string;
}) => void {
  return (event) => {
    const value = event.to === 'open' ? 2 : event.to === 'half-open' ? 1 : 0;
    mpCbState.set({ name: event.name }, value);
  };
}
