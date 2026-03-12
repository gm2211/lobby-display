import { test, expect } from '../../helpers/api-test';

test.describe('Snapshots API', () => {
  test('GET /api/snapshots returns an array', async ({ api }) => {
    const res = await api.get('/api/snapshots');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    // Each snapshot should have version, publishedAt, and publishedBy
    if (body.length > 0) {
      expect(body[0]).toHaveProperty('version');
      expect(body[0]).toHaveProperty('publishedAt');
      expect(body[0]).toHaveProperty('publishedBy');
    }
  });

  test('GET /api/snapshots/latest returns snapshot data or current state', async ({ api }) => {
    const res = await api.get('/api/snapshots/latest');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    // Should have the standard structure with services, events, advisories
    expect(body).toHaveProperty('services');
    expect(body).toHaveProperty('events');
    expect(body).toHaveProperty('advisories');
  });

  test('GET /api/snapshots/draft-status returns hasChanges boolean', async ({ api }) => {
    const res = await api.get('/api/snapshots/draft-status');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty('hasChanges');
    expect(typeof body.hasChanges).toBe('boolean');
  });

  test('POST /api/snapshots publishes a new snapshot', async ({ api }) => {
    const res = await api.post('/api/snapshots');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body).toHaveProperty('version');
    expect(typeof body.version).toBe('number');
    expect(body).toHaveProperty('publishedBy');
    expect(body).toHaveProperty('state');
  });
});
