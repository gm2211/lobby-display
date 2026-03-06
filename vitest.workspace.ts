import { defineConfig, defineProject } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  test: {
    projects: [
      defineProject({
        test: {
          name: 'api',
          include: ['tests/api/**/*.test.ts'],
          globals: true,
          globalSetup: './tests/globalSetup.ts',
          setupFiles: ['./tests/setup.ts'],
          testTimeout: 15000,
          hookTimeout: 30000,
          sequence: { concurrent: false },
          fileParallelism: false,
        },
      }),
      defineProject({
        plugins: [react()],
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          globals: true,
          environment: 'jsdom',
          setupFiles: ['./tests/setup-dom.ts'],
        },
      }),
      defineProject({
        plugins: [react()],
        test: {
          name: 'component',
          include: ['tests/component/**/*.test.tsx'],
          globals: true,
          environment: 'jsdom',
          setupFiles: ['./tests/setup-dom.ts'],
        },
      }),
      defineProject({
        test: {
          name: 'models',
          include: ['tests/models/**/*.test.ts'],
          globals: true,
        },
      }),
    ],
  },
});
