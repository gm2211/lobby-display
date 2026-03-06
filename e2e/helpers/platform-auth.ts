import type { Page, APIRequestContext } from '@playwright/test';
import { loginViaAPI } from './auth';
import { ApiClient } from './api-client';

/**
 * Login as a platform user (admin role) via the UI and navigate to /platform.
 *
 * Use this helper in browser tests that need a fully authenticated platform
 * session with the platform shell visible.
 *
 * @param page - Playwright Page instance
 * @param role  - Which credential set to use (defaults to 'admin')
 */
export async function loginAndGoToPlatform(
  page: Page,
  role: 'admin' | 'editor' | 'viewer' = 'admin',
): Promise<void> {
  const prefix = `E2E_${role.toUpperCase()}`;
  const username = process.env[`${prefix}_USER`];
  const password = process.env[`${prefix}_PASS`];

  if (!username || !password) {
    throw new Error(
      `Missing credentials for ${role}. Set ${prefix}_USER and ${prefix}_PASS env vars.`,
    );
  }

  await page.goto('/login');
  await page.getByLabel(/username/i).fill(username);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /log\s*in|sign\s*in|submit/i }).click();

  // Wait until redirected away from /login (the app may redirect to /admin or /platform)
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });

  // Navigate explicitly to /platform
  await page.goto('/platform', { waitUntil: 'domcontentloaded' });
}

/**
 * Create an API client authenticated as a platform user.
 *
 * Use this in API-level platform tests that need an authenticated request
 * context without a browser.
 *
 * @param request - Playwright APIRequestContext
 * @param role    - Which credential set to use (defaults to 'admin')
 */
export async function createPlatformApiClient(
  request: APIRequestContext,
  role: 'admin' | 'editor' | 'viewer' = 'admin',
): Promise<ApiClient> {
  const { csrfToken } = await loginViaAPI(request, role);
  return new ApiClient(request, csrfToken);
}
