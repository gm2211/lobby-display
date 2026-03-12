import type { APIRequestContext } from '@playwright/test';

export interface UserCredentials {
  username: string;
  password: string;
}

export function getCredentials(role: 'admin' | 'editor' | 'viewer'): UserCredentials {
  const prefix = `E2E_${role.toUpperCase()}`;
  const username = process.env[`${prefix}_USER`];
  const password = process.env[`${prefix}_PASS`];

  if (!username || !password) {
    throw new Error(
      `Missing credentials for ${role}. Set ${prefix}_USER and ${prefix}_PASS env vars.`,
    );
  }
  return { username, password };
}

/**
 * Get a CSRF token from an already-authenticated request context.
 * Use this when storageState provides the session (e.g. the `api` project).
 */
export async function getCsrfToken(
  request: APIRequestContext,
): Promise<string> {
  const csrfRes = await request.get('/api/auth/csrf');
  const { token } = await csrfRes.json();
  if (!token) {
    throw new Error('Failed to obtain CSRF token');
  }
  return token;
}

/**
 * Log in via API and return a CSRF token.
 * Use this for fresh contexts that don't have storageState.
 */
export async function loginViaAPI(
  request: APIRequestContext,
  role: 'admin' | 'editor' | 'viewer' = 'admin',
): Promise<{ csrfToken: string }> {
  const creds = getCredentials(role);

  // Pre-fetch a CSRF token to establish the session and satisfy CSRF checks.
  // This prevents 403 CsrfError when the context unexpectedly carries session state.
  const preCsrf = await getCsrfToken(request);

  const loginRes = await request.post('/api/auth/login', {
    data: { username: creds.username, password: creds.password },
    headers: { 'X-CSRF-Token': preCsrf },
  });

  if (!loginRes.ok()) {
    throw new Error(`Login failed for ${role}: ${loginRes.status()} ${await loginRes.text()}`);
  }

  // Login regenerates the session; fetch the new CSRF token.
  const token = await getCsrfToken(request);
  return { csrfToken: token };
}
