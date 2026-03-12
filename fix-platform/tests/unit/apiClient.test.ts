import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api, ApiError } from '../../src/utils/api';

describe('api client', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
    // Clear cached CSRF token between tests
    api.clearCsrf();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockFetch(status: number, body: unknown, ok?: boolean) {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: ok ?? (status >= 200 && status < 300),
      status,
      statusText: 'OK',
      json: () => Promise.resolve(body),
    });
  }

  /** Mock that returns CSRF token on first call, then the given response */
  function mockFetchWithCsrf(status: number, body: unknown, ok?: boolean) {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve({ token: 'test-csrf-token' }),
      })
      .mockResolvedValueOnce({
        ok: ok ?? (status >= 200 && status < 300),
        status,
        statusText: 'OK',
        json: () => Promise.resolve(body),
      });
  }

  it('GET sends a GET request and returns parsed JSON', async () => {
    mockFetch(200, [{ id: 1, name: 'HVAC' }]);
    const result = await api.get('/api/services');
    expect(result).toEqual([{ id: 1, name: 'HVAC' }]);
    expect(global.fetch).toHaveBeenCalledWith('/api/services', { credentials: 'same-origin' });
  });

  it('POST sends JSON body with CSRF token', async () => {
    mockFetchWithCsrf(200, { id: 1, name: 'New' });
    await api.post('/api/services', { name: 'New' });
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    // First call: CSRF token fetch
    expect(fetchMock.mock.calls[0]).toEqual(['/api/auth/csrf', { credentials: 'same-origin' }]);
    // Second call: actual POST with CSRF header
    expect(fetchMock.mock.calls[1]).toEqual(['/api/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'test-csrf-token' },
      body: JSON.stringify({ name: 'New' }),
      credentials: 'same-origin',
    }]);
  });

  it('PUT sends JSON body with CSRF token', async () => {
    mockFetchWithCsrf(200, { id: 1, status: 'Maintenance' });
    await api.put('/api/services/1', { status: 'Maintenance' });
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock.mock.calls[1]).toEqual(['/api/services/1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'test-csrf-token' },
      body: JSON.stringify({ status: 'Maintenance' }),
      credentials: 'same-origin',
    }]);
  });

  it('DELETE sends a DELETE request with CSRF token', async () => {
    mockFetchWithCsrf(200, { ok: true });
    await api.del('/api/services/1');
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock.mock.calls[1]).toEqual(['/api/services/1', {
      method: 'DELETE',
      headers: { 'X-CSRF-Token': 'test-csrf-token' },
      credentials: 'same-origin',
    }]);
  });

  it('throws ApiError on non-2xx status with server error message', async () => {
    mockFetch(400, { error: 'Validation failed' }, false);
    await expect(api.get('/api/services')).rejects.toThrow(ApiError);
    try {
      await api.get('/api/services');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).status).toBe(400);
      expect((e as ApiError).message).toBe('Validation failed');
    }
  });

  it('throws ApiError with fallback message when body has no error field', async () => {
    mockFetch(404, { data: 'irrelevant' }, false);
    try {
      await api.get('/api/missing');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).message).toBe('HTTP 404');
    }
  });

  it('POST without body sends undefined body', async () => {
    mockFetchWithCsrf(200, { ok: true });
    await api.post('/api/snapshots');
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock.mock.calls[1]).toEqual(['/api/snapshots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'test-csrf-token' },
      body: undefined,
      credentials: 'same-origin',
    }]);
  });

  it('ApiError has correct name property', () => {
    const err = new ApiError(500, 'Server Error');
    expect(err.name).toBe('ApiError');
    expect(err.status).toBe(500);
    expect(err.message).toBe('Server Error');
  });
});
