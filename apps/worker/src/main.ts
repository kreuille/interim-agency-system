/**
 * Worker entrypoint.
 *
 * Démarre :
 *   1. Le serveur HTTP `/metrics` + `/health` sur port 9090 (DETTE-033)
 *      → scrapé par Prometheus depuis `worker:9090` (cf.
 *      `ops/prometheus/prometheus.yml`).
 *   2. Les BullMQ workers (scan, availability-sync, dr-restore-test,
 *      ged-purge, proposal-reminder, webhook-dispatch).
 *
 * Le wiring effectif Redis + Prisma reste à compléter quand les secrets
 * GCP / Firebase seront posés (DETTE-014, DETTE-015). En attendant, le
 * serveur metrics démarre quand même → /metrics expose les métriques
 * système Node + les business counters (à zéro tant qu'aucun worker
 * n'incrémente).
 */

import { startMetricsServer } from './observability/server.js';
import { workerRegistry } from './observability/business-metrics.js';

const port = Number(process.env.METRICS_PORT ?? 9090);

startMetricsServer({
  port,
  registry: workerRegistry,
});

// Wiring BullMQ workers : à activer quand Redis + Prisma seront prêts.
// Voir `apps/api/src/main.ts` pour le pattern d'injection.
//
// const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
// const prisma = new PrismaClient();
// const metrics = createBusinessMetrics();
//
// createScanWorker({ connection, ... });
// createAvailabilitySyncWorker({ connection, drain, queue, metrics });
// createDrRestoreTestWorker({ connection, onResult: (r) => metrics.recordDrRestoreTest(...) });
// createGedPurgeWorker({ connection, useCase, onResult: ... });
//

console.log(`[worker] metrics server up on :${String(port)} ; BullMQ wiring pending DETTE-014/015`);
