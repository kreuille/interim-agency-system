import { createApp } from './app.js';
import { getDefaultLogger } from './infrastructure/observability/logger.js';
import { createSentryReporter } from './infrastructure/observability/sentry.js';

const logger = getDefaultLogger();
const port = Number(process.env.PORT ?? 3000);

// Sentry init (no-op si SENTRY_DSN absent — voir `sentry.ts`). Doit être
// appelé tôt pour intercepter les erreurs du bootstrap.
createSentryReporter({
  release: process.env.VERSION,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
});

const app = createApp();

app.listen(port, () => {
  logger.info({ port, version: process.env.VERSION ?? '0.0.0' }, 'api listening');
});
