import { test, expect } from '../../helpers/api-test';
import { request } from '@playwright/test';
import { loginViaAPI, getCsrfToken } from '../../helpers/auth';
import { ApiClient } from '../../helpers/api-client';
import { TestDataManager } from '../../helpers/test-data';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

test.describe('RBAC - Role-Based Access Control', () => {
  test('Unauthenticated GET /api/services returns 401', async () => {
    const unauthCtx = await request.newContext({ baseURL: BASE_URL, storageState: { cookies: [], origins: [] } });
    try {
      const res = await unauthCtx.get('/api/services');
      expect(res.status()).toBe(401);
    } finally {
      await unauthCtx.dispose();
    }
  });

  test('Unauthenticated POST /api/services returns 401', async () => {
    const unauthCtx = await request.newContext({ baseURL: BASE_URL, storageState: { cookies: [], origins: [] } });
    try {
      const res = await unauthCtx.post('/api/services', {
        data: { name: '[e2e-test] Unauth Service', status: 'Operational', sortOrder: 9999 },
      });
      expect(res.status()).toBe(401);
    } finally {
      await unauthCtx.dispose();
    }
  });

  test('VIEWER GET /api/services returns 200', async ({ api }) => {
    // Create a temporary viewer user via admin API
    const viewerName = `e2e-viewer-${Date.now()}`;
    const viewerPass = 'E2eViewerPass1!';
    const createRes = await api.post('/api/users', {
      username: viewerName,
      password: viewerPass,
      role: 'VIEWER',
    });
    expect(createRes.ok()).toBe(true);
    const viewerUser = await createRes.json();

    try {
      // Log in as the new viewer
      const viewerCtx = await request.newContext({ baseURL: BASE_URL, storageState: { cookies: [], origins: [] } });
      try {
        const preCsrf = await getCsrfToken(viewerCtx);
        const loginRes = await viewerCtx.post('/api/auth/login', {
          data: { username: viewerName, password: viewerPass },
          headers: { 'X-CSRF-Token': preCsrf },
        });
        expect(loginRes.ok()).toBe(true);

        const res = await viewerCtx.get('/api/services');
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(Array.isArray(body)).toBe(true);
      } finally {
        await viewerCtx.dispose();
      }
    } finally {
      // Cleanup: delete the temporary viewer user
      await api.delete(`/api/users/${viewerUser.id}`);
    }
  });

  test('VIEWER POST /api/services returns 403', async ({ api }) => {
    // Create a temporary viewer user via admin API
    const viewerName = `e2e-viewer-${Date.now()}`;
    const viewerPass = 'E2eViewerPass1!';
    const createRes = await api.post('/api/users', {
      username: viewerName,
      password: viewerPass,
      role: 'VIEWER',
    });
    expect(createRes.ok()).toBe(true);
    const viewerUser = await createRes.json();

    try {
      // Log in as the new viewer
      const viewerCtx = await request.newContext({ baseURL: BASE_URL, storageState: { cookies: [], origins: [] } });
      try {
        const preCsrf = await getCsrfToken(viewerCtx);
        const loginRes = await viewerCtx.post('/api/auth/login', {
          data: { username: viewerName, password: viewerPass },
          headers: { 'X-CSRF-Token': preCsrf },
        });
        expect(loginRes.ok()).toBe(true);

        // Get a CSRF token for the authenticated viewer
        const csrfRes = await viewerCtx.get('/api/auth/csrf');
        const { token: viewerCsrf } = await csrfRes.json();

        const res = await viewerCtx.post('/api/services', {
          headers: { 'X-CSRF-Token': viewerCsrf },
          data: { name: '[e2e-test] Viewer Service', status: 'Operational', sortOrder: 9999 },
        });
        expect(res.status()).toBe(403);
      } finally {
        await viewerCtx.dispose();
      }
    } finally {
      // Cleanup: delete the temporary viewer user
      await api.delete(`/api/users/${viewerUser.id}`);
    }
  });

  test('EDITOR GET /api/services returns 200', async () => {
    const editorCtx = await request.newContext({ baseURL: BASE_URL, storageState: { cookies: [], origins: [] } });
    try {
      await loginViaAPI(editorCtx, 'editor');
      const res = await editorCtx.get('/api/services');
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    } finally {
      await editorCtx.dispose();
    }
  });

  test('EDITOR POST /api/services returns 200 (then cleanup)', async () => {
    const editorCtx = await request.newContext({ baseURL: BASE_URL, storageState: { cookies: [], origins: [] } });
    try {
      const { csrfToken } = await loginViaAPI(editorCtx, 'editor');
      const editorApi = new ApiClient(editorCtx, csrfToken);
      const data = new TestDataManager(editorApi);

      const service = await data.createService({
        name: '[e2e-test] Editor Service',
        status: 'Operational',
      });
      expect(service).toHaveProperty('id');
      expect(service.name).toBe('[e2e-test] Editor Service');

      // Cleanup
      await data.cleanup();
    } finally {
      await editorCtx.dispose();
    }
  });

  test('EDITOR GET /api/users returns 403', async () => {
    const editorCtx = await request.newContext({ baseURL: BASE_URL, storageState: { cookies: [], origins: [] } });
    try {
      await loginViaAPI(editorCtx, 'editor');
      const res = await editorCtx.get('/api/users');
      expect(res.status()).toBe(403);
    } finally {
      await editorCtx.dispose();
    }
  });

  test('ADMIN GET /api/users returns 200', async ({ request: adminReq }) => {
    const csrfToken = await getCsrfToken(adminReq);
    const adminApi = new ApiClient(adminReq, csrfToken);
    const res = await adminApi.get('/api/users');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    // Users should not include passwordHash
    if (body.length > 0) {
      expect(body[0]).not.toHaveProperty('passwordHash');
      expect(body[0]).toHaveProperty('username');
      expect(body[0]).toHaveProperty('role');
    }
  });
});
