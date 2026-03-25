import { test as setup, expect } from '@playwright/test';
import { getCredentials } from './helpers/auth';

setup('authenticate as admin', async ({ page }) => {
  const creds = getCredentials('admin');

  await page.goto('/login');
  await page.locator('#login-user').fill(creds.username);
  await page.locator('#login-pass').fill(creds.password);
  await page.locator('#login-form button[type="submit"]').click();

  // Wait for redirect after login (app redirects to dashboard root)
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });

  // Save signed-in state
  await page.context().storageState({ path: '.auth/admin.json' });
});
