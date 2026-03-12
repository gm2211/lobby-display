import { test, expect } from '../../helpers/api-test';

test.describe('CSRF Protection', () => {
  test('POST without CSRF token returns 403', async ({ request }) => {
    // Session is pre-authenticated via storageState; send request without CSRF header
    const res = await request.post('/api/services', {
      data: { name: '[e2e-test] No CSRF', status: 'Operational', sortOrder: 9999 },
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('CsrfError');
  });

  test('POST with wrong CSRF token returns 403', async ({ request }) => {
    const res = await request.post('/api/services', {
      headers: { 'X-CSRF-Token': 'totally-wrong-token-value' },
      data: { name: '[e2e-test] Bad CSRF', status: 'Operational', sortOrder: 9999 },
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('CsrfError');
  });

  test('POST with valid CSRF token succeeds', async ({ data }) => {
    const service = await data.createService({
      name: '[e2e-test] Valid CSRF',
      status: 'Operational',
    });
    expect(service).toHaveProperty('id');
    expect(service.name).toBe('[e2e-test] Valid CSRF');
  });
});
