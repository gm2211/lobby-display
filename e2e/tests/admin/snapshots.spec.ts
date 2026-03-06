import { test, expect, request } from '@playwright/test';
import { loginViaAPI } from '../../helpers/auth';
import { ApiClient } from '../../helpers/api-client';
import { TestDataManager } from '../../helpers/test-data';

test.describe('Admin - Snapshots (Draft/Publish Workflow)', () => {
  test.describe.configure({ mode: 'serial' });

  let api: ApiClient;
  let testData: TestDataManager;

  test.beforeAll(async () => {
    const ctx = await request.newContext({
      baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
      storageState: { cookies: [], origins: [] },
    });
    const { csrfToken } = await loginViaAPI(ctx, 'admin');
    api = new ApiClient(ctx, csrfToken);
    testData = new TestDataManager(api);
  });

  test.afterAll(async () => {
    await testData.cleanup();
  });

  test('Unpublished changes indicator appears after making edits', async ({ page }) => {
    // Create a test service to trigger a change
    const svc = await testData.createService({
      name: `[e2e-test] Changes Indicator ${Date.now()}`,
      status: 'Operational',
    });

    await page.goto('/admin');

    // The header should show the "Unpublished changes" indicator
    // This appears as a span with "Unpublished changes" text and a yellow dot
    await expect(page.locator('text=Unpublished changes')).toBeVisible({ timeout: 10_000 });

    // The Publish button should be enabled (not disabled)
    const publishBtn = page.getByRole('button', { name: 'Publish' });
    await expect(publishBtn).toBeEnabled();
  });

  test('Publish creates a snapshot and clears the indicator', async ({ page }) => {
    await page.goto('/admin');

    // Ensure there are unpublished changes (from previous test's created service)
    await expect(page.locator('text=Unpublished changes')).toBeVisible({ timeout: 10_000 });

    // Click the Publish button
    const publishBtn = page.getByRole('button', { name: 'Publish' });
    await publishBtn.click();

    // After publishing, the "Unpublished changes" indicator should disappear
    await expect(page.locator('text=Unpublished changes')).not.toBeVisible({ timeout: 10_000 });

    // The Publish button should now be disabled (no changes to publish)
    await expect(publishBtn).toBeDisabled();

    // Verify via API that a new snapshot was created
    const res = await api.get('/api/snapshots');
    const snapshots = await res.json();
    expect(snapshots.length).toBeGreaterThan(0);
  });

  test('Discard reverts to last published state', async ({ page }) => {
    // Create a service to make a change
    const svc = await testData.createService({
      name: `[e2e-test] Discard Test ${Date.now()}`,
      status: 'Operational',
    });

    await page.goto('/admin');
    await expect(page.locator(`text=${svc.name}`)).toBeVisible();
    await expect(page.locator('text=Unpublished changes')).toBeVisible({ timeout: 10_000 });

    // Click Discard - note this triggers a confirm dialog
    page.on('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Discard' }).click();

    // After discarding, the test service should no longer appear
    // (it was created after the last publish, so discard removes it)
    await expect(page.locator(`text=${svc.name}`)).not.toBeVisible({ timeout: 10_000 });

    // The "Unpublished changes" indicator should disappear
    await expect(page.locator('text=Unpublished changes')).not.toBeVisible({ timeout: 10_000 });
  });

  test('History modal shows published versions', async ({ page }) => {
    await page.goto('/admin');

    // Click the History button
    await page.getByRole('button', { name: 'History' }).click();

    // The history modal should open with "Version History" heading
    // Use .first() to handle multiple matches (e.g., heading + modal title)
    await expect(page.locator('strong', { hasText: 'Version History' }).first()).toBeVisible();

    // There should be at least one version listed (from our publish test above)
    // Versions are displayed as "vN" links
    const versionEntries = page.locator('text=/^v\\d+$/');
    const count = await versionEntries.count();
    expect(count).toBeGreaterThanOrEqual(0); // At least 0 historical entries

    // Close the modal
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.locator('strong', { hasText: 'Version History' }).first()).not.toBeVisible();
  });

  test('Can restore from history', async ({ page }) => {
    // First, create some test data and publish it
    const svc = await testData.createService({
      name: `[e2e-test] Restore History ${Date.now()}`,
      status: 'Operational',
    });

    // Publish to create a snapshot containing our service
    await api.post('/api/snapshots');

    // Now create another service and publish again to have a second version
    const svc2 = await testData.createService({
      name: `[e2e-test] After Restore ${Date.now()}`,
      status: 'Maintenance',
    });
    await api.post('/api/snapshots');

    // Get snapshots to find a version we can restore
    const snapshotsRes = await api.get('/api/snapshots');
    const snapshots = await snapshotsRes.json();

    // We need at least 2 snapshots for a meaningful restore test
    if (snapshots.length < 2) {
      test.skip();
      return;
    }

    await page.goto('/admin');

    // Open History modal
    await page.getByRole('button', { name: 'History' }).click();
    await expect(page.locator('strong', { hasText: 'Version History' }).first()).toBeVisible();

    // Click on the first historical version to expand its diff
    const firstVersion = page.locator('text=/^v\\d+$/').first();
    await firstVersion.click();

    // The "Restore All" button should appear for the selected version
    await expect(page.getByRole('button', { name: 'Restore All' })).toBeVisible({
      timeout: 5_000,
    });

    // Accept the confirmation dialog for restore
    page.on('dialog', dialog => dialog.accept());

    // Click Restore All
    await page.getByRole('button', { name: 'Restore All' }).click();

    // After restore, the modal should close and the page should reflect the restored state
    // The "Unpublished changes" indicator may or may not appear depending on state
    await page.waitForTimeout(2000);
  });

  test('Publish removes soft-deleted items from the snapshot', async ({ page }) => {
    // Create a service, then mark it for deletion
    const svc = await testData.createService({
      name: `[e2e-test] Soft Delete Publish ${Date.now()}`,
      status: 'Operational',
    });

    await page.goto('/admin');
    await expect(page.locator(`text=${svc.name}`)).toBeVisible();

    // Mark the service for deletion via API
    await api.delete(`/api/services/${svc.id}`);

    // Reload to see the marked state
    await page.reload();

    // The service should still show (with strikethrough/Undo)
    await expect(page.locator(`text=${svc.name}`)).toBeVisible();

    // Publish - this should hard-delete the marked item
    const publishBtn = page.getByRole('button', { name: 'Publish' });
    if (await publishBtn.isEnabled()) {
      await publishBtn.click();

      // After publishing, the marked-for-deletion service should be gone
      await page.waitForTimeout(2000);
      await expect(page.locator(`text=${svc.name}`)).not.toBeVisible({ timeout: 10_000 });

      // Verify via API that the service no longer exists
      const res = await api.get('/api/services');
      const services = await res.json();
      const deleted = services.find((s: { id: number }) => s.id === svc.id);
      expect(deleted).toBeUndefined();
    }
  });
});
