// Condo Control HTTP client — cookie injection, form-encoded POSTs, 302 detection

import { BASE_URL } from "./types.js";
import { log, debug } from "./logger.js";

export type SessionExpiredCallback = () => Promise<void>;

const MAX_AUTH_RETRIES = 1;

export class CCClient {
  readonly baseUrl: string;
  private cookies: Record<string, string> = {};
  private onSessionExpired: SessionExpiredCallback | null = null;
  private preRequestHook: (() => Promise<void>) | null = null;
  private _authRetries = 0;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? BASE_URL;
  }

  setCookies(cookies: Record<string, string>): void {
    Object.assign(this.cookies, cookies);
  }

  updateCookie(name: string, value: string): void {
    this.cookies[name] = value;
  }

  getCookie(name: string): string | undefined {
    return this.cookies[name];
  }

  setSessionExpiredCallback(cb: SessionExpiredCallback): void {
    this.onSessionExpired = cb;
  }

  setPreRequestHook(hook: () => Promise<void>): void {
    this.preRequestHook = hook;
  }

  private buildCookieHeader(): string {
    return Object.entries(this.cookies)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  private baseHeaders(path?: string): Record<string, string> {
    const headers: Record<string, string> = {
      "X-Requested-With": "XMLHttpRequest",
      Cookie: this.buildCookieHeader(),
    };
    if (path) {
      headers["Origin"] = this.baseUrl;
      headers["Referer"] = `${this.baseUrl}${path}`;
    }
    return headers;
  }

  /** Parse Set-Cookie header and update stored cookies */
  extractSetCookies(headers: Headers): void {
    const setCookies = headers.getSetCookie?.() ?? [];
    for (const sc of setCookies) {
      const match = sc.match(/^([^=]+)=([^;]*)/);
      if (match) {
        this.cookies[match[1]] = match[2];
      }
    }
  }

  /** Detect if response indicates session death (redirect to login page) */
  private isSessionDead(response: Response, body?: string, path?: string): boolean {
    const location = response.headers.get("location");

    // Only treat redirects as session death if they point to the login page.
    // Other redirects (e.g. /Error/invalid-address) are application errors, not auth failures.
    if (response.status === 302 || response.status === 301) {
      if (location && /\/login/i.test(location)) {
        log(`[http] Session dead detected: ${response.status} redirect to ${location}${path ? ` for ${path}` : ""}`);
        return true;
      }
      debug(`[http] Non-login redirect: ${response.status} → ${location ?? "no location"}${path ? ` for ${path}` : ""}`);
      return false;
    }
    if (location && /\/login/i.test(location)) {
      log(`[http] Session dead detected: location header points to login (${location})${path ? ` for ${path}` : ""}`);
      return true;
    }
    if (body) {
      // Login form in body
      if (/<form[^>]+action="[^"]*login/i.test(body)) {
        log(`[http] Session dead detected: login form found in body${path ? ` for ${path}` : ""}`);
        return true;
      }
      // Full HTML page returned for an AJAX/JSON endpoint = session/auth redirect.
      // A JSON endpoint should NEVER return a full HTML page under normal operation.
      if (/^\s*<!DOCTYPE/i.test(body)) {
        log(`[http] Session dead detected: full HTML page returned from JSON endpoint${path ? ` for ${path}` : ""} — first 200 chars: ${body.slice(0, 200).replace(/\n/g, " ")}`);
        return true;
      }
    }
    return false;
  }

  /** Throw if response is a non-login redirect (application error, not auth) */
  private throwOnRedirect(response: Response, path: string): void {
    if (response.status === 301 || response.status === 302) {
      const location = response.headers.get("location") ?? "unknown";
      throw new Error(
        `${response.status} redirect to ${location} for ${path}. ` +
        `The server rejected this request (not an auth issue).`
      );
    }
  }

  private async handleSessionDeath(): Promise<void> {
    if (this._authRetries >= MAX_AUTH_RETRIES) {
      this._authRetries = 0;
      throw new Error(
        "Session expired after re-auth. Cookies may be invalid — run `npm run login` manually."
      );
    }

    if (this.onSessionExpired) {
      await this.onSessionExpired();
    } else {
      throw new Error(
        "Session expired. Run `npm run login` to refresh cookies."
      );
    }
  }

  /** GET request returning parsed JSON */
  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    debug(`[http] get() called: path=${path} params=${JSON.stringify(params)}`);
    if (this.preRequestHook) {
      debug("[http] Running pre-request hook");
      await this.preRequestHook();
      debug("[http] Pre-request hook complete");
    }
    let url = `${this.baseUrl}${path}`;
    if (params) {
      const qs = new URLSearchParams(params).toString();
      url += (url.includes("?") ? "&" : "?") + qs;
    }

    const fullPath = params
      ? `${path}?${new URLSearchParams(params).toString()}`
      : path;

    const headers = this.baseHeaders();
    debug(`[http] GET ${url} headers=${JSON.stringify(headers)}`);

    const response = await fetch(url, {
      method: "GET",
      headers,
      redirect: "manual",
    });

    debug(`[http] GET ${fullPath} → status=${response.status} statusText=${response.statusText} location=${response.headers.get("location") ?? "none"}`);

    if (this.isSessionDead(response, undefined, path)) {
      log(`[http] Retrying GET ${fullPath} after re-auth (attempt ${this._authRetries + 1})`);
      await this.handleSessionDeath();
      // Retry once after re-auth
      this._authRetries++;
      return this.get<T>(path, params);
    }
    this.throwOnRedirect(response, fullPath);

    this.extractSetCookies(response.headers);

    const text = await response.text();
    const contentType = response.headers.get("content-type") ?? "unknown";
    log(`[http] ${response.status} ${response.statusText || "OK"} ${path} (${text.length} bytes, content-type: ${contentType})`);
    debug(`[http] GET ${fullPath} body preview: ${text.slice(0, 500)}`);

    if (this.isSessionDead(response, text, path)) {
      log(`[http] Retrying GET ${fullPath} after re-auth (attempt ${this._authRetries + 1})`);
      await this.handleSessionDeath();
      this._authRetries++;
      return this.get<T>(path, params);
    }

    this._authRetries = 0;

    try {
      const parsed = JSON.parse(text) as T;
      debug(`[http] GET ${fullPath} parsed JSON keys: ${typeof parsed === "object" && parsed !== null ? Object.keys(parsed as Record<string, unknown>).join(", ") : typeof parsed}`);
      return parsed;
    } catch {
      log(`[http] JSON parse failed for ${path} — response was: ${text.slice(0, 300)}`);
      throw new Error(
        `Failed to parse JSON from ${path}: ${text.slice(0, 200)}`
      );
    }
  }

  /** GET request returning raw text (for HTML responses) */
  async getText(path: string, params?: Record<string, string>): Promise<string> {
    if (this.preRequestHook) await this.preRequestHook();
    let url = `${this.baseUrl}${path}`;
    if (params) {
      const qs = new URLSearchParams(params).toString();
      url += (url.includes("?") ? "&" : "?") + qs;
    }

    const fullPath = params
      ? `${path}?${new URLSearchParams(params).toString()}`
      : path;

    log(`[http] GET ${fullPath}`);

    const response = await fetch(url, {
      method: "GET",
      headers: this.baseHeaders(),
      redirect: "manual",
    });

    if (this.isSessionDead(response, undefined, path)) {
      log(`[http] Retrying GET ${fullPath} after re-auth (attempt ${this._authRetries + 1})`);
      await this.handleSessionDeath();
      this._authRetries++;
      return this.getText(path, params);
    }
    this.throwOnRedirect(response, fullPath);

    this.extractSetCookies(response.headers);
    const text = await response.text();
    const contentType = response.headers.get("content-type") ?? "unknown";
    log(`[http] ${response.status} ${response.statusText || "OK"} ${path} (${text.length} bytes, content-type: ${contentType})`);

    if (this.isSessionDead(response, text, path)) {
      log(`[http] Retrying GET ${fullPath} after re-auth (attempt ${this._authRetries + 1})`);
      await this.handleSessionDeath();
      this._authRetries++;
      return this.getText(path, params);
    }

    this._authRetries = 0;
    return text;
  }

  /** POST request with form-urlencoded body returning parsed JSON */
  async post<T>(path: string, body: Record<string, string>): Promise<T> {
    debug(`[http] post() called: path=${path} bodyKeys=${Object.keys(body).join(", ")}`);
    if (this.preRequestHook) {
      debug("[http] Running pre-request hook");
      await this.preRequestHook();
      debug("[http] Pre-request hook complete");
    }
    const url = `${this.baseUrl}${path}`;

    const headers = {
      ...this.baseHeaders(path),
      "Content-Type": "application/x-www-form-urlencoded",
    };
    const encodedBody = new URLSearchParams(body).toString();
    debug(`[http] POST ${url} headers=${JSON.stringify(headers)} body=${encodedBody.slice(0, 500)}`);

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: encodedBody,
      redirect: "manual",
    });

    debug(`[http] POST ${path} → status=${response.status} statusText=${response.statusText} location=${response.headers.get("location") ?? "none"}`);

    if (this.isSessionDead(response, undefined, path)) {
      log(`[http] Retrying POST ${path} after re-auth (attempt ${this._authRetries + 1})`);
      await this.handleSessionDeath();
      this._authRetries++;
      return this.post<T>(path, body);
    }
    this.throwOnRedirect(response, path);

    this.extractSetCookies(response.headers);

    const text = await response.text();
    const contentType = response.headers.get("content-type") ?? "unknown";
    log(`[http] ${response.status} ${response.statusText || "OK"} ${path} (${text.length} bytes, content-type: ${contentType})`);
    debug(`[http] POST ${path} body preview: ${text.slice(0, 500)}`);

    if (this.isSessionDead(response, text, path)) {
      log(`[http] Retrying POST ${path} after re-auth (attempt ${this._authRetries + 1})`);
      await this.handleSessionDeath();
      this._authRetries++;
      return this.post<T>(path, body);
    }

    this._authRetries = 0;

    try {
      const parsed = JSON.parse(text) as T;
      debug(`[http] POST ${path} parsed JSON keys: ${typeof parsed === "object" && parsed !== null ? Object.keys(parsed as Record<string, unknown>).join(", ") : typeof parsed}`);
      return parsed;
    } catch {
      log(`[http] JSON parse failed for POST ${path} — response was: ${text.slice(0, 300)}`);
      throw new Error(
        `Failed to parse JSON from POST ${path}: ${text.slice(0, 200)}`
      );
    }
  }

  /** Cookie refresh — GET /login/refresh-cookie-no-redirect */
  async refreshCookie(): Promise<boolean> {
    try {
      const refreshPath = "/login/refresh-cookie-no-redirect";
      const url = `${this.baseUrl}${refreshPath}`;
      debug(`[http] refreshCookie() → GET ${url}`);
      debug(`[http] refreshCookie() cookies: ${this.buildCookieHeader().slice(0, 200)}`);
      const response = await fetch(url, {
        method: "GET",
        headers: this.baseHeaders(),
        redirect: "manual",
      });

      debug(`[http] refreshCookie() → status=${response.status} location=${response.headers.get("location") ?? "none"} set-cookie=${(response.headers.getSetCookie?.() ?? []).join("; ").slice(0, 200)}`);

      if (this.isSessionDead(response, undefined, refreshPath)) {
        debug("[http] refreshCookie() → session dead");
        return false;
      }

      this.extractSetCookies(response.headers);
      debug("[http] refreshCookie() → success");
      return true;
    } catch (err) {
      log(`[http] Cookie refresh failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }
}
