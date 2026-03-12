import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

export default defineConfig({
  ...baseConfig,
  reporter: [
    ['line'],
    // Paths here are resolved from the config directory (`e2e/`).
    ['json', { outputFile: 'spec-eval-results.json' }],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
});
