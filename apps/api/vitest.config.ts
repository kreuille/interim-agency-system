import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
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
      ],
      thresholds: {
        lines: 70,
        branches: 65,
        functions: 70,
        statements: 70,
      },
    },
  },
});
