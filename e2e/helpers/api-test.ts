import { test as base, expect } from '@playwright/test';
import { getCsrfToken } from './auth';
import { ApiClient } from './api-client';
import { TestDataManager } from './test-data';

/**
 * Custom Playwright fixtures for API tests.
 *
 * Provides per-test `api` and `data` instances that are properly scoped
 * (Playwright does not allow reusing fixtures from beforeAll in tests).
 */
export const test = base.extend<{ api: ApiClient; data: TestDataManager }>({
  api: async ({ request }, use) => {
    const csrfToken = await getCsrfToken(request);
    await use(new ApiClient(request, csrfToken));
  },
  data: async ({ api }, use) => {
    const data = new TestDataManager(api);
    await use(data);
    await data.cleanup();
  },
});

export { expect };
