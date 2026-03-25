import { test, expect } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

test.describe('Smoke / Health checks', () => {
  test('GET /api/health returns { status: "ok" }', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok' });
  });

  test('Dashboard "/" loads without errors', async ({ page }) => {
    await page.goto('/');
    // The dashboard page renders a header with the building title and a service table
    await expect(page.locator('.dashboard-page')).toBeVisible();
    // Header should contain a heading (configurable title, but always an h1)
    await expect(page.locator('.header-row h1')).toBeVisible();
  });

  test('Login "/login" renders a form with username and password fields', async ({ browser }) => {
    // Use a fresh context without stored auth so we actually see the login form
    // (authenticated users get redirected away from /login)
    const ctx = await browser.newContext({ baseURL: BASE_URL, storageState: { cookies: [], origins: [] } });
    const freshPage = await ctx.newPage();
    try {
      await freshPage.goto('/login');
      await expect(freshPage.locator('#login-user')).toBeVisible();
      await expect(freshPage.locator('#login-pass')).toBeVisible();
      await expect(freshPage.locator('#login-form button[type="submit"]')).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test('Admin "/admin" loads for authenticated user', async ({ page }) => {
    await page.goto('/admin');
    // Admin page should show the admin header with title
    await expect(page.locator('.admin-header')).toBeVisible();
    // The heading should contain "Admin" (use the h1 in the admin-header)
    await expect(page.locator('.admin-header h1')).toBeVisible();
    // Should have the Publish button
    await expect(page.getByRole('button', { name: /publish/i })).toBeVisible();
  });
});
