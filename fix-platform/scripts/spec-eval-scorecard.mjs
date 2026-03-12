#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_INPUT = 'e2e/spec-eval-results.json';
const DEFAULT_OUTPUT = 'e2e/spec-eval-scorecard.json';

function parseArgs(argv) {
  const args = { input: DEFAULT_INPUT, output: DEFAULT_OUTPUT };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input') args.input = argv[++i] ?? DEFAULT_INPUT;
    if (arg === '--output') args.output = argv[++i] ?? DEFAULT_OUTPUT;
  }
  return args;
}

function walkSuites(suites, cb) {
  for (const suite of suites ?? []) {
    if (Array.isArray(suite.specs)) {
      for (const spec of suite.specs) cb(spec);
    }
    if (Array.isArray(suite.suites)) {
      walkSuites(suite.suites, cb);
    }
  }
}

function normalizeStatus(test) {
  const resultStatuses = (test.results ?? []).map((r) => r.status);
  if (resultStatuses.includes('failed') || resultStatuses.includes('timedOut')) return 'failed';
  if (resultStatuses.includes('passed')) return 'passed';
  if (resultStatuses.every((s) => s === 'skipped')) return 'skipped';
  if (test.status === 'skipped') return 'skipped';
  if (test.status === 'expected' || test.status === 'passed') return 'passed';
  if (test.status === 'unexpected' || test.status === 'flaky') return 'failed';
  return 'unknown';
}

function firstErrorMessage(test) {
  for (const result of test.results ?? []) {
    const err = result.error?.message ?? result.error?.value;
    if (err) return String(err).split('\n')[0];
  }
  return null;
}

function sectionFromTitle(title) {
  const match = title.match(/^\[(\d+\.\d+)\]\s+/);
  return match ? match[1] : null;
}

function featureFromTitle(title) {
  return title
    .replace(/^\[\d+\.\d+\]\s+/, '')
    .replace(/\s+is functionally reachable\s+@spec-eval$/, '')
    .trim();
}

function makeBucket() {
  return { total: 0, passed: 0, failed: 0, skipped: 0, cases: [] };
}

function finalizeBucket(bucket) {
  const passRate = bucket.total === 0 ? 0 : Number(((bucket.passed / bucket.total) * 100).toFixed(1));
  return { ...bucket, passRate };
}

async function main() {
  const { input, output } = parseArgs(process.argv);
  const raw = await fs.readFile(input, 'utf8');
  const report = JSON.parse(raw);
  const runErrors = (report.errors ?? []).map((error) => ({
    message: String(error.message ?? '').split('\n')[0],
    file: error.location?.file ?? null,
    line: error.location?.line ?? null,
    column: error.location?.column ?? null,
  }));

  const sections = new Map();
  const unmapped = [];
  let total = 0;
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  walkSuites(report.suites, (spec) => {
    const title = spec.title ?? '';
    const isSpecEval = title.includes('@spec-eval');
    if (!isSpecEval) return;

    const section = sectionFromTitle(title);
    const feature = featureFromTitle(title);

    for (const test of spec.tests ?? []) {
      const status = normalizeStatus(test);
      const project = test.projectName ?? 'default';
      const error = firstErrorMessage(test);
      const entry = { title, feature, section, project, status, error };

      total += 1;
      if (status === 'passed') passed += 1;
      else if (status === 'skipped') skipped += 1;
      else failed += 1;

      if (!section) {
        unmapped.push(entry);
        continue;
      }

      if (!sections.has(section)) {
        sections.set(section, makeBucket());
      }
      const bucket = sections.get(section);
      bucket.total += 1;
      if (status === 'passed') bucket.passed += 1;
      else if (status === 'skipped') bucket.skipped += 1;
      else bucket.failed += 1;
      bucket.cases.push(entry);
    }
  });

  const orderedSections = [...sections.keys()]
    .sort((a, b) => Number(a) - Number(b))
    .map((section) => ({
      section,
      ...finalizeBucket(sections.get(section)),
    }));

  const scorecard = {
    generatedAt: new Date().toISOString(),
    sourceReport: path.normalize(input),
    summary: {
      total,
      passed,
      failed,
      skipped,
      frameworkErrors: runErrors.length,
      passRate: total === 0 ? 0 : Number(((passed / total) * 100).toFixed(1)),
    },
    sections: orderedSections,
    unmapped,
    runErrors,
  };

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, `${JSON.stringify(scorecard, null, 2)}\n`, 'utf8');

  console.log(`Wrote spec-eval scorecard: ${output}`);
  console.log(
    `Spec-eval summary: ${scorecard.summary.passed}/${scorecard.summary.total} passed (${scorecard.summary.passRate}%). Framework errors: ${scorecard.summary.frameworkErrors}.`,
  );
}

main().catch((err) => {
  console.error(`Failed to build spec-eval scorecard: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
