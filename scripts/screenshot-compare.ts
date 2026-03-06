/**
 * Playwright-based screenshot comparison script.
 *
 * Workflow:
 *   1. Creates the test user (via test-user.ts create logic)
 *   2. Launches a headless browser
 *   3. Logs in via the login form at /login
 *   4. Takes screenshots of: / (dashboard), /metrics, /admin
 *   5. Deletes the test user (cleanup)
 *   6. Prints the paths of all saved screenshots
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." npx tsx scripts/screenshot-compare.ts
 *   OUT_DIR=/tmp/screenshots DATABASE_URL="postgresql://..." npx tsx scripts/screenshot-compare.ts
 *
 * Output screenshots go to $TMPDIR/<timestamp>/ or OUT_DIR if set.
 */

import { chromium, type Browser, type Page } from 'playwright';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import * as path from 'path';
import * as fs from 'fs';

const TEST_USERNAME = process.env.TEST_USER ?? 'test-admin';
const TEST_PASSWORD = process.env.TEST_PASS ?? 'test-admin-pass-2026';
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const TMPDIR = process.env.TMPDIR ?? '/private/tmp/claude-501';
const OUT_DIR = process.env.OUT_DIR ?? path.join(TMPDIR, `screenshots-${Date.now()}`);

const prisma = new PrismaClient();

async function ensureTestUser(): Promise<void> {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  await prisma.user.upsert({
    where: { username: TEST_USERNAME },
    update: { passwordHash, role: 'ADMIN' },
    create: { username: TEST_USERNAME, passwordHash, role: 'ADMIN' },
  });
  console.log(`Test user ready: ${TEST_USERNAME}`);
}

async function cleanupTestUser(): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { username: TEST_USERNAME } });
  if (existing) {
    await prisma.user.delete({ where: { username: TEST_USERNAME } });
    console.log(`Test user "${TEST_USERNAME}" cleaned up.`);
  }
}

async function loginWithForm(page: Page): Promise<void> {
  console.log('Navigating to login page...');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  // Fill username
  await page.fill('input[type="text"]', TEST_USERNAME);
  // Fill password
  await page.fill('input[type="password"]', TEST_PASSWORD);
  // Click submit
  await page.click('button[type="submit"]');

  // Wait for navigation away from login
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });
  console.log(`Logged in. Current URL: ${page.url()}`);
}

async function takeScreenshot(page: Page, urlPath: string, filename: string): Promise<string> {
  const fullUrl = `${BASE_URL}${urlPath}`;
  console.log(`Navigating to ${fullUrl}...`);
  await page.goto(fullUrl, { waitUntil: 'domcontentloaded' });
  // Wait 3s for content to render (charts, SSE data, etc.)
  await page.waitForTimeout(3000);

  const outputPath = path.join(OUT_DIR, filename);
  await page.screenshot({ path: outputPath, fullPage: true });
  console.log(`Screenshot saved: ${outputPath}`);
  return outputPath;
}

async function main(): Promise<void> {
  // Ensure output directory exists
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Output directory: ${OUT_DIR}`);

  let browser: Browser | null = null;
  const savedScreenshots: string[] = [];

  try {
    // Step 1: Create/ensure test user exists
    await ensureTestUser();

    // Step 2: Launch browser
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();

    // Step 3: Log in via the login form
    await loginWithForm(page);

    // Step 4: Take screenshots of target pages
    const pages = [
      { path: '/', filename: 'dashboard.png' },
      { path: '/metrics', filename: 'metrics.png' },
      { path: '/admin', filename: 'admin.png' },
    ];

    for (const { path: urlPath, filename } of pages) {
      const screenshotPath = await takeScreenshot(page, urlPath, filename);
      savedScreenshots.push(screenshotPath);
    }

    await context.close();
  } finally {
    if (browser) await browser.close();

    // Step 5: Cleanup test user
    try {
      await cleanupTestUser();
    } catch (err) {
      console.warn('Warning: Failed to clean up test user:', err);
    }

    await prisma.$disconnect();
  }

  // Step 6: Print saved screenshot paths
  console.log('\n--- Screenshots saved ---');
  for (const p of savedScreenshots) {
    console.log(p);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
