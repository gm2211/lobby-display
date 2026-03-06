import { test, expect } from '../../helpers/api-test';

test.describe('Services API', () => {
  test('GET /api/services returns an array', async ({ api }) => {
    const res = await api.get('/api/services');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('POST /api/services creates a service and returns it with id', async ({ data }) => {
    const service = await data.createService({
      name: '[e2e-test] POST Service',
      status: 'Operational',
      sortOrder: 9999,
    });
    expect(service).toHaveProperty('id');
    expect(typeof service.id).toBe('number');
    expect(service.name).toBe('[e2e-test] POST Service');
    expect(service.status).toBe('Operational');
  });

  test('PUT /api/services/:id updates fields', async ({ api, data }) => {
    const service = await data.createService({ name: '[e2e-test] PUT Service' });
    const res = await api.put(`/api/services/${service.id}`, {
      name: '[e2e-test] PUT Service Updated',
      status: 'Under Maintenance',
    });
    expect(res.ok()).toBe(true);
    const updated = await res.json();
    expect(updated.name).toBe('[e2e-test] PUT Service Updated');
    expect(updated.status).toBe('Under Maintenance');
    expect(updated.id).toBe(service.id);
  });

  test('DELETE /api/services/:id marks for deletion', async ({ api, data }) => {
    const service = await data.createService({ name: '[e2e-test] DELETE Service' });
    const res = await api.delete(`/api/services/${service.id}`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.ok).toBe(true);

    // Verify the service is marked for deletion by fetching the list
    const listRes = await api.get('/api/services');
    const services = await listRes.json();
    const found = services.find((s: { id: number }) => s.id === service.id);
    expect(found).toBeTruthy();
    expect(found.markedForDeletion).toBe(true);
  });
});
