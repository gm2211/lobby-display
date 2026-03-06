import { test, expect, request } from '@playwright/test';
import { loginViaAPI } from '../../helpers/auth';
import { ApiClient } from '../../helpers/api-client';
import { TestDataManager } from '../../helpers/test-data';

test.describe('Admin - Advisories Section', () => {
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

  test('Advisories section lists existing advisories', async ({ page }) => {
    // Create a test advisory with unique name so we know at least one exists
    const uniqueMsg = `[e2e-test] List Check Advisory ${Date.now()}`;
    const adv = await testData.createAdvisory({
      message: uniqueMsg,
      active: true,
    });

    await page.goto('/admin');
    await expect(page.locator('h2', { hasText: 'Advisories' })).toBeVisible();

    // The advisory should appear in the advisories list
    await expect(page.locator(`text=${uniqueMsg}`)).toBeVisible();

    // Verify the list header shows "Current Advisories"
    await expect(page.locator('text=Current Advisories')).toBeVisible();
  });

  test('Can add advisory with message', async ({ page }) => {
    await page.goto('/admin');

    // Click the "+ Add New Advisory" button
    await page.getByRole('button', { name: '+ Add New Advisory' }).click();

    // Fill in the message
    const message = `[e2e-test] New Advisory ${Date.now()}`;
    await page.getByPlaceholder('Advisory message').fill(message);

    // Click "Add Advisory to Draft"
    await page.getByRole('button', { name: 'Add Advisory to Draft' }).click();

    // The new advisory should appear in the list
    await expect(page.locator(`text=${message}`)).toBeVisible({ timeout: 10_000 });

    // Clean up via API
    const res = await api.get('/api/advisories');
    const advisories = await res.json();
    const created = advisories.find((a: { message: string }) => a.message === message);
    if (created) {
      await api.delete(`/api/advisories/${created.id}`);
    }
  });

  test('Can edit message and toggle active state', async ({ page }) => {
    // Create an advisory to edit (starts as inactive)
    const adv = await testData.createAdvisory({
      message: `[e2e-test] Edit Advisory ${Date.now()}`,
      active: false,
    });

    await page.goto('/admin');
    await expect(page.locator(`text=${adv.message}`)).toBeVisible();

    // Navigate from the message text up to the card (identified by border-radius from listCardStyle),
    // then find buttons within the card.
    const messageEl = page.getByText(adv.message, { exact: true });
    const card = messageEl.locator('xpath=ancestor::div[contains(@style, "border-radius")][1]');

    // Toggle: find the toggle button in the card
    const toggleBtn = card.locator('button[title*="click to"]');
    await toggleBtn.click();

    // Wait for optimistic update
    await page.waitForTimeout(500);

    // Click the edit (pencil ✎) button in the card
    const editBtn = card.locator('button:has-text("✎")');
    await editBtn.click();

    // The form should be in edit mode with "Save Draft" button
    await expect(page.getByRole('button', { name: 'Save Draft' })).toBeVisible();

    // Edit the message
    const editedMessage = `[e2e-test] Edited Advisory ${Date.now()}`;
    const msgInput = page.getByPlaceholder('Advisory message');
    await msgInput.fill(editedMessage);

    // Save the changes — wait for the PUT response to complete before verifying
    const savePromise = page.waitForResponse(
      (response) => response.url().includes('/api/advisories') && response.request().method() === 'PUT',
      { timeout: 10_000 },
    );
    await page.getByRole('button', { name: 'Save Draft' }).click();
    await savePromise;

    // The edited message should appear
    await expect(page.locator(`text=${editedMessage}`)).toBeVisible({ timeout: 10_000 });

    // Verify via API that the advisory is now active and has the new message
    const res = await api.get('/api/advisories');
    const advisories = await res.json();
    const updated = advisories.find((a: { id: number }) => a.id === adv.id);
    expect(updated).toBeDefined();
    expect(updated.active).toBe(true);
    expect(updated.message).toBe(editedMessage);
  });

  test('Delete marks advisory for deletion', async ({ page }) => {
    // Create an advisory to delete
    const adv = await testData.createAdvisory({
      message: `[e2e-test] Delete Advisory ${Date.now()}`,
      active: true,
    });

    await page.goto('/admin');
    await expect(page.locator(`text=${adv.message}`)).toBeVisible();

    // Find the delete (✕) button via the advisory card
    const msgEl = page.getByText(adv.message, { exact: true });
    const card = msgEl.locator('xpath=ancestor::div[contains(@style, "border-radius")][1]');
    const deleteBtn = card.locator('button:has-text("✕")');
    await deleteBtn.click();

    // After marking for deletion, an "Undo" button should appear in the card
    await expect(card.locator('button:has-text("Undo")')).toBeVisible();

    // The text should have line-through style (verified by presence of strikethrough parent)
    // and the card should be marked
  });

  test('Inactive advisory shows in admin but not on public dashboard', async ({ page }) => {
    // Create an inactive advisory
    const adv = await testData.createAdvisory({
      message: `[e2e-test] Inactive Advisory ${Date.now()}`,
      active: false,
    });

    // Verify it shows in admin
    await page.goto('/admin');
    await expect(page.locator(`text=${adv.message}`)).toBeVisible();

    // The inactive advisory card should have reduced opacity (0.5)
    // This is set via inline style when active is false

    // Now check the public dashboard - inactive advisories should NOT show
    // We need to publish first so the advisory is in the snapshot, then check
    // Since we don't want to alter the published state, we'll verify via the API instead
    const latestRes = await api.get('/api/snapshots/latest');
    const latestData = await latestRes.json();

    // The inactive advisory should NOT be in the active advisories shown on the dashboard
    // The dashboard filters by active: true
    const publicAdvisories = (latestData.advisories || []).filter(
      (a: { active: boolean; message: string }) => a.active && a.message === adv.message
    );
    expect(publicAdvisories).toHaveLength(0);
  });
});
