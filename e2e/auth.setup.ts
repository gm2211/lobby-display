import { test as setup, expect } from '@playwright/test';
import { getCredentials } from './helpers/auth';

setup('authenticate as admin', async ({ page }) => {
  const creds = getCredentials('admin');

  await page.goto('/login');
  await page.getByLabel(/username/i).fill(creds.username);
  await page.getByLabel(/password/i).fill(creds.password);
  await page.getByRole('button', { name: /log\s*in|sign\s*in|submit/i }).click();

  // Wait for redirect to admin
  await expect(page).toHaveURL(/\/admin/, { timeout: 15_000 });

  // Save signed-in state
  await page.context().storageState({ path: '.auth/admin.json' });
});
