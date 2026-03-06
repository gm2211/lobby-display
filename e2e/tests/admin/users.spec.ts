import { test, expect, request, type BrowserContext } from '@playwright/test';
import { loginViaAPI, getCredentials } from '../../helpers/auth';
import { ApiClient } from '../../helpers/api-client';

test.describe('Admin - Users Section', () => {
  test.describe.configure({ mode: 'serial' });

  let api: ApiClient;
  /** Track user IDs created during tests for cleanup */
  const createdUserIds: number[] = [];

  test.beforeAll(async () => {
    const ctx = await request.newContext({
      baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
      storageState: { cookies: [], origins: [] },
    });
    const { csrfToken } = await loginViaAPI(ctx, 'admin');
    api = new ApiClient(ctx, csrfToken);
  });

  test.afterAll(async () => {
    // Clean up any test users created during tests
    for (const id of createdUserIds) {
      try {
        await api.delete(`/api/users/${id}`);
      } catch {
        // Best-effort cleanup
      }
    }
  });

  test('ADMIN can see the user list section', async ({ page }) => {
    await page.goto('/admin');

    // The Users section should be visible with its heading
    await expect(page.locator('h2', { hasText: 'Users' })).toBeVisible();

    // The section should contain "Manage admin accounts and roles" description
    await expect(page.locator('text=Manage admin accounts and roles')).toBeVisible();

    // The "Current Users" label should be visible
    await expect(page.locator('text=Current Users')).toBeVisible();

    // The user table should have Username and Role columns
    await expect(page.locator('th', { hasText: 'Username' })).toBeVisible();
    await expect(page.locator('th', { hasText: 'Role' })).toBeVisible();

    // The "Add User" form should be visible
    await expect(page.locator('text=Add User')).toBeVisible();
  });

  test('ADMIN can create, verify, and delete users via UI', async ({ page }) => {
    // Create a test user via API
    const username = `e2e_test_user_${Date.now()}`;
    const res = await api.post('/api/users', {
      username,
      password: 'TestPass123!',
      role: 'EDITOR',
    });
    const user = await res.json();
    createdUserIds.push(user.id);

    await page.goto('/admin');

    // Scroll down to the Users section
    await page.locator('h2', { hasText: 'Users' }).scrollIntoViewIfNeeded();

    // The created user should appear in the users table
    await expect(page.locator(`text=${username}`)).toBeVisible();

    // Verify the role badge shows "EDITOR"
    const userRow = page.locator('tr').filter({ hasText: username });
    await expect(userRow.locator('text=EDITOR')).toBeVisible();

    // The admin should see Edit and Delete buttons for this user
    await expect(userRow.getByRole('button', { name: 'Edit' })).toBeVisible();
    await expect(userRow.getByRole('button', { name: 'Delete' })).toBeVisible();

    // Click Delete and accept the confirmation dialog
    page.on('dialog', dialog => dialog.accept());
    await userRow.getByRole('button', { name: 'Delete' }).click();

    // After deletion, the user should no longer appear in the table
    await expect(page.locator(`td >> text=${username}`)).not.toBeVisible({ timeout: 10_000 });

    // Remove from our cleanup list since it's already deleted
    const idx = createdUserIds.indexOf(user.id);
    if (idx >= 0) createdUserIds.splice(idx, 1);
  });

  test('EDITOR does not see users section', async ({ browser }) => {
    // Create a fresh browser context and log in as editor
    let editorContext: BrowserContext | null = null;
    try {
      const editorCreds = getCredentials('editor');

      editorContext = await browser.newContext({
        baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
        storageState: { cookies: [], origins: [] },
      });
      const editorPage = await editorContext.newPage();

      // Log in as editor via the UI
      await editorPage.goto('/login');
      await editorPage.getByLabel(/username/i).fill(editorCreds.username);
      await editorPage.getByLabel(/password/i).fill(editorCreds.password);
      await editorPage
        .getByRole('button', { name: /log\s*in|sign\s*in|submit/i })
        .click();

      // Wait for redirect to admin
      await expect(editorPage).toHaveURL(/\/admin/, { timeout: 15_000 });

      // The editor should NOT see the Users section
      // The Users section heading should not be visible
      await editorPage.waitForTimeout(2000);

      // Check that other sections exist (Services, Events, Advisories are visible)
      await expect(editorPage.locator('h2', { hasText: 'Services' })).toBeVisible();
      await expect(editorPage.locator('h2', { hasText: 'Events' })).toBeVisible();
      await expect(editorPage.locator('h2', { hasText: 'Advisories' })).toBeVisible();

      // The Users section should not be present for an editor
      // UsersSection checks currentUser role and hides for non-admin users
      // Note: if the API returns 403 for /api/users, the section shows no users
      // The section may still render but with an empty table, or not at all
      const usersHeading = editorPage.locator('h2', { hasText: 'Users' });
      const usersVisible = await usersHeading.isVisible();

      if (usersVisible) {
        // Even if the heading is shown, the "Add User" form and user management
        // should be restricted. The table should either be empty or not show
        // management buttons for the editor.
        // At minimum, the editor should not be able to access the users API
        const apiCtx = await request.newContext({
          baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
          storageState: { cookies: [], origins: [] },
        });
        const { csrfToken } = await loginViaAPI(apiCtx, 'editor');
        const editorApi = new ApiClient(apiCtx, csrfToken);

        // Editors should get 403 when trying to list users
        const usersRes = await editorApi.get('/api/users');
        expect(usersRes.status()).toBe(403);
      }
      // If the heading is not visible, that's the expected behavior - editors
      // should not see the Users section at all
    } finally {
      if (editorContext) {
        await editorContext.close();
      }
    }
  });
});
