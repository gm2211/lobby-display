import { test, expect } from '@playwright/test';

test.describe('Preview and Snapshot modes', () => {
  test('?preview=true shows page content (draft data)', async ({ page }) => {
    // preview=true fetches directly from /api/services, /api/events, etc.
    // (current draft data) instead of from the published snapshot.
    await page.goto('/?preview=true');

    // Dashboard page should still render with the standard layout
    await expect(page.locator('.dashboard-page')).toBeVisible();
    await expect(page.locator('.header-row h1')).toBeVisible();

    // Service table should render (preview loads live draft data)
    await expect(page.locator('.service-table-container')).toBeVisible({ timeout: 15_000 });

    // Confirm the page actually fetched from the individual API endpoints
    // by checking that the service table has loaded data rows
    const rows = page.locator('.service-table-container tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });
  });

  test('Default (no params) shows published snapshot data', async ({ page }) => {
    // First, verify the published snapshot endpoint returns data
    const snapshotRes = await page.request.get('/api/snapshots/latest');
    const snapshot = await snapshotRes.json();

    await page.goto('/');
    await expect(page.locator('.dashboard-page')).toBeVisible();

    // If there are services in the published snapshot, they should appear in the table
    if (snapshot.services?.length) {
      const serviceTable = page.locator('.service-table-container');
      await expect(serviceTable).toBeVisible();

      // Verify the first published service name appears on the page
      const firstName = snapshot.services[0].name;
      if (firstName) {
        // Use .first() because auto-scroll cards may duplicate content
        await expect(page.getByText(firstName, { exact: false }).first()).toBeVisible({
          timeout: 15_000,
        });
      }
    }

    // If there are events in the published snapshot, at least one card title should show
    if (snapshot.events?.length) {
      const firstTitle = snapshot.events[0].title;
      if (firstTitle) {
        // Use .first() because auto-scroll cards may duplicate content
        await expect(page.getByText(firstTitle, { exact: false }).first()).toBeVisible({
          timeout: 15_000,
        });
      }
    }
  });

  test('?snapshot=<version> shows specific version or handles gracefully', async ({ page }) => {
    // First, check what snapshots exist via the API
    const listRes = await page.request.get('/api/snapshots');
    const snapshots = await listRes.json();

    if (Array.isArray(snapshots) && snapshots.length > 0) {
      // Use the first (oldest or most recent depending on sort) snapshot version
      const version = snapshots[0].version;

      await page.goto(`/?snapshot=${version}`);
      await expect(page.locator('.dashboard-page')).toBeVisible();

      // The page should load without crashing -- service table should render
      await expect(page.locator('.service-table-container')).toBeVisible({ timeout: 15_000 });
    } else {
      // No snapshots at all -- try with version=1 and ensure the page handles it
      await page.goto('/?snapshot=1');
      await expect(page.locator('.dashboard-page')).toBeVisible();

      test.info().annotations.push({
        type: 'info',
        description: 'No snapshots found on staging -- tested graceful handling of ?snapshot=1',
      });
    }

    // Also test a non-existent snapshot version for graceful error handling
    await page.goto('/?snapshot=999999');
    // The page should still render (Dashboard component catches fetch errors)
    await expect(page.locator('.dashboard-page')).toBeVisible();
  });
});
