import { test, expect } from '../../helpers/api-test';
import { request } from '@playwright/test';
import { getCsrfToken } from '../../helpers/auth';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';
const FIXTURE_PATH = path.resolve(__dirname, '../../fixtures/test-image.png');

test.describe('Upload API', () => {
  test('Valid PNG upload returns { url: string }', async ({ request: authReq }) => {
    const csrfToken = await getCsrfToken(authReq);

    const fileBuffer = fs.readFileSync(FIXTURE_PATH);

    const res = await authReq.post('/api/upload', {
      headers: { 'X-CSRF-Token': csrfToken },
      multipart: {
        file: {
          name: 'test-image.png',
          mimeType: 'image/png',
          buffer: fileBuffer,
        },
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty('url');
    expect(typeof body.url).toBe('string');
    expect(body.url).toMatch(/\/images\/uploads\/.+\.png$/);
  });

  test('Unauthenticated upload returns 401', async () => {
    const unauthCtx = await request.newContext({ baseURL: BASE_URL, storageState: { cookies: [], origins: [] } });
    try {
      const fileBuffer = fs.readFileSync(FIXTURE_PATH);

      const res = await unauthCtx.post('/api/upload', {
        multipart: {
          file: {
            name: 'test-image.png',
            mimeType: 'image/png',
            buffer: fileBuffer,
          },
        },
      });
      expect(res.status()).toBe(401);
    } finally {
      await unauthCtx.dispose();
    }
  });
});
