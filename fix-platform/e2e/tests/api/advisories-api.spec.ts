import { test, expect } from '../../helpers/api-test';

test.describe('Advisories API', () => {
  test('GET /api/advisories returns an array', async ({ api }) => {
    const res = await api.get('/api/advisories');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('POST /api/advisories creates an advisory', async ({ data }) => {
    const advisory = await data.createAdvisory({
      message: '[e2e-test] POST Advisory',
      active: true,
    });
    expect(advisory).toHaveProperty('id');
    expect(typeof advisory.id).toBe('number');
    expect(advisory.message).toBe('[e2e-test] POST Advisory');
    expect(advisory.active).toBe(true);
  });

  test('PUT /api/advisories/:id updates an advisory', async ({ api, data }) => {
    const advisory = await data.createAdvisory({
      message: '[e2e-test] PUT Advisory',
      active: false,
    });
    const res = await api.put(`/api/advisories/${advisory.id}`, {
      message: '[e2e-test] PUT Advisory Updated',
      active: true,
    });
    expect(res.ok()).toBe(true);
    const updated = await res.json();
    expect(updated.message).toBe('[e2e-test] PUT Advisory Updated');
    expect(updated.active).toBe(true);
    expect(updated.id).toBe(advisory.id);
  });

  test('DELETE /api/advisories/:id marks for deletion', async ({ api, data }) => {
    const advisory = await data.createAdvisory({
      message: '[e2e-test] DELETE Advisory',
    });
    const res = await api.delete(`/api/advisories/${advisory.id}`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.ok).toBe(true);

    // Verify the advisory is marked for deletion
    const listRes = await api.get('/api/advisories');
    const advisories = await listRes.json();
    const found = advisories.find((a: { id: number }) => a.id === advisory.id);
    expect(found).toBeTruthy();
    expect(found.markedForDeletion).toBe(true);
  });
});
