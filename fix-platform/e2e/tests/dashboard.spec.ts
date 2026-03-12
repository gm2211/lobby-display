import { test, expect } from '@playwright/test';

test.describe('Public Dashboard', () => {
  test('Header shows building title', async ({ page }) => {
    await page.goto('/');

    // The header contains an h1 with the building/dashboard title
    const heading = page.locator('.header-row h1');
    await expect(heading).toBeVisible();
    // Title text should be non-empty (content is configurable per-instance)
    const text = await heading.textContent();
    expect(text?.trim().length).toBeGreaterThan(0);
  });

  test('Service table renders', async ({ page }) => {
    await page.goto('/');

    // Service table container should be visible
    const serviceTable = page.locator('.service-table-container');
    await expect(serviceTable).toBeVisible();

    // Should have a table element with column headers
    await expect(serviceTable.locator('th')).toHaveCount(4); // Service, Status, Notes, Last Updated

    // The table should render at least one data row (live staging has data)
    const rows = serviceTable.locator('tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });
  });

  test('Event cards render titles', async ({ page }) => {
    await page.goto('/');

    // Wait for event cards to load. AutoScrollCards renders EventCard components
    // each with an h3 for the title.
    const eventCards = page.locator('.auto-scroll-container h3, [class*="card"] h3');

    // There should be at least one event with a visible title on a live dashboard.
    // Use a generous timeout since data loads via fetch after mount.
    await expect(eventCards.first()).toBeVisible({ timeout: 15_000 });

    const titleText = await eventCards.first().textContent();
    expect(titleText?.trim().length).toBeGreaterThan(0);
  });

  test('Advisory ticker shows active messages', async ({ page }) => {
    await page.goto('/');

    // The AdvisoryTicker renders nothing if there are no active advisories.
    // On a live staging environment we check for its presence, but tolerate absence.
    const ticker = page.locator('[class*="ticker"], .advisory-ticker');

    // Wait briefly for data to load
    await page.waitForTimeout(3_000);

    const tickerCount = await ticker.count();
    if (tickerCount > 0) {
      // If the ticker is present, it should contain at least one message span
      const messages = ticker.locator('span');
      await expect(messages.first()).toBeVisible();
    } else {
      // No active advisories -- this is acceptable on staging
      test.info().annotations.push({
        type: 'info',
        description: 'No active advisories on staging -- ticker not rendered (expected behavior)',
      });
    }
  });

  test('Items marked for deletion are not shown on public dashboard', async ({ page }) => {
    await page.goto('/');
    // Don't use 'networkidle' — SSE EventSource keeps the connection open forever.
    await page.waitForLoadState('domcontentloaded');

    // The public dashboard fetches from /api/snapshots/latest which only includes
    // published data. Items with markedForDeletion=true are hard-deleted on publish,
    // so they should never appear. We verify by checking the API directly.
    const res = await page.request.get('/api/snapshots/latest');
    const snapshot = await res.json();

    // Verify no service has markedForDeletion
    if (snapshot.services?.length) {
      for (const service of snapshot.services) {
        expect(service.markedForDeletion).toBeFalsy();
      }
    }

    // Verify no event has markedForDeletion
    if (snapshot.events?.length) {
      for (const event of snapshot.events) {
        expect(event.markedForDeletion).toBeFalsy();
      }
    }

    // Verify no advisory has markedForDeletion
    if (snapshot.advisories?.length) {
      for (const advisory of snapshot.advisories) {
        expect(advisory.markedForDeletion).toBeFalsy();
      }
    }
  });

  test('Page loads without console errors', async ({ page }) => {
    const errors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/');
    // Don't use 'networkidle' — SSE EventSource keeps the connection open forever.
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3_000);

    // Filter out known benign errors (e.g. ERR_CONNECTION_REFUSED for EventSource
    // if SSE endpoint reconnects, or favicon 404s)
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
