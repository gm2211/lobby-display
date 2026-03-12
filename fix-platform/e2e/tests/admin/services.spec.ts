import { test, expect, request } from '@playwright/test';
import { loginViaAPI } from '../../helpers/auth';
import { ApiClient } from '../../helpers/api-client';
import { TestDataManager } from '../../helpers/test-data';

test.describe('Admin - Services Section', () => {
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

  test('Services section lists existing services', async ({ page }) => {
    // Create a test service with unique name so we know at least one exists
    const uniqueName = `[e2e-test] List Check Service ${Date.now()}`;
    const svc = await testData.createService({
      name: uniqueName,
      status: 'Operational',
    });

    await page.goto('/admin');
    await expect(page.locator('h2', { hasText: 'Services' })).toBeVisible();

    // The service we just created should appear in the services table
    await expect(page.locator(`text=${uniqueName}`)).toBeVisible();

    // Verify the table has header columns (Service, Status, Notes)
    const header = page.locator('.services-grid').first();
    await expect(header.locator('text=Service')).toBeVisible();
    await expect(header.locator('text=Status')).toBeVisible();
    await expect(header.locator('text=Notes')).toBeVisible();
  });

  test('Can add a new service via the form', async ({ page }) => {
    await page.goto('/admin');

    // Scope to the Services section to avoid strict mode violations
    const servicesSection = page.locator('section').filter({ hasText: 'Services' }).first();

    // Click the "+ Add Service" button to expand the form
    await servicesSection.getByRole('button', { name: '+ Add Service' }).click();

    // Fill in the service name
    const nameInput = servicesSection.getByPlaceholder('Service name');
    await expect(nameInput).toBeVisible();
    const serviceName = `[e2e-test] New Service ${Date.now()}`;
    await nameInput.fill(serviceName);

    // Select a status (the form has a StatusSelect dropdown)
    const statusSelect = servicesSection.locator('select').filter({ has: page.locator('option[value="Operational"]') }).first();
    await statusSelect.selectOption('Maintenance');

    // Submit the form
    await servicesSection.getByRole('button', { name: 'Add', exact: true }).click();

    // The new service should appear in the list
    await expect(page.locator(`text=${serviceName}`)).toBeVisible({ timeout: 10_000 });

    // Clean up: mark the newly created service for deletion via API
    // We need to find it in the API response
    const res = await api.get('/api/services');
    const services = await res.json();
    const created = services.find((s: { name: string }) => s.name === serviceName);
    if (created) {
      await api.delete(`/api/services/${created.id}`);
    }
  });

  test('Can edit a service status', async ({ page }) => {
    // Create a service to edit
    const svc = await testData.createService({
      name: `[e2e-test] Edit Status ${Date.now()}`,
      status: 'Operational',
    });

    await page.goto('/admin');
    await expect(page.locator(`text=${svc.name}`)).toBeVisible();

    // Find the row containing our service and change its status via the inline dropdown
    const serviceRow = page.locator('.services-grid').filter({ hasText: svc.name });
    const statusSelect = serviceRow.locator('select');
    await statusSelect.selectOption('Outage');

    // Wait for the optimistic update to settle
    await page.waitForTimeout(1000);

    // Verify the status changed - reload the page and check
    await page.reload();
    await expect(page.locator(`text=${svc.name}`)).toBeVisible();
    const updatedRow = page.locator('.services-grid').filter({ hasText: svc.name });
    await expect(updatedRow.locator('select')).toHaveValue('Outage');
  });

  test('Delete marks service for deletion with visual indicator', async ({ page }) => {
    // Create a service to delete
    const svc = await testData.createService({
      name: `[e2e-test] Delete Me ${Date.now()}`,
      status: 'Operational',
    });

    await page.goto('/admin');
    await expect(page.locator(`text=${svc.name}`)).toBeVisible();

    // Find the row and click the delete button (X)
    const serviceRow = page.locator('.services-grid').filter({ hasText: svc.name });
    await serviceRow.locator('button', { hasText: /^.$/ }).click();

    // After marking for deletion, the service name should have line-through styling
    // and an "Undo" button should appear
    await expect(serviceRow.getByRole('button', { name: 'Undo' })).toBeVisible();

    // The text should show with line-through (indicated by textDecoration style)
    const nameCell = serviceRow.locator('span', { hasText: svc.name });
    await expect(nameCell).toBeVisible();
  });

  test('Can undo/restore a marked-for-deletion service', async ({ page }) => {
    // Create a service and mark it for deletion via API
    const svc = await testData.createService({
      name: `[e2e-test] Restore Me ${Date.now()}`,
      status: 'Operational',
    });
    await api.delete(`/api/services/${svc.id}`);

    await page.goto('/admin');
    await expect(page.locator(`text=${svc.name}`)).toBeVisible();

    // Find the row - it should show the "Undo" button since it's marked for deletion
    const serviceRow = page.locator('.services-grid').filter({ hasText: svc.name });
    await expect(serviceRow.getByRole('button', { name: 'Undo' })).toBeVisible();

    // Click Undo to unmark — wait for the POST /unmark response to complete
    const undoPromise = page.waitForResponse(
      (response) => response.url().includes('/unmark') && response.request().method() === 'POST',
      { timeout: 10_000 },
    );
    await serviceRow.getByRole('button', { name: 'Undo' }).click();
    await undoPromise;

    // After unmarking, the Undo button should disappear and the delete button should reappear
    await expect(serviceRow.getByRole('button', { name: 'Undo' })).not.toBeVisible({
      timeout: 5000,
    });

    // Verify via API that the service is no longer marked for deletion
    const res = await api.get(`/api/services`);
    const services = await res.json();
    const restored = services.find((s: { id: number }) => s.id === svc.id);
    expect(restored.markedForDeletion).toBe(false);
  });
});
