import { SpanStatusCode, trace, type Span, type Tracer } from '@opentelemetry/api';

/**
 * OpenTelemetry tracing abstraction.
 *
 * Ne wire PAS d'exporter (pas de `@opentelemetry/sdk-node`) — c'est la
 * responsabilité de `main.ts` si `OTEL_EXPORTER_OTLP_ENDPOINT` est
 * configuré (DETTE-027 finalisée côté infra). Sans exporter, `trace.getTracer`
 * renvoie un tracer no-op qui ne produit aucun span (conformément à la
 * spec OTel API).
 *
 * Ce module fournit juste l'instrumentation applicative : spans autour
 * des appels MP, avec attributs standards semconv.
 */

const TRACER_NAME = '@interim/api';
const TRACER_VERSION = '0.0.0';

export function getTracer(): Tracer {
  return trace.getTracer(TRACER_NAME, TRACER_VERSION);
}

export interface MpSpanAttributes {
  readonly endpoint: string; // path templatisé (cf. `pathTemplate`)
  readonly method: string;
  readonly retryAttempt?: number;
}

/**
 * Exécute `fn` dans un span nommé `mp.<method> <endpoint>`. Ajoute les
 * attributs semconv HTTP client. Capture l'exception si thrown et met
 * le status=error ; sinon OK si résultat positif.
 *
 * La signature `Result<T, E>` est également supportée (notre convention
 * domain) : si result.ok=false, on met status=error avec l'error message.
 */
export async function traceMpCall<T>(
  attrs: MpSpanAttributes,
  fn: () => Promise<T>,
  interpretResult?: (value: T) => { ok: boolean; status?: number; errorKind?: string },
): Promise<T> {
  const tracer = getTracer();
  return tracer.startActiveSpan(
    `mp.${attrs.method} ${attrs.endpoint}`,
    {
      attributes: {
        'http.request.method': attrs.method,
        'http.route': attrs.endpoint,
        'server.name': 'moveplanner',
        ...(attrs.retryAttempt !== undefined ? { 'mp.retry_attempt': attrs.retryAttempt } : {}),
      },
    },
    async (span: Span) => {
      try {
        const value = await fn();
        if (interpretResult) {
          const interp = interpretResult(value);
          if (interp.status !== undefined) {
            span.setAttribute('http.response.status_code', interp.status);
          }
          if (!interp.ok) {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: interp.errorKind ?? 'error',
            });
          }
        }
        return value;
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: err instanceof Error ? err.message : 'unknown',
        });
        throw err;
      } finally {
        span.end();
      }
    },
  );
}
