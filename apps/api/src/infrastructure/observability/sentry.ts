/**
 * Sentry — capture des événements ouverture/fermeture de circuit breaker
 * et autres anomalies infra.
 *
 * Deux implémentations :
 *  - `ConsoleSentryReporter` : écrit dans `console.warn/error` avec le
 *    préfixe `[sentry:level]`. Utilisé en dev et en test.
 *  - `SdkSentryReporter` : wrap `@sentry/node`. Activé si `SENTRY_DSN`
 *    est défini dans l'env.
 *
 * Helper `createSentryReporter()` choisit automatiquement selon la
 * présence de `SENTRY_DSN` et appelle `Sentry.init` au passage.
 *
 * À appeler tout en haut de `main.ts` :
 *   ```ts
 *   const sentry = createSentryReporter({ release: process.env.VERSION });
 *   ```
 */

import * as Sentry from '@sentry/node';

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
 * Wrap `@sentry/node`. À utiliser après `Sentry.init` (fait par
 * `createSentryReporter`).
 */
export class SdkSentryReporter implements SentryReporter {
  captureMessage(
    message: string,
    level: 'info' | 'warning' | 'error',
    tags?: Record<string, string>,
  ): void {
    Sentry.withScope((scope) => {
      if (tags) scope.setTags(tags);
      scope.setLevel(level);
      Sentry.captureMessage(message, level);
    });
  }

  captureException(err: unknown, tags?: Record<string, string>): void {
    Sentry.withScope((scope) => {
      if (tags) scope.setTags(tags);
      Sentry.captureException(err);
    });
  }
}

/**
 * Initialise Sentry si `SENTRY_DSN` est défini et renvoie le bon
 * reporter. À appeler une seule fois, tout en haut de `main.ts`.
 */
export function createSentryReporter(
  opts: {
    readonly dsn?: string | undefined;
    readonly environment?: string | undefined;
    readonly release?: string | undefined;
    readonly tracesSampleRate?: number | undefined;
  } = {},
): SentryReporter {
  const dsn = opts.dsn ?? process.env.SENTRY_DSN;
  if (!dsn || dsn.length === 0) return new ConsoleSentryReporter();
  Sentry.init({
    dsn,
    environment: opts.environment ?? process.env.NODE_ENV ?? 'dev',
    ...(opts.release !== undefined ? { release: opts.release } : {}),
    tracesSampleRate: opts.tracesSampleRate ?? 0.1,
  });
  return new SdkSentryReporter();
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
