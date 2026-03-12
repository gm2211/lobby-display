#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';

const NPX_BIN = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const REPORT_CANDIDATES = ['e2e/spec-eval-results.json', 'e2e/e2e/spec-eval-results.json'];

async function firstExistingPath(paths) {
  for (const candidate of paths) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Continue until a report path exists.
    }
  }
  return null;
}

async function removeIfExists(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return;
    }
    throw error;
  }
}

function run(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      env: process.env,
      stdio: 'inherit',
    });
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

async function main() {
  // Prevent stale scorecards if Playwright exits before writing a new report.
  await Promise.all(REPORT_CANDIDATES.map((filePath) => removeIfExists(filePath)));

  const testExit = await run(NPX_BIN, [
    'playwright',
    'test',
    '--config=e2e/playwright.spec-eval.config.ts',
    '--grep',
    '@spec-eval',
  ]);

  const reportPath = await firstExistingPath(REPORT_CANDIDATES);
  if (!reportPath) {
    if (testExit !== 0) {
      process.exit(testExit);
    }
    console.error(`spec-eval report not found. Checked: ${REPORT_CANDIDATES.join(', ')}`);
    process.exit(1);
  }

  const scoreExit = await run(process.execPath, [
    'scripts/spec-eval-scorecard.mjs',
    '--input',
    reportPath,
    '--output',
    'e2e/spec-eval-scorecard.json',
  ]);

  if (testExit !== 0) {
    process.exit(testExit);
  }

  process.exit(scoreExit);
}

main().catch((err) => {
  console.error(`spec-eval runner failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
