import { test, expect } from '@playwright/test';
import { PlatformPage } from '../../helpers/platform-page';

/**
 * Platform shell smoke tests.
 *
 * These tests verify that the platform frontend shell loads correctly:
 * - A logged-in user can reach /platform
 * - The sidebar navigation is rendered and visible
 * - At least one nav item exists in the sidebar
 *
 * These tests run against a live server (local or staging) using the admin
 * credentials stored in `.auth/admin.json` (set up by `auth.setup.ts`).
 *
 * The `chromium` project in playwright.config.ts picks up these tests
 * (matches `tests/(?!api\/).+\.spec\.ts`) and provides the admin storage state.
 */
test.describe('Platform shell — smoke', () => {
  test('Logged-in user can navigate to /platform', async ({ page }) => {
    // The storageState for the chromium project provides admin auth.
    // Navigate directly — no need to log in manually.
    await page.goto('/platform', { waitUntil: 'domcontentloaded' });

    // Must NOT be redirected to /login — the platform shell should render.
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });

    // The URL should be (or contain) /platform
    expect(page.url()).toContain('/platform');
  });

  test('Platform sidebar is visible', async ({ page }) => {
    await page.goto('/platform', { waitUntil: 'domcontentloaded' });

    // Wait for the app to hydrate
    await page.waitForTimeout(1_500);

    const platformPage = new PlatformPage(page);
    const sidebarVisible = await platformPage.isSidebarVisible();

    expect(sidebarVisible).toBe(true);
  });

  test('Platform sidebar has at least one nav item', async ({ page }) => {
    await page.goto('/platform', { waitUntil: 'domcontentloaded' });

    await page.waitForTimeout(1_500);

    const platformPage = new PlatformPage(page);

    // Ensure the sidebar is visible before checking nav items
    const sidebarVisible = await platformPage.isSidebarVisible();
    expect(sidebarVisible).toBe(true);

    // At least one nav link should exist within the sidebar
    const navItemCount = await platformPage.sidebarNavItems.count();
    expect(navItemCount).toBeGreaterThan(0);
  });

  test('Platform content area is rendered', async ({ page }) => {
    await page.goto('/platform', { waitUntil: 'domcontentloaded' });

    await page.waitForTimeout(1_500);

    const platformPage = new PlatformPage(page);

    // The main content area should be present and visible
    await expect(platformPage.contentArea).toBeVisible();
  });

  test('Platform page loads without critical console errors', async ({ page }) => {
    const errors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/platform', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2_000);

    // Filter out known benign errors (EventSource reconnects, favicon, network)
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes('ERR_CONNECTION_REFUSED') &&
        !e.includes('favicon') &&
        !e.includes('net::') &&
        !e.includes('EventSource'),
    );

    expect(criticalErrors).toEqual([]);
  });
});
