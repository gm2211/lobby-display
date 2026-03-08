#!/usr/bin/env node

/**
 * platform-browse-and-capture.mjs
 *
 * Interactive capture tool for platform page debugging on staging.
 *
 * What it does:
 *   1. Launches a visible Chrome browser (Playwright Chromium)
 *   2. Opens the staging site — you log in and browse around
 *   3. Silently captures ALL API traffic (requests + JSON response bodies)
 *   4. Takes a screenshot every time you navigate to a new page
 *   5. Captures all console errors and warnings
 *   6. On Ctrl+C: saves everything to a timestamped folder
 *
 * Usage:
 *   node scripts/platform-browse-and-capture.mjs
 *   node scripts/platform-browse-and-capture.mjs --output ./my-captures
 *   E2E_BASE_URL=http://localhost:3000 node scripts/platform-browse-and-capture.mjs
 *
 * Output (in $TMPDIR/platform-capture/<timestamp>/):
 *   traffic.json        — all captured API requests with response bodies
 *   screenshots/        — auto-captured PNGs on each page navigation
 *   console-errors.json — all console errors and warnings
 *   summary.txt         — endpoint summary table
 *
 * Give the output folder to Claude for analysis.
 */

import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "fs";
import { join, extname } from "path";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const BASE_URL =
  process.env.E2E_BASE_URL ||
  "https://seven7-hudson-staging.onrender.com";

const HOST = new URL(BASE_URL).hostname;

const STATIC_EXT = new Set([
  ".css", ".js", ".png", ".jpg", ".jpeg", ".gif", ".svg",
  ".woff", ".woff2", ".ttf", ".ico", ".map", ".less", ".mjs",
]);

// ---------------------------------------------------------------------------
// Parse args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const timestamp = new Date()
  .toISOString()
  .replace(/[:.]/g, "-")
  .replace("T", "_")
  .slice(0, 19);

let outputDir;
const outputIdx = args.indexOf("--output");
if (outputIdx !== -1 && args[outputIdx + 1]) {
  outputDir = args[outputIdx + 1];
} else {
  const baseDir = join(process.env.TMPDIR || "/tmp", "platform-capture");
  outputDir = join(baseDir, timestamp);
}

const screenshotDir = join(outputDir, "screenshots");

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const traffic = [];
const consoleErrors = [];
let screenshotCount = 0;
let lastUrl = "";
const pageUrls = new Set();
let pendingScreenshot = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function shouldCapture(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes(HOST)) return false;
    const ext = extname(u.pathname).toLowerCase();
    if (STATIC_EXT.has(ext)) return false;
    // Skip Vite HMR and dev assets
    if (u.pathname.startsWith("/@") || u.pathname.startsWith("/node_modules/")) return false;
    return true;
  } catch {
    return false;
  }
}

function slugify(url) {
  try {
    const u = new URL(url);
    return u.pathname
      .replace(/^\//, "")
      .replace(/[\/\?&#=.]/g, "_")
      .replace(/_+/g, "_")
      .replace(/_$/, "")
      .substring(0, 80) || "root";
  } catch {
    return "page";
  }
}

function save() {
  mkdirSync(outputDir, { recursive: true });
  mkdirSync(screenshotDir, { recursive: true });

  // Save traffic
  writeFileSync(join(outputDir, "traffic.json"), JSON.stringify(traffic, null, 2));

  // Save console errors
  writeFileSync(join(outputDir, "console-errors.json"), JSON.stringify(consoleErrors, null, 2));

  // Build summary
  const endpointMap = new Map();
  for (const req of traffic) {
    let pattern;
    try {
      const u = new URL(req.url);
      pattern = `${u.origin}${u.pathname}`;
    } catch {
      pattern = req.url;
    }
    const key = `${req.method}::${pattern}::${req.status || "?"}`;
    const existing = endpointMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      endpointMap.set(key, {
        method: req.method,
        url: pattern,
        status: req.status || "?",
        contentType: (req.contentType || "").split(";")[0].trim(),
        hasBody: !!req.responseBody,
        count: 1,
      });
    }
  }

  const sorted = [...endpointMap.values()].sort((a, b) => b.count - a.count);

  // Separate failing endpoints
  const failures = sorted.filter(s => s.status >= 400);
  const successes = sorted.filter(s => s.status < 400);

  const lines = [
    `Platform Capture: ${timestamp}`,
    `Target: ${BASE_URL}`,
    `Total requests captured: ${traffic.length}`,
    `Unique endpoints: ${sorted.length}`,
    `Screenshots: ${screenshotCount}`,
    `Pages visited: ${pageUrls.size}`,
    `Console errors: ${consoleErrors.filter(e => e.type === "error" || e.type === "pageerror").length}`,
    `Console warnings: ${consoleErrors.filter(e => e.type === "warning").length}`,
    "",
  ];

  if (failures.length > 0) {
    lines.push("=== FAILING ENDPOINTS (4xx/5xx) ===");
    lines.push("");
    lines.push(
      `${"#".padEnd(5)} ${"METHOD".padEnd(7)} ${"STATUS".padEnd(7)} ${"BODY?".padEnd(6)} ${"TYPE".padEnd(25)} URL`
    );
    lines.push("-".repeat(120));
    for (const s of failures) {
      lines.push(
        `${String(s.count).padEnd(5)} ${s.method.padEnd(7)} ${String(s.status).padEnd(7)} ${(s.hasBody ? "YES" : "no").padEnd(6)} ${s.contentType.padEnd(25)} ${s.url}`
      );
    }
    lines.push("");
  }

  lines.push("=== ALL ENDPOINTS ===");
  lines.push("");
  lines.push(
    `${"#".padEnd(5)} ${"METHOD".padEnd(7)} ${"STATUS".padEnd(7)} ${"BODY?".padEnd(6)} ${"TYPE".padEnd(25)} URL`
  );
  lines.push("-".repeat(120));
  for (const s of sorted) {
    lines.push(
      `${String(s.count).padEnd(5)} ${s.method.padEnd(7)} ${String(s.status).padEnd(7)} ${(s.hasBody ? "YES" : "no").padEnd(6)} ${s.contentType.padEnd(25)} ${s.url}`
    );
  }

  if (consoleErrors.length > 0) {
    lines.push("");
    lines.push("=== CONSOLE ERRORS ===");
    lines.push("");
    for (const e of consoleErrors.filter(e => e.type === "error" || e.type === "pageerror")) {
      lines.push(`[${e.type}] ${e.pageUrl || ""}`);
      lines.push(`  ${e.text.substring(0, 200)}`);
      lines.push("");
    }
  }

  writeFileSync(join(outputDir, "summary.txt"), lines.join("\n") + "\n");
  return sorted.length;
}

// ---------------------------------------------------------------------------
// Debounced screenshot after API activity
// ---------------------------------------------------------------------------
function scheduleApiScreenshot(page, reason) {
  if (pendingScreenshot) clearTimeout(pendingScreenshot);
  pendingScreenshot = setTimeout(async () => {
    pendingScreenshot = null;
    try {
      const currentUrl = page.url();
      const slug = slugify(currentUrl);
      const name = `${String(screenshotCount + 1).padStart(3, "0")}-${slug}.png`;
      await page.screenshot({ path: join(screenshotDir, name), fullPage: true });
      screenshotCount++;
      console.log(`  [screenshot] ${name} (${reason})`);
    } catch {}
  }, 800);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("================================================================");
  console.log("  Platform Browse & Capture");
  console.log("================================================================");
  console.log("");
  console.log("  1. A Chrome window will open");
  console.log("  2. Log in to the platform");
  console.log("  3. Browse around — visit every platform page you want checked");
  console.log("  4. Press Ctrl+C in this terminal when done");
  console.log("");
  console.log(`  Target:  ${BASE_URL}`);
  console.log(`  Output:  ${outputDir}`);
  console.log("");
  console.log("================================================================");
  console.log("");

  // Launch visible browser
  const profileDir = join(process.env.TMPDIR || "/tmp", "platform-capture-profile");
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1440, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const page = context.pages()[0] || (await context.newPage());

  // Ensure output dirs exist
  mkdirSync(screenshotDir, { recursive: true });

  // -------------------------------------------------------------------
  // Network capture via route interception
  // -------------------------------------------------------------------
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = request.url();
    const method = request.method();

    // Always continue the request
    const response = await route.fetch().catch(() => null);
    if (!response) {
      await route.continue().catch(() => {});
      return;
    }

    await route.fulfill({ response }).catch(() => {});

    // Capture if it matches our filter
    if (shouldCapture(url)) {
      const entry = {
        url,
        method,
        postData: request.postData() || null,
        status: response.status(),
        contentType: response.headers()["content-type"] || "",
        ts: Date.now(),
        responseBody: null,
      };

      // Try to capture JSON response bodies
      const ct = (entry.contentType || "").toLowerCase();
      if (ct.includes("json") || ct.includes("text/html")) {
        try {
          const body = await response.text();
          if (body.length < 2 * 1024 * 1024) {
            if (ct.includes("json")) {
              entry.responseBody = body;
            }
          }
        } catch {}
      }

      traffic.push(entry);
      const shortUrl = url.length > 100 ? url.substring(0, 100) + "..." : url;
      const statusIcon = entry.status >= 400 ? "!!" : "  ";
      console.log(`  ${statusIcon} [${method}] ${entry.status} ${shortUrl}`);

      // Screenshot after significant data loads
      if (entry.responseBody && entry.status === 200) {
        const isJsonData = ct.includes("json") && entry.responseBody.length > 50;
        if (isJsonData) {
          scheduleApiScreenshot(page, "data-load");
        }
      }
    }
  });

  // -------------------------------------------------------------------
  // Console error capture
  // -------------------------------------------------------------------
  page.on("console", (msg) => {
    const type = msg.type();
    if (type === "error" || type === "warning") {
      const entry = {
        type,
        text: msg.text(),
        pageUrl: page.url(),
        ts: Date.now(),
      };
      consoleErrors.push(entry);
      if (type === "error") {
        console.log(`  ** [console.${type}] ${msg.text().substring(0, 120)}`);
      }
    }
  });

  page.on("pageerror", (err) => {
    const entry = {
      type: "pageerror",
      text: err.message || String(err),
      stack: err.stack || null,
      pageUrl: page.url(),
      ts: Date.now(),
    };
    consoleErrors.push(entry);
    console.log(`  ** [pageerror] ${entry.text.substring(0, 120)}`);
  });

  // -------------------------------------------------------------------
  // Auto-screenshot on navigation
  // -------------------------------------------------------------------
  page.on("load", async () => {
    const currentUrl = page.url();
    if (currentUrl === lastUrl) return;

    lastUrl = currentUrl;
    pageUrls.add(currentUrl);

    // Wait for dynamic content
    await new Promise((r) => setTimeout(r, 1500));

    const name = `${String(screenshotCount + 1).padStart(3, "0")}-${slugify(currentUrl)}.png`;
    try {
      await page.screenshot({ path: join(screenshotDir, name), fullPage: true });
      screenshotCount++;
      console.log(`  [screenshot] ${name}`);
    } catch (e) {
      console.log(`  [screenshot failed] ${e.message}`);
    }
  });

  // SPA-style navigation detection (URL change without full page load)
  const urlCheckInterval = setInterval(async () => {
    try {
      const currentUrl = page.url();
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        pageUrls.add(currentUrl);
        await new Promise((r) => setTimeout(r, 1000));
        const name = `${String(screenshotCount + 1).padStart(3, "0")}-${slugify(currentUrl)}.png`;
        await page.screenshot({ path: join(screenshotDir, name), fullPage: true });
        screenshotCount++;
        console.log(`  [screenshot] ${name}`);
      }
    } catch {}
  }, 1500);

  // -------------------------------------------------------------------
  // Navigate to staging
  // -------------------------------------------------------------------
  console.log(`Opening ${BASE_URL} ...\n`);
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });

  // -------------------------------------------------------------------
  // Periodic save (every 30s)
  // -------------------------------------------------------------------
  const saveInterval = setInterval(() => {
    if (traffic.length > 0 || consoleErrors.length > 0) {
      save();
      console.log(
        `  [auto-save] ${traffic.length} requests, ${screenshotCount} screenshots, ${consoleErrors.length} console entries`
      );
    }
  }, 30000);

  // -------------------------------------------------------------------
  // Ctrl+C handler
  // -------------------------------------------------------------------
  const cleanup = async () => {
    clearInterval(saveInterval);
    clearInterval(urlCheckInterval);

    // Take one final screenshot
    try {
      const name = `${String(screenshotCount + 1).padStart(3, "0")}-final-state.png`;
      await page.screenshot({ path: join(screenshotDir, name), fullPage: true });
      screenshotCount++;
    } catch {}

    const endpointCount = save();

    console.log("\n");
    console.log("================================================================");
    console.log("  Capture Complete");
    console.log("================================================================");
    console.log(`  Requests captured: ${traffic.length}`);
    console.log(`  Unique endpoints:  ${endpointCount}`);
    console.log(`  Screenshots:       ${screenshotCount}`);
    console.log(`  Pages visited:     ${pageUrls.size}`);
    console.log(`  Console errors:    ${consoleErrors.filter(e => e.type === "error" || e.type === "pageerror").length}`);
    console.log(`  Console warnings:  ${consoleErrors.filter(e => e.type === "warning").length}`);
    console.log("----------------------------------------------------------------");
    console.log(`  Output: ${outputDir}`);
    console.log("");
    console.log("  Files:");
    console.log("    traffic.json        — API requests + response bodies");
    console.log("    screenshots/        — page screenshots (PNG)");
    console.log("    console-errors.json — console errors and warnings");
    console.log("    summary.txt         — endpoint summary table");
    console.log("");
    console.log("  Give this folder to Claude for analysis.");
    console.log("================================================================");

    await context.close().catch(() => {});
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  // Keep running
  console.log("Recording... Press Ctrl+C to stop and save.\n");
  await new Promise(() => {});
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
