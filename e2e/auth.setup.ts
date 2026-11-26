import { test as setup, expect } from '@playwright/test';
import { getCredentials } from './helpers/auth';

setup('authenticate as admin', async ({ page }) => {
  const creds = getCredentials('admin');

  await page.goto('/login');
  await page.locator('#login-user').fill(creds.username);
  await page.locator('#login-pass').fill(creds.password);
  await page.locator('#login-form button[type="submit"]').click();

  // Wait for redirect after login (app redirects to dashboard root). If the server
  // rejects the login, fail with its message instead of a bare URL timeout.
  const loginError = page.locator('#login-error');
  const outcome = await Promise.race([
    page
      .waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 })
      .then(() => 'ok', () => 'timeout'),
    loginError.waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'rejected', () => 'timeout'),
  ]);
  if (outcome === 'rejected') {
    throw new Error(
      `Admin login was rejected by the server: "${await loginError.textContent()}". ` +
        'Check that the E2E_ADMIN_USER / E2E_ADMIN_PASS secrets match a user on staging.',
    );
  }
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });

  // Save signed-in state
  await page.context().storageState({ path: '.auth/admin.json' });
});
