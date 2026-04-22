import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['**/*.integration.test.ts', '**/node_modules/**'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/main.ts',
        'src/app.ts',
        'src/infrastructure/auth/firebase-admin.ts',
        'src/infrastructure/auth/firebase-verifier.ts',
        'src/infrastructure/db/prisma.ts',
        'src/infrastructure/persistence/**',
        'src/infrastructure/audit/**',
        // Adapters infra externes (testés via E2E + intégration en sprint A.6) :
        'src/infrastructure/storage/**',
        'src/infrastructure/antivirus/**',
        'src/infrastructure/queue/**',
        'src/infrastructure/ocr/**',
      ],
      thresholds: {
        lines: 80,
        branches: 70,
        functions: 80,
        statements: 80,
      },
    },
  },
});
