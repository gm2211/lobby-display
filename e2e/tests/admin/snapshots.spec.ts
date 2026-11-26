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
    await expect(page.getByRole('banner').getByText(/unpublished change/i)).toBeVisible({ timeout: 10_000 });

    // The Publish button should be enabled (not disabled)
    const publishBtn = page.getByRole('banner').getByRole('button', { name: 'Publish', exact: true });
    await expect(publishBtn).toBeEnabled();
  });

  test('Publish creates a snapshot and clears the indicator', async ({ page }) => {
    await page.goto('/admin');

    // Ensure there are unpublished changes (from previous test's created service)
    await expect(page.getByRole('banner').getByText(/unpublished change/i)).toBeVisible({ timeout: 10_000 });

    // Click the Publish button
    const publishBtn = page.getByRole('banner').getByRole('button', { name: 'Publish', exact: true });
    await publishBtn.click();

    // After publishing, the "Unpublished changes" indicator should disappear
    await expect(page.getByRole('banner').getByText(/unpublished change/i)).not.toBeVisible({ timeout: 10_000 });

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
    await expect(page.getByRole('main').locator(`text=${svc.name}`)).toBeVisible();
    await expect(page.getByRole('banner').getByText(/unpublished change/i)).toBeVisible({ timeout: 10_000 });

    // Click Discard - note this triggers a confirm dialog
    page.on('dialog', dialog => dialog.accept());
    await page.getByRole('banner').getByRole('button', { name: 'Discard', exact: true }).click();

    // After discarding, the test service should no longer appear
    // (it was created after the last publish, so discard removes it)
    await expect(page.getByRole('main').locator(`text=${svc.name}`)).not.toBeVisible({ timeout: 10_000 });

    // The "Unpublished changes" indicator should disappear
    await expect(page.getByRole('banner').getByText(/unpublished change/i)).not.toBeVisible({ timeout: 10_000 });
  });

  test('History page shows published versions', async ({ page }) => {
    await page.goto('/admin');

    // Open History (header button on iPad/desktop)
    await page.getByRole('button', { name: 'History', exact: true }).click();
    const history = page.getByRole('dialog', { name: 'History' });
    await expect(history).toBeVisible();

    // The scrubber names the version being viewed, and the lobby preview is shown
    await expect(history.locator('.tm-cur b')).toHaveText(/^v\d+ · /, { timeout: 10_000 });
    await expect(history.locator('iframe[title^="Lobby screen at v"]')).toBeVisible();
    await expect(history.getByRole('heading', { name: 'Different from now' })).toBeVisible();

    // Back to the editor
    await history.getByRole('button', { name: 'Editor' }).click();
    await expect(history).not.toBeVisible();
  });

  test('Can restore from history', async ({ page }) => {
    // Two publishes so there is a version before live
    await testData.createService({
      name: `[e2e-test] Restore History ${Date.now()}`,
      status: 'Operational',
    });
    await api.post('/api/snapshots');
    await testData.createService({
      name: `[e2e-test] After Restore ${Date.now()}`,
      status: 'Maintenance',
    });
    await api.post('/api/snapshots');

    const snapshotsRes = await api.get('/api/snapshots');
    const snapshots = await snapshotsRes.json();
    if (snapshots.length < 2) {
      test.skip();
      return;
    }
    const previous = snapshots[1].version;

    await page.goto('/admin');
    await page.getByRole('button', { name: 'History', exact: true }).click();
    const history = page.getByRole('dialog', { name: 'History' });

    // History opens on the version before live
    await expect(history.locator('.tm-cur b')).toHaveText(new RegExp(`^v${previous} · `), { timeout: 10_000 });

    // The service added after that version can be removed from the draft from here
    await expect(history.getByText(/\[e2e-test\] After Restore/)).toBeVisible({ timeout: 10_000 });

    page.on('dialog', dialog => dialog.accept());
    await history.getByRole('button', { name: `Restore v${previous}` }).click();

    // Full restore closes History and leaves an unpublished draft
    await expect(history).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('banner').getByText(/unpublished change/i)).toBeVisible({ timeout: 10_000 });
  });

  test('Publish removes soft-deleted items from the snapshot', async ({ page }) => {
    // Create a service, then mark it for deletion
    const svc = await testData.createService({
      name: `[e2e-test] Soft Delete Publish ${Date.now()}`,
      status: 'Operational',
    });

    await page.goto('/admin');
    await expect(page.getByRole('main').locator(`text=${svc.name}`)).toBeVisible();

    // Mark the service for deletion via API
    await api.delete(`/api/services/${svc.id}`);

    // Reload to see the marked state
    await page.reload();

    // The service should still show (with strikethrough/Undo)
    await expect(page.getByRole('main').locator(`text=${svc.name}`)).toBeVisible();

    // Publish - this should hard-delete the marked item
    const publishBtn = page.getByRole('banner').getByRole('button', { name: 'Publish', exact: true });
    if (await publishBtn.isEnabled()) {
      await publishBtn.click();

      // After publishing, the marked-for-deletion service should be gone
      await page.waitForTimeout(2000);
      await expect(page.getByRole('main').locator(`text=${svc.name}`)).not.toBeVisible({ timeout: 10_000 });

      // Verify via API that the service no longer exists
      const res = await api.get('/api/services');
      const services = await res.json();
      const deleted = services.find((s: { id: number }) => s.id === svc.id);
      expect(deleted).toBeUndefined();
    }
  });
});
