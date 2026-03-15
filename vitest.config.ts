import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  test: {
    globals: true,
    globalSetup: ['./tests/globalSetup.ts'],
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 15000,
    hookTimeout: 30000,
    // Run test files sequentially since they share a DB
    sequence: { concurrent: false },
    fileParallelism: false,
    // Unit tests don't need DB setup
    exclude: ['**/node_modules/**'],
    projects: [
      {
        test: {
          name: 'unit',
          globals: true,
          include: [
            'tests/unit/**/*.test.ts',
          ],
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'component',
          globals: true,
          include: ['tests/component/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['./tests/setup-dom.ts'],
        },
      },
      {
        test: {
          name: 'models',
          globals: true,
          include: ['tests/models/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'harness',
          globals: true,
          include: ['tests/harness/**/*.test.ts'],
          testTimeout: 30000,
        },
      },
      {
        test: {
          name: 'hooks',
          globals: true,
          include: ['tests/hooks/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'api',
          globals: true,
          include: ['tests/api/**/*.test.ts'],
          globalSetup: ['./tests/globalSetup.ts'],
          setupFiles: ['./tests/setup.ts'],
          testTimeout: 15000,
          hookTimeout: 30000,
          sequence: { concurrent: false },
          fileParallelism: false,
          env: {
            DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/lobby_test',
          },
        },
      },
    ],
  },
});
