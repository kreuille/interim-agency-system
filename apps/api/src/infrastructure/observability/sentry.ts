/**
 * Sentry — capture des événements ouverture/fermeture de circuit breaker
 * et autres anomalies infra.
 *
 * **Stub MVP** : pas de SDK installé pour garder le bundle léger. Les
 * événements partent dans `console.warn` avec préfixe `[sentry]`. Quand
 * `SENTRY_DSN` est configuré (DETTE-032), remplacer le corps des fonctions
 * par `Sentry.captureMessage / Sentry.captureException` (`@sentry/node`).
 *
 * Wiring prévu dans `apps/api/src/main.ts` après bootstrap Express :
 *   ```ts
 *   import * as Sentry from '@sentry/node';
 *   Sentry.init({ dsn: process.env.SENTRY_DSN, environment: 'prod' });
 *   ```
 */

export interface SentryReporter {
  captureMessage(
    message: string,
    level: 'info' | 'warning' | 'error',
    tags?: Record<string, string>,
  ): void;
  captureException(err: unknown, tags?: Record<string, string>): void;
}

export class ConsoleSentryReporter implements SentryReporter {
  captureMessage(
    message: string,
    level: 'info' | 'warning' | 'error',
    tags?: Record<string, string>,
  ): void {
    const tagsStr = tags ? ` ${JSON.stringify(tags)}` : '';
    console.warn(`[sentry:${level}] ${message}${tagsStr}`);
  }

  captureException(err: unknown, tags?: Record<string, string>): void {
    const message = err instanceof Error ? err.message : String(err);
    const tagsStr = tags ? ` ${JSON.stringify(tags)}` : '';
    console.error(`[sentry:exception] ${message}${tagsStr}`);
  }
}

/**
 * Helper : crée un `onStateChange` pour `CircuitBreaker` qui reporte à
 * Sentry. À utiliser au wiring du `MpClient` pour observer les
 * ouvertures/fermetures de breaker.
 */
export function buildCircuitBreakerSentryHook(
  reporter: SentryReporter,
): (event: { name: string; from: string; to: string }) => void {
  return (event) => {
    if (event.to === 'open') {
      reporter.captureMessage(`Circuit breaker '${event.name}' opened`, 'error', {
        circuit: event.name,
        from: event.from,
        to: event.to,
      });
    } else if (event.to === 'closed' && event.from !== 'closed') {
      reporter.captureMessage(`Circuit breaker '${event.name}' recovered`, 'info', {
        circuit: event.name,
        from: event.from,
        to: event.to,
      });
    }
  };
}
