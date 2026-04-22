import { defineConfig } from 'vitest/config';

/**
 * Config dédiée aux tests d'intégration (Testcontainers Postgres réel).
 * Séparée du `vitest.config.ts` standard car :
 * - démarrage Postgres lent (~10–20s) → testTimeout étendu
 * - exécution séquentielle → évite contention sur le container
 * - n'est pas dans le run par défaut (`pnpm test`) ; lancée par `pnpm test:integration`
 *   ou par CI dans un job dédié.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 60_000,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
