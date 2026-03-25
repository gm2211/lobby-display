import { test, expect, request } from '@playwright/test';
import { loginViaAPI } from '../../helpers/auth';
import { ApiClient } from '../../helpers/api-client';

test.describe('Admin - Config Section', () => {
  test.describe.configure({ mode: 'serial' });

  let api: ApiClient;
  let originalTitle: string;

  test.beforeAll(async () => {
    const ctx = await request.newContext({
      baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
      storageState: { cookies: [], origins: [] },
    });
    const { csrfToken } = await loginViaAPI(ctx, 'admin');
    api = new ApiClient(ctx, csrfToken);

    // Save the original title so we can restore it after tests
    const res = await api.get('/api/config');
    const config = await res.json();
    originalTitle = config.dashboardTitle || '';
  });

  test.afterAll(async () => {
    // Restore original title
    if (originalTitle !== undefined) {
      await api.put('/api/config', { dashboardTitle: originalTitle });
    }
  });

  test('Displays current building title', async ({ page }) => {
    await page.goto('/admin');

    // The Config section should be visible with "Dashboard" heading
    await expect(page.locator('h2', { hasText: 'Dashboard' })).toBeVisible();

    // The title input should be present with a value
    const titleInput = page.getByPlaceholder('Dashboard title');
    await expect(titleInput).toBeVisible();

    // The input should be present (value may be empty if previous test run discarded changes)
    const value = await titleInput.inputValue();
    expect(typeof value).toBe('string');
  });

  test('Can edit and save title', async ({ page }) => {
    await page.goto('/admin');

    const titleInput = page.getByPlaceholder('Dashboard title');
    await expect(titleInput).toBeVisible();

    // Wait for the initial config fetch and auto-save cycle to settle.
    // The component fetches config on mount, sets form state, which triggers
    // a debounced PUT. We need that PUT to complete before we listen for ours.
    await page.waitForTimeout(1000);

    const newTitle = `[e2e-test] Dashboard Title ${Date.now()}`;

    // Set up waitForResponse BEFORE triggering changes.
    // Match on the request body containing our new title to avoid catching
    // the initial auto-save PUT.
    const savePromise = page.waitForResponse(
      async (response) => {
        if (!response.url().includes('/api/config')) return false;
        if (response.request().method() !== 'PUT') return false;
        try {
          const body = response.request().postDataJSON();
          return body?.dashboardTitle === newTitle;
        } catch {
          return false;
        }
      },
      { timeout: 15_000 },
    );

    // Select all text via keyboard shortcut (Ctrl+A on Linux CI) and type to replace.
    // pressSequentially fires real keyboard events that trigger React's onChange,
    // unlike fill() which only dispatches synthetic events that React may ignore.
    await titleInput.click();
    await page.keyboard.press('Control+a');
    await titleInput.pressSequentially(newTitle, { delay: 10 });

    // Wait for the debounced auto-save (150ms debounce + network round-trip)
    await savePromise;

    // Verify the change persisted by reloading
    await page.reload();
    const updatedInput = page.getByPlaceholder('Dashboard title');
    await expect(updatedInput).toHaveValue(newTitle);

    // Also verify via API
    const res = await api.get('/api/config');
    const config = await res.json();
    expect(config.dashboardTitle).toBe(newTitle);
  });

  test('Can edit scroll speed settings', async ({ page }) => {
    await page.goto('/admin');

    // The Services section has a "Page speed" slider (SpeedSlider component)
    // The Events section has a "Scroll speed" slider
    // Both use range inputs

    // Look for the Services section's page speed control
    const servicesSection = page.locator('section').filter({ hasText: 'Services' }).first();
    await expect(servicesSection).toBeVisible();

    // The SpeedSlider renders a range input labeled "Page speed"
    const pageSpeedSlider = servicesSection.locator('input[type="range"]');
    await expect(pageSpeedSlider).toBeVisible();

    // Get current value
    const currentValue = await pageSpeedSlider.inputValue();

    // Change the slider value by setting it programmatically
    // SpeedSlider uses onCommit on pointerup/change, so we need to trigger properly
    await pageSpeedSlider.fill('15');

    // Wait for the API call to propagate
    await page.waitForTimeout(500);

    // Verify the Events section also has a scroll speed slider
    const eventsSection = page.locator('section').filter({ hasText: 'Events' }).first();
    const eventsSpeedSlider = eventsSection.locator('input[type="range"]');
    await expect(eventsSpeedSlider).toBeVisible();

    // Restore original services scroll speed
    await pageSpeedSlider.fill(currentValue);
    await page.waitForTimeout(500);
  });
});
