import { test, expect } from '@playwright/test';
import { getCredentials } from '../helpers/auth';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

test.describe('Authentication', () => {
  test('Valid login redirects away from /login', async ({ browser }) => {
    // Use a fresh context so we start unauthenticated
    const ctx = await browser.newContext({ baseURL: BASE_URL, storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    try {
      const creds = getCredentials('admin');

      await page.goto('/login');
      await page.locator('#login-user').fill(creds.username);
      await page.locator('#login-pass').fill(creds.password);
      await page.locator('#login-form button[type="submit"]').click();

      await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
    } finally {
      await ctx.close();
    }
  });

  test('Invalid credentials show error message', async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: BASE_URL, storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    try {
      await page.goto('/login');
      await page.locator('#login-user').fill('nonexistent_user_xyz');
      await page.locator('#login-pass').fill('wrongpassword123');
      await page.locator('#login-form button[type="submit"]').click();

      // The error message should appear on screen
      await expect(page.getByText(/invalid|failed|incorrect|error/i)).toBeVisible({
        timeout: 10_000,
      });
      // Should stay on the login page
      await expect(page).toHaveURL(/\/login/);
    } finally {
      await ctx.close();
    }
  });

  test('Empty fields show validation error or prevent submission', async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: BASE_URL, storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    try {
      await page.goto('/login');

      // Both fields are marked "required" in the HTML, so clicking submit with
      // empty fields should either show native validation or a custom error.
      const usernameInput = page.locator('#login-user');
      const passwordInput = page.locator('#login-pass');

      // Ensure fields are empty
      await usernameInput.clear();
      await passwordInput.clear();

      await page.locator('#login-form button[type="submit"]').click();

      // The form should not navigate away -- still on /login
      await expect(page).toHaveURL(/\/login/);

      // Check that the username field has the 'required' attribute (browser validation)
      await expect(usernameInput).toHaveAttribute('required', '');
    } finally {
      await ctx.close();
    }
  });

  test('Logout clears session and redirects to /login', async ({ browser }) => {
    // Use a FRESH context so logging out doesn't destroy the shared storageState session
    const ctx = await browser.newContext({ baseURL: BASE_URL, storageState: { cookies: [], origins: [] } });
    const freshPage = await ctx.newPage();
    try {
      const creds = getCredentials('admin');

      // Log in with a fresh session
      await freshPage.goto('/login');
      await freshPage.locator('#login-user').fill(creds.username);
      await freshPage.locator('#login-pass').fill(creds.password);
      await freshPage.locator('#login-form button[type="submit"]').click();
      await expect(freshPage).not.toHaveURL(/\/login/, { timeout: 15_000 });
      await expect(freshPage.locator('.admin-header')).toBeVisible();

      // Click the Logout button
      await freshPage.getByRole('button', { name: /logout/i }).click();

      // Should redirect to the login page
      await expect(freshPage).toHaveURL(/\/login/, { timeout: 10_000 });
    } finally {
      await ctx.close();
    }
  });

  test('/admin without auth redirects to /login', async ({ browser }) => {
    // Create a fresh context with NO storageState (unauthenticated)
    const ctx = await browser.newContext({ baseURL: BASE_URL, storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    try {
      await page.goto('/admin');

      // ProtectedRoute should redirect to /login
      await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    } finally {
      await ctx.close();
    }
  });

  test('GET /api/auth/me returns user object when authenticated', async ({ request }) => {
    // The request context already has admin storageState from config
    const res = await request.get('/api/auth/me');
    expect(res.ok()).toBe(true);

    const body = await res.json();
    expect(body).toBeTruthy();
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('username');
    expect(body).toHaveProperty('role');
    expect(typeof body.username).toBe('string');
  });

  test('GET /api/auth/csrf returns a token', async ({ request }) => {
    const res = await request.get('/api/auth/csrf');
    expect(res.ok()).toBe(true);

    const body = await res.json();
    expect(body).toHaveProperty('token');
    expect(typeof body.token).toBe('string');
    expect(body.token.length).toBeGreaterThan(0);
  });
});
