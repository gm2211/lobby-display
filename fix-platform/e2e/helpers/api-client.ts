import type { APIRequestContext } from '@playwright/test';

/**
 * Thin wrapper around Playwright's APIRequestContext that auto-injects
 * the CSRF token on state-changing requests.
 */
export class ApiClient {
  constructor(
    private request: APIRequestContext,
    private csrfToken: string,
  ) {}

  private headers() {
    return { 'X-CSRF-Token': this.csrfToken };
  }

  async get(path: string) {
    return this.request.get(path);
  }

  async post(path: string, data?: unknown) {
    return this.request.post(path, {
      headers: this.headers(),
      data,
    });
  }

  async put(path: string, data?: unknown) {
    return this.request.put(path, {
      headers: this.headers(),
      data,
    });
  }

  async delete(path: string) {
    return this.request.delete(path, {
      headers: this.headers(),
    });
  }
}
