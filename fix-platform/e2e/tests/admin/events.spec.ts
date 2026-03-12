import { test, expect, request } from '@playwright/test';
import { loginViaAPI } from '../../helpers/auth';
import { ApiClient } from '../../helpers/api-client';
import { TestDataManager } from '../../helpers/test-data';

test.describe('Admin - Events Section', () => {
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

  test('Events section lists existing events', async ({ page }) => {
    // Create a test event with unique name so we know at least one exists
    const uniqueTitle = `[e2e-test] List Check Event ${Date.now()}`;
    const evt = await testData.createEvent({
      title: uniqueTitle,
      subtitle: 'E2E subtitle',
      details: ['Detail line 1'],
    });

    await page.goto('/admin');
    await expect(page.locator('h2', { hasText: 'Events' })).toBeVisible();

    // The event should appear in the events list
    await expect(page.locator(`text=${uniqueTitle}`)).toBeVisible();

    // Verify the list header shows "Current Events"
    await expect(page.locator('text=Current Events')).toBeVisible();
  });

  test('Can add event with title, subtitle, and details', async ({ page }) => {
    await page.goto('/admin');

    // Scope to the Events section to avoid strict mode violations
    const eventsSection = page.locator('section').filter({ hasText: 'Events' }).first();

    // Click the "+ Add New Event" button
    await eventsSection.getByRole('button', { name: '+ Add New Event' }).click();

    // Fill in the form fields (scoped to events section to avoid matching config title input)
    const title = `[e2e-test] New Event ${Date.now()}`;
    await eventsSection.getByPlaceholder('Title', { exact: true }).fill(title);
    await eventsSection.getByPlaceholder('Subtitle').fill('Test subtitle for e2e');

    // Click "Add Event to Draft"
    await eventsSection.getByRole('button', { name: 'Add Event to Draft' }).click();

    // The new event should appear in the list
    await expect(page.locator(`text=${title}`)).toBeVisible({ timeout: 10_000 });

    // Clean up via API
    const res = await api.get('/api/events');
    const events = await res.json();
    const created = events.find((e: { title: string }) => e.title === title);
    if (created) {
      await api.delete(`/api/events/${created.id}`);
    }
  });

  test('Can edit event fields', async ({ page }) => {
    // Create an event to edit
    const evt = await testData.createEvent({
      title: `[e2e-test] Edit Event ${Date.now()}`,
      subtitle: 'Original subtitle',
      details: ['Original detail'],
    });

    await page.goto('/admin');
    await expect(page.locator(`text=${evt.title}`)).toBeVisible();

    // Navigate from the title text up to the card (identified by border-radius from listCardStyle),
    // then find the edit button within the card.
    const titleEl = page.getByText(evt.title, { exact: true });
    const card = titleEl.locator('xpath=ancestor::div[contains(@style, "border-radius")][1]');
    const editBtn = card.locator('button:has-text("✎")');
    await editBtn.click();

    // The form should now be in edit mode with "Save Draft" button
    await expect(page.getByRole('button', { name: 'Save Draft' })).toBeVisible();

    // Scope to events section for form inputs to avoid matching config inputs
    const eventsSection = page.locator('section').filter({ hasText: 'Events' }).first();

    // Edit the title
    const titleInput = eventsSection.getByPlaceholder('Title', { exact: true });
    const editedTitle = `[e2e-test] Edited Event ${Date.now()}`;
    await titleInput.fill(editedTitle);

    // Edit the subtitle
    const subtitleInput = eventsSection.getByPlaceholder('Subtitle');
    await subtitleInput.fill('Updated subtitle');

    // Save the changes
    await page.getByRole('button', { name: 'Save Draft' }).click();

    // The edited title should appear in the list
    await expect(page.locator(`text=${editedTitle}`)).toBeVisible({ timeout: 10_000 });
  });

  test('Delete marks event for deletion', async ({ page }) => {
    // Create an event to delete
    const evt = await testData.createEvent({
      title: `[e2e-test] Delete Event ${Date.now()}`,
      subtitle: 'Will be deleted',
      details: ['Detail to delete'],
    });

    await page.goto('/admin');
    await expect(page.locator(`text=${evt.title}`)).toBeVisible();

    // Find the delete (✕) button via the event card
    const titleEl = page.getByText(evt.title, { exact: true });
    const card = titleEl.locator('xpath=ancestor::div[contains(@style, "border-radius")][1]');
    const deleteBtn = card.locator('button:has-text("✕")');
    await deleteBtn.click();

    // After marking for deletion, an "Undo" button should appear in the card
    await expect(card.locator('button:has-text("Undo")')).toBeVisible();
  });

  test('Details array is preserved through edit cycle', async ({ page }) => {
    // Create event with multiple details lines
    const details = ['First detail line', 'Second detail line', 'Third detail line'];
    const evt = await testData.createEvent({
      title: `[e2e-test] Details Check ${Date.now()}`,
      subtitle: 'Details test',
      details,
    });

    await page.goto('/admin');
    await expect(page.locator(`text=${evt.title}`)).toBeVisible();

    // Verify the detail count shows in the card
    const detailsTitleEl = page.getByText(evt.title, { exact: true });
    const detailsCard = detailsTitleEl.locator('xpath=ancestor::div[contains(@style, "border-radius")][1]');
    await expect(detailsCard.locator('text=3 details')).toBeVisible();

    // Open the edit form via the pencil button
    const detailsEditBtn = detailsCard.locator('button:has-text("✎")');
    await detailsEditBtn.click();

    // Save without changing details
    await page.getByRole('button', { name: 'Save Draft' }).click();

    // Wait for the save to propagate
    await page.waitForTimeout(1000);

    // Verify via API that details are still intact
    const res = await api.get('/api/events');
    const events = await res.json();
    const updated = events.find((e: { id: number }) => e.id === evt.id);
    expect(updated).toBeDefined();
    expect(updated.details).toHaveLength(3);
    expect(updated.details).toContain('First detail line');
    expect(updated.details).toContain('Second detail line');
    expect(updated.details).toContain('Third detail line');
  });
});
