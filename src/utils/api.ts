/**
 * API utility for making HTTP requests to the backend.
 *
 * ERROR HANDLING:
 * All methods throw ApiError on non-2xx responses. Callers should
 * wrap in try/catch or use .catch() to handle errors appropriately.
 *
 * USAGE:
 * ```tsx
 * try {
 *   const data = await api.get('/api/services');
 * } catch (error) {
 *   if (error instanceof ApiError) {
 *     console.error(`API Error ${error.status}: ${error.message}`);
 *   }
 * }
 * ```
 *
 * AI AGENT NOTE: When adding new API calls, always consider error handling.
 * For user-facing errors, show a toast or inline error message.
 */

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const CSRF_HEADER = 'X-CSRF-Token';
const CSRF_ENDPOINT = '/api/auth/csrf';

let csrfToken: string | null = null;
let csrfPromise: Promise<string> | null = null;

/**
 * Custom error class for API failures.
 * Contains the HTTP status code and error message.
 */
export class ApiError extends Error {
  constructor(
    /** HTTP status code (e.g., 404, 500) */
    public status: number,
    /** Error message from server or default */
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Handle fetch response - throws ApiError on non-2xx status.
 * Returns parsed JSON on success.
 */
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    // Redirect to login on 401 (session expired)
    if (response.status === 401 && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }

    // Try to get error message from response body
    let message: string;
    try {
      const body = await response.json();
      message = body.message || body.error || `HTTP ${response.status}`;
    } catch {
      message = `HTTP ${response.status}: ${response.statusText}`;
    }
    throw new ApiError(response.status, message);
  }
  return response.json();
}

async function fetchCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken;
  if (!csrfPromise) {
    csrfPromise = fetch(CSRF_ENDPOINT, { credentials: 'same-origin' })
      .then(r => handleResponse<{ token: string }>(r))
      .then(data => {
        if (!data?.token) {
          throw new ApiError(500, 'Missing CSRF token');
        }
        csrfToken = data.token;
        return data.token;
      })
      .finally(() => {
        csrfPromise = null;
      });
  }
  return csrfPromise;
}

async function withCsrfHeaders(headers: Record<string, string> = {}): Promise<Record<string, string>> {
  const token = await fetchCsrfToken();
  return { ...headers, [CSRF_HEADER]: token };
}

function toHeaderRecord(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return headers;
}

async function requestWithCsrf<T>(
  url: string,
  init: RequestInit,
  headers: Record<string, string> = {}
): Promise<T> {
  const doRequest = async () => {
    const csrfHeaders = await withCsrfHeaders(headers);
    const response = await fetch(url, {
      ...init,
      headers: csrfHeaders,
      credentials: 'same-origin',
    });
    return handleResponse<T>(response);
  };

  try {
    return await doRequest();
  } catch (err) {
    if (err instanceof ApiError && err.status === 403 && err.message === 'Invalid CSRF token') {
      csrfToken = null;
      return doRequest();
    }
    throw err;
  }
}

/**
 * API client with typed methods for all HTTP verbs.
 * All methods throw ApiError on failure.
 */
export const api = {
  /**
   * GET request - fetch data from the server.
   * @throws ApiError on non-2xx response
   */
  get: <T = unknown>(url: string): Promise<T> =>
    fetch(url, { credentials: 'same-origin' }).then(r => handleResponse<T>(r)),

  /**
   * POST request - create new resource or trigger action.
   * @throws ApiError on non-2xx response
   */
  post: async <T = unknown>(url: string, body?: unknown): Promise<T> =>
    requestWithCsrf<T>(url, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }, JSON_HEADERS),

  /**
   * PUT request - update existing resource.
   * @throws ApiError on non-2xx response
   */
  put: async <T = unknown>(url: string, body: unknown): Promise<T> =>
    requestWithCsrf<T>(url, {
      method: 'PUT',
      body: JSON.stringify(body),
    }, JSON_HEADERS),

  /**
   * DELETE request - remove resource.
   * @throws ApiError on non-2xx response
   */
  del: async <T = unknown>(url: string): Promise<T> =>
    requestWithCsrf<T>(url, { method: 'DELETE' }),

  request: async <T = unknown>(
    url: string,
    init: RequestInit,
    headers: Record<string, string> = {}
  ): Promise<T> => {
    const mergedHeaders = { ...toHeaderRecord(init.headers), ...headers };
    return requestWithCsrf<T>(url, { ...init, headers: undefined }, mergedHeaders);
  },

  refreshCsrf: async (): Promise<string> => {
    csrfToken = null;
    return fetchCsrfToken();
  },

  clearCsrf: () => {
    csrfToken = null;
    csrfPromise = null;
  },

  csrfHeader: async (): Promise<Record<string, string>> => withCsrfHeaders(),
};
