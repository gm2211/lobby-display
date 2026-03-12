import { defineConfig, devices } from '@playwright/test';

const IS_CI = !!process.env.CI;
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

export default defineConfig({
  testDir: '.',
  outputDir: './test-results',
  fullyParallel: false,
  forbidOnly: IS_CI,
  retries: IS_CI ? 2 : 0,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },

  reporter: IS_CI
    ? [
        ['html', { open: 'never', outputFolder: 'playwright-report' }],
        ['json', { outputFile: 'test-results.json' }],
        ['github'],
      ]
    : [['html', { open: 'on-failure', outputFolder: 'playwright-report' }]],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: IS_CI ? 'on-first-retry' : 'off',
    navigationTimeout: 60_000,
    actionTimeout: 15_000,
  },

  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',

  projects: [
    {
      name: 'auth-setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'api',
      testMatch: /tests\/api\/.+\.spec\.ts/,
      use: { storageState: '.auth/admin.json' },
      dependencies: ['auth-setup'],
    },
    {
      name: 'chromium',
      testMatch: /tests\/(?!api\/).+\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/admin.json',
      },
      dependencies: ['auth-setup'],
    },
  ],
});
