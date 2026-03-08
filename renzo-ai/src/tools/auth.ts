// Condo Control auth — cookie loading, 4-min refresh loop, Playwright fallback
// NEVER calls process.exit — throws errors that tools surface gracefully

import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";
import type { CCClient } from "./client.js";
import type { PlaywrightCookie } from "./types.js";
import { log, debug } from "./logger.js";

const KEYCHAIN_SERVICE = "condo-control";

const AUTH_DIR = path.resolve(process.cwd(), ".auth");
const COOKIES_FILE = path.join(AUTH_DIR, "cookies.json");
const REFRESH_INTERVAL_MS = 4 * 60 * 1000; // 4 minutes

/** Read a password from macOS Keychain. Returns null if not found. */
function readKeychain(account: string): string | null {
  try {
    const value = execFileSync(
      "security",
      ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", account, "-w"],
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    );
    return value.trim();
  } catch {
    return null;
  }
}

/** Get CC credentials: Keychain first, then env vars */
function getCredentials(): { email: string; password: string } | null {
  // Try macOS Keychain
  const kcEmail = readKeychain("email");
  const kcPassword = readKeychain("password");
  if (kcEmail && kcPassword) {
    log("[auth] Credentials loaded from macOS Keychain");
    return { email: kcEmail, password: kcPassword };
  }

  // Fall back to env vars
  const email = process.env.CC_EMAIL;
  const password = process.env.CC_PASSWORD;
  if (email && password) {
    log("[auth] Credentials loaded from env vars");
    return { email, password };
  }

  return null;
}

let refreshTimer: ReturnType<typeof setInterval> | null = null;
let reAuthInProgress = false;
let reAuthPromise: Promise<void> | null = null;
let lastAuthSuccess = 0; // Date.now() of last successful auth event
let consecutiveRefreshFailures = 0;
let lastReAuthAttempt = 0;

const STALENESS_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
const MAX_REFRESH_FAILURES = 2;
const REAUTH_COOLDOWN_MS = 30_000;

/** Record a successful auth event (refresh or full re-auth) */
function recordAuthSuccess(): void {
  lastAuthSuccess = Date.now();
  consecutiveRefreshFailures = 0;
}

/**
 * Pre-request freshness check. Cheap timestamp comparison — only triggers
 * network activity (Playwright re-auth) when auth is stale.
 */
export async function ensureFresh(client: CCClient): Promise<void> {
  if (lastAuthSuccess === 0) {
    debug("[auth] ensureFresh(): no prior auth — skipping");
    return;
  }
  const age = Date.now() - lastAuthSuccess;
  debug(`[auth] ensureFresh(): age=${Math.round(age / 1000)}s threshold=${STALENESS_THRESHOLD_MS / 1000}s`);
  if (age < STALENESS_THRESHOLD_MS) return;
  log(`[auth] Session stale (last success ${Math.round(age / 1000)}s ago) — proactive re-auth`);
  await handleSessionExpired(client);
}

/** Load cookies from .auth/cookies.json (Playwright export format) */
export function loadCookies(client: CCClient): boolean {
  debug(`[auth] loadCookies() path=${COOKIES_FILE}`);
  if (!fs.existsSync(COOKIES_FILE)) {
    log(`[auth] Cookie file not found: ${COOKIES_FILE}`);
    return false;
  }

  let cookies: PlaywrightCookie[];
  try {
    const raw = fs.readFileSync(COOKIES_FILE, "utf-8");
    debug(`[auth] Cookie file raw length: ${raw.length} bytes`);
    cookies = JSON.parse(raw) as PlaywrightCookie[];
    debug(`[auth] Parsed ${cookies.length} cookies from file: ${cookies.map(c => `${c.name}@${c.domain}`).join(", ")}`);
  } catch (err) {
    log(`[auth] Failed to read/parse cookie file: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }

  const ccCookie = cookies.find((c) => c.name === "CCCookie");
  const sessionId = cookies.find((c) => c.name === "ASP.NET_SessionId");

  if (!ccCookie || !sessionId) {
    debug(`[auth] CCCookie=${ccCookie ? "present" : "MISSING"} ASP.NET_SessionId=${sessionId ? "present" : "MISSING"}`);
    log("[auth] CCCookie or ASP.NET_SessionId missing from cookies.json");
    return false;
  }

  // Pass ALL relevant cookies — condocontrol.com cookies for real mode,
  // or localhost cookies for mock mode. Accept all if domain is localhost.
  const cookieMap: Record<string, string> = {};
  for (const cookie of cookies) {
    if (cookie.domain.includes("condocontrol") || cookie.domain === "localhost") {
      cookieMap[cookie.name] = cookie.value;
    }
  }

  client.setCookies(cookieMap);
  const cookieNames = Object.keys(cookieMap).join(", ");
  log(`[auth] Loaded ${Object.keys(cookieMap).length} cookies: ${cookieNames}`);
  debug(`[auth] Cookie values: ${Object.entries(cookieMap).map(([k, v]) => `${k}=${v.slice(0, 20)}...`).join(", ")}`);
  return true;
}

/** Validate session on startup — refresh cookie and re-auth if stale */
export async function validateSession(client: CCClient): Promise<void> {
  log("[auth] Validating session...");
  const ok = await client.refreshCookie();
  if (ok) {
    recordAuthSuccess();
    log("[auth] Session is valid");
    return;
  }

  log("[auth] Session is stale — attempting re-auth...");
  await handleSessionExpired(client);
}

/** Start the 4-minute cookie refresh loop */
export function startRefreshLoop(client: CCClient): void {
  if (refreshTimer) return;

  refreshTimer = setInterval(async () => {
    log("[auth] Refreshing CCCookie...");
    const ok = await client.refreshCookie();
    if (ok) {
      recordAuthSuccess();
      log("[auth] CCCookie refreshed successfully");
      return;
    }

    consecutiveRefreshFailures++;
    log(`[auth] CCCookie refresh failed (${consecutiveRefreshFailures} consecutive)`);

    if (consecutiveRefreshFailures >= MAX_REFRESH_FAILURES) {
      log("[auth] Too many refresh failures — triggering proactive re-auth");
      try {
        await handleSessionExpired(client);
      } catch (err) {
        log(`[auth] Proactive re-auth failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }, REFRESH_INTERVAL_MS);

  refreshTimer.unref();
  log(`[auth] Cookie refresh loop started (every ${REFRESH_INTERVAL_MS / 1000}s)`);
}

/** Stop the refresh loop */
export function stopRefreshLoop(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
    log("[auth] Cookie refresh loop stopped");
  }
}

/** Handle session expiration — try Playwright auto-login, throw on failure */
export async function handleSessionExpired(client: CCClient, { force = false } = {}): Promise<void> {
  debug(`[auth] handleSessionExpired() called: force=${force} reAuthInProgress=${reAuthInProgress} lastReAuthAttempt=${lastReAuthAttempt} timeSince=${lastReAuthAttempt ? Date.now() - lastReAuthAttempt : "never"}ms`);

  // Mutex: if re-auth is already in flight, await the existing promise.
  // This ensures parallel callers (e.g. get_amenity_availability's 4 concurrent
  // requests) all await the same re-auth instead of hitting the cooldown.
  if (reAuthInProgress) {
    log("[auth] Re-auth already in progress — awaiting existing attempt");
    await reAuthPromise;
    return;
  }

  // Cooldown: prevent rapid-fire re-auth attempts (checked AFTER mutex so
  // parallel callers that waited above skip this check on the shared result).
  // Skipped when force=true (explicit user request via reauthenticate tool).
  if (!force) {
    const timeSinceLastReAuth = Date.now() - lastReAuthAttempt;
    if (lastReAuthAttempt > 0 && timeSinceLastReAuth < REAUTH_COOLDOWN_MS) {
      const secondsAgo = Math.round(timeSinceLastReAuth / 1000);
      debug(`[auth] Cooldown active: ${secondsAgo}s since last attempt (threshold ${REAUTH_COOLDOWN_MS / 1000}s)`);
      throw new Error(
        `Re-auth attempted ${secondsAgo}s ago (cooldown 30s). Run \`npm run login\` manually.`
      );
    }
  } else {
    debug("[auth] Force flag set — skipping cooldown check");
  }

  reAuthInProgress = true;
  reAuthPromise = doReAuth(client);

  try {
    await reAuthPromise;
    debug("[auth] handleSessionExpired() completed successfully");
  } finally {
    reAuthInProgress = false;
    reAuthPromise = null;
  }
}

/** Detect whether the client is pointed at a local mock server */
function isMockMode(client: CCClient): boolean {
  return /^https?:\/\/localhost(:\d+)?/.test(client.baseUrl);
}

async function doReAuth(client: CCClient): Promise<void> {
  lastReAuthAttempt = Date.now();
  debug(`[auth] doReAuth() started at ${lastReAuthAttempt}, isMock=${isMockMode(client)}, baseUrl=${client.baseUrl}`);

  const creds = getCredentials();
  debug(`[auth] Credentials found: ${creds ? "yes" : "no"}`);

  if (!creds) {
    throw new Error(
      "Session expired and no credentials found. Store them with:\n" +
      `  security add-generic-password -s "${KEYCHAIN_SERVICE}" -a email -w 'your@email.com'\n` +
      `  security add-generic-password -s "${KEYCHAIN_SERVICE}" -a password -w 'yourpassword'\n` +
      "Or set CC_EMAIL + CC_PASSWORD env vars, or run `npm run login` manually."
    );
  }

  const { email, password } = creds;

  if (isMockMode(client)) {
    await doMockLogin(client, email, password);
    return;
  }

  log("[auth] Session expired — attempting Playwright auto-login...");

  // Network reachability check — fail fast if site is unreachable
  try {
    await fetch("https://app.condocontrol.com/Login", {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    throw new Error(
      `Condo Control is unreachable (${err instanceof Error ? err.message : String(err)}). ` +
      `Check your network connection and try again.`
    );
  }

  const { chromium } = await import("playwright");
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--disable-blink-features=AutomationControlled",
      ],
    });
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();

    await page.goto("https://app.condocontrol.com/Login");
    await page.fill('input[name="Username"], input#Username', email);
    await page.fill('input[name="Password"], input#Password', password);
    await page.click('button[type="submit"], input[type="submit"]');

    // Wait for navigation to dashboard
    await page.waitForURL("**/my/**", { timeout: 30000 });

    // Extract cookies
    const cookies = await context.cookies();
    await browser.close();
    browser = null;

    // Save to file for next startup
    saveCookies(cookies);

    // Reload into client
    loadCookies(client);
    recordAuthSuccess();
    log("[auth] Auto-login successful — cookies refreshed");
  } catch (err) {
    if (browser) {
      try { await browser.close(); } catch { /* ignore cleanup errors */ }
    }
    throw new Error(
      `Auto-login failed: ${err instanceof Error ? err.message : String(err)}. ` +
      `Run \`npm run login\` in the condo-control project to refresh cookies manually.`
    );
  }
}

/**
 * HTTP-based login for mock mode. POSTs form-encoded credentials to the
 * mock server's /Login endpoint, extracts Set-Cookie headers, and saves
 * them in the same Playwright cookie format used by loadCookies.
 */
async function doMockLogin(client: CCClient, email: string, password: string): Promise<void> {
  const loginUrl = `${client.baseUrl}/Login`;
  log(`[auth] Mock mode — attempting HTTP login to ${loginUrl}`);

  // Reachability check — use redirect: "manual" because the mock server
  // returns 302 for unauthenticated requests (including /Login itself),
  // which would otherwise cause an infinite redirect loop.
  try {
    debug(`[auth] Mock reachability check: HEAD ${loginUrl} (redirect: manual)`);
    const headResp = await fetch(loginUrl, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    debug(`[auth] Mock reachability check: status=${headResp.status} location=${headResp.headers.get("location") ?? "none"}`);
  } catch (err) {
    throw new Error(
      `Mock server is unreachable at ${client.baseUrl} (${err instanceof Error ? err.message : String(err)}). ` +
      `Start the mock server with: cd ~/projects/condo-control-research && npm run mock`
    );
  }

  const postBody = new URLSearchParams({ Username: email, Password: password }).toString();
  debug(`[auth] Mock login POST ${loginUrl} body=${postBody}`);

  const response = await fetch(loginUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: postBody,
    redirect: "manual",
  });

  debug(`[auth] Mock login response: status=${response.status} location=${response.headers.get("location") ?? "none"} set-cookie=${(response.headers.getSetCookie?.() ?? []).join("; ").slice(0, 300)}`);

  // Accept 200 or 302 (redirect to dashboard) as success
  if (response.status !== 200 && response.status !== 302) {
    const respText = await response.text().catch(() => "<unreadable>");
    debug(`[auth] Mock login failed body: ${respText.slice(0, 500)}`);
    throw new Error(
      `Mock login failed with status ${response.status}. ` +
      `Check that the mock server implements POST /Login.`
    );
  }

  // Extract cookies from Set-Cookie headers
  const setCookies = response.headers.getSetCookie?.() ?? [];
  debug(`[auth] Mock login Set-Cookie count: ${setCookies.length}`);
  for (const sc of setCookies) {
    debug(`[auth]   Set-Cookie: ${sc}`);
  }

  if (setCookies.length === 0) {
    throw new Error(
      "Mock login returned no Set-Cookie headers. " +
      "Check that the mock server sets CCCookie and ASP.NET_SessionId."
    );
  }

  // Parse Set-Cookie headers into Playwright cookie format for persistence
  const parsedUrl = new URL(client.baseUrl);
  const cookies: PlaywrightCookie[] = setCookies.map((sc) => {
    const [nameValue, ...parts] = sc.split(";");
    const eqIdx = nameValue.indexOf("=");
    const name = nameValue.slice(0, eqIdx).trim();
    const value = nameValue.slice(eqIdx + 1).trim();

    // Parse optional attributes
    let cookiePath = "/";
    let httpOnly = false;
    for (const part of parts) {
      const trimmed = part.trim().toLowerCase();
      if (trimmed.startsWith("path=")) cookiePath = part.trim().slice(5);
      if (trimmed === "httponly") httpOnly = true;
    }

    return {
      name,
      value,
      domain: parsedUrl.hostname,
      path: cookiePath,
      expires: -1,
      httpOnly,
      secure: false,
      sameSite: "Lax",
    };
  });

  debug(`[auth] Parsed ${cookies.length} cookies: ${cookies.map(c => c.name).join(", ")}`);
  saveCookies(cookies);

  // Reload into client
  loadCookies(client);
  recordAuthSuccess();
  log("[auth] Mock login successful — cookies saved and loaded");
}

/** Save cookies to .auth/cookies.json */
function saveCookies(cookies: PlaywrightCookie[]): void {
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }
  fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2), "utf-8");
}
