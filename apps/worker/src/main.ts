/**
 * Worker entrypoint.
 *
 * Wiring effectif des queues BullMQ :
 * - `document-scan` (A1.2) → `scan-worker.ts`
 * - `availability-sync` (A2.5) → `availability-sync.worker.ts`
 *
 * Ce fichier reste un placeholder tant que le DI Redis + Prisma n'est
 * pas wiré (dépend de A0.6 Firebase + DETTE-014/015 secrets). Voir
 * `apps/api/src/main.ts` pour le pattern à reproduire.
 */
console.log('[worker] placeholder — wire BullMQ queues with Redis once secrets are ready.');
