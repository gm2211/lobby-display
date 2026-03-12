import { test, expect } from '../../helpers/api-test';

test.describe('Config API', () => {
  test('GET /api/config returns config object with dashboardTitle', async ({ api }) => {
    const res = await api.get('/api/config');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('dashboardTitle');
    expect(typeof body.dashboardTitle).toBe('string');
  });

  test('PUT /api/config updates fields and restores original', async ({ api }) => {
    // Save original config
    const getRes = await api.get('/api/config');
    const original = await getRes.json();

    // Update with test value
    const testTitle = `[e2e-test] Config Title ${Date.now()}`;
    const updateRes = await api.put('/api/config', {
      dashboardTitle: testTitle,
    });
    expect(updateRes.ok()).toBe(true);
    const updated = await updateRes.json();
    expect(updated.dashboardTitle).toBe(testTitle);

    // Restore original config
    const restoreRes = await api.put('/api/config', {
      dashboardTitle: original.dashboardTitle,
    });
    expect(restoreRes.ok()).toBe(true);
    const restored = await restoreRes.json();
    expect(restored.dashboardTitle).toBe(original.dashboardTitle);
  });
});
