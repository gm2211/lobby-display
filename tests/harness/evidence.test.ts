/**
 * Tests for scripts/evidence.sh
 *
 * Tests the evidence ledger system: init, record, finalize, and check subcommands.
 * These are shell-based integration tests that invoke the script directly.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync, spawnSync } from 'child_process';
import { existsSync, readFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const PROJECT_ROOT = join(import.meta.dirname, '..', '..');
const EVIDENCE_SCRIPT = join(PROJECT_ROOT, 'scripts/evidence.sh');

/**
 * Run evidence.sh with given args in a temp directory.
 * Returns { stdout, stderr, status }
 */
function runEvidence(args: string[], cwd?: string): { stdout: string; stderr: string; status: number } {
  const result = spawnSync('bash', [EVIDENCE_SCRIPT, ...args], {
    cwd: cwd ?? tmpDir,
    encoding: 'utf-8',
    env: { ...process.env, HOME: tmpDir },
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status ?? 1,
  };
}

let tmpDir: string;

beforeEach(() => {
  // Create a fresh temp dir for each test acting as project root
  tmpDir = join(tmpdir(), `evidence-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
  // Create the .harness/evidence directory structure (evidence.sh should create it, but we set up the root)
});

afterEach(() => {
  // Clean up temp directory
  if (existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe('evidence.sh script exists and is executable', () => {
  it('evidence.sh file exists', () => {
    expect(existsSync(EVIDENCE_SCRIPT)).toBe(true);
  });

  it('evidence.sh is executable', () => {
    const result = spawnSync('test', ['-x', EVIDENCE_SCRIPT]);
    expect(result.status).toBe(0);
  });

  it('shows usage when called with no args', () => {
    const result = runEvidence([]);
    // Should exit non-zero and show usage
    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toMatch(/usage|Usage|USAGE|init|record|finalize|check/i);
  });

  it('shows error for unknown subcommand', () => {
    const result = runEvidence(['unknown-command', 'test-ticket']);
    expect(result.status).not.toBe(0);
  });
});

describe('evidence init <ticket-id>', () => {
  it('creates the evidence directory and JSON file', () => {
    const result = runEvidence(['init', 'test-ticket-1'], tmpDir);
    expect(result.status).toBe(0);

    const evidencePath = join(tmpDir, '.harness', 'evidence', 'test-ticket-1.json');
    expect(existsSync(evidencePath)).toBe(true);
  });

  it('creates JSON with correct top-level structure', () => {
    runEvidence(['init', 'test-ticket-2'], tmpDir);

    const evidencePath = join(tmpDir, '.harness', 'evidence', 'test-ticket-2.json');
    const data = JSON.parse(readFileSync(evidencePath, 'utf-8'));

    expect(data).toHaveProperty('ticket_id', 'test-ticket-2');
    expect(data).toHaveProperty('agent');
    expect(data).toHaveProperty('start_time');
    expect(data).toHaveProperty('gates');
    expect(data).toHaveProperty('census_before');
  });

  it('start_time is a valid ISO timestamp', () => {
    runEvidence(['init', 'test-ticket-3'], tmpDir);

    const evidencePath = join(tmpDir, '.harness', 'evidence', 'test-ticket-3.json');
    const data = JSON.parse(readFileSync(evidencePath, 'utf-8'));

    // Should be parseable as a date
    const date = new Date(data.start_time);
    expect(isNaN(date.getTime())).toBe(false);
  });

  it('gates field starts as empty object', () => {
    runEvidence(['init', 'test-ticket-4'], tmpDir);

    const evidencePath = join(tmpDir, '.harness', 'evidence', 'test-ticket-4.json');
    const data = JSON.parse(readFileSync(evidencePath, 'utf-8'));

    expect(typeof data.gates).toBe('object');
    expect(data.gates).not.toBeNull();
    // Should be empty initially (no gates recorded yet)
    expect(Object.keys(data.gates)).toHaveLength(0);
  });

  it('census_before is captured (object)', () => {
    runEvidence(['init', 'test-ticket-5'], tmpDir);

    const evidencePath = join(tmpDir, '.harness', 'evidence', 'test-ticket-5.json');
    const data = JSON.parse(readFileSync(evidencePath, 'utf-8'));

    expect(typeof data.census_before).toBe('object');
  });

  it('fails without a ticket-id argument', () => {
    const result = runEvidence(['init'], tmpDir);
    expect(result.status).not.toBe(0);
  });

  it('does not overwrite existing evidence file if already initialized', () => {
    runEvidence(['init', 'test-ticket-6'], tmpDir);
    const evidencePath = join(tmpDir, '.harness', 'evidence', 'test-ticket-6.json');
    const first = JSON.parse(readFileSync(evidencePath, 'utf-8'));

    // Init again — should fail or be idempotent (not overwrite)
    const result2 = runEvidence(['init', 'test-ticket-6'], tmpDir);
    // Either exits non-zero (already exists) or keeps original
    if (result2.status === 0) {
      const second = JSON.parse(readFileSync(evidencePath, 'utf-8'));
      // start_time should not change on re-init
      expect(second.start_time).toBe(first.start_time);
    } else {
      // Non-zero exit is also acceptable (file already exists)
      expect(result2.status).not.toBe(0);
    }
  });
});

describe('evidence record <ticket-id> <gate> <result>', () => {
  beforeEach(() => {
    // Initialize evidence before each record test
    runEvidence(['init', 'rec-ticket'], tmpDir);
  });

  it('records a passing gate', () => {
    const result = runEvidence(['record', 'rec-ticket', 'tsc', 'pass'], tmpDir);
    expect(result.status).toBe(0);

    const evidencePath = join(tmpDir, '.harness', 'evidence', 'rec-ticket.json');
    const data = JSON.parse(readFileSync(evidencePath, 'utf-8'));

    expect(data.gates).toHaveProperty('tsc');
    expect(data.gates.tsc.result).toBe('pass');
  });

  it('records a failing gate', () => {
    const result = runEvidence(['record', 'rec-ticket', 'build', 'fail'], tmpDir);
    expect(result.status).toBe(0);

    const evidencePath = join(tmpDir, '.harness', 'evidence', 'rec-ticket.json');
    const data = JSON.parse(readFileSync(evidencePath, 'utf-8'));

    expect(data.gates).toHaveProperty('build');
    expect(data.gates.build.result).toBe('fail');
  });

  it('gate record includes a timestamp', () => {
    runEvidence(['record', 'rec-ticket', 'vitest', 'pass'], tmpDir);

    const evidencePath = join(tmpDir, '.harness', 'evidence', 'rec-ticket.json');
    const data = JSON.parse(readFileSync(evidencePath, 'utf-8'));

    expect(data.gates.vitest).toHaveProperty('timestamp');
    const date = new Date(data.gates.vitest.timestamp);
    expect(isNaN(date.getTime())).toBe(false);
  });

  it('can record multiple gates', () => {
    runEvidence(['record', 'rec-ticket', 'tsc', 'pass'], tmpDir);
    runEvidence(['record', 'rec-ticket', 'build', 'pass'], tmpDir);
    runEvidence(['record', 'rec-ticket', 'vitest', 'pass'], tmpDir);

    const evidencePath = join(tmpDir, '.harness', 'evidence', 'rec-ticket.json');
    const data = JSON.parse(readFileSync(evidencePath, 'utf-8'));

    expect(data.gates).toHaveProperty('tsc');
    expect(data.gates).toHaveProperty('build');
    expect(data.gates).toHaveProperty('vitest');
  });

  it('overwrites a gate if recorded again', () => {
    runEvidence(['record', 'rec-ticket', 'tsc', 'fail'], tmpDir);
    runEvidence(['record', 'rec-ticket', 'tsc', 'pass'], tmpDir);

    const evidencePath = join(tmpDir, '.harness', 'evidence', 'rec-ticket.json');
    const data = JSON.parse(readFileSync(evidencePath, 'utf-8'));

    // Latest result should win
    expect(data.gates.tsc.result).toBe('pass');
  });

  it('fails if ticket has not been initialized', () => {
    const result = runEvidence(['record', 'nonexistent-ticket', 'tsc', 'pass'], tmpDir);
    expect(result.status).not.toBe(0);
  });

  it('fails without enough arguments', () => {
    const result = runEvidence(['record', 'rec-ticket'], tmpDir);
    expect(result.status).not.toBe(0);
  });

  it('fails with invalid result value (not pass or fail)', () => {
    const result = runEvidence(['record', 'rec-ticket', 'tsc', 'maybe'], tmpDir);
    expect(result.status).not.toBe(0);
  });

  it('supports all required gate names', () => {
    for (const gate of ['tsc', 'build', 'vitest', 'mutation', 'visual']) {
      const result = runEvidence(['record', 'rec-ticket', gate, 'pass'], tmpDir);
      expect(result.status).toBe(0);
    }

    const evidencePath = join(tmpDir, '.harness', 'evidence', 'rec-ticket.json');
    const data = JSON.parse(readFileSync(evidencePath, 'utf-8'));
    expect(Object.keys(data.gates)).toEqual(expect.arrayContaining(['tsc', 'build', 'vitest', 'mutation', 'visual']));
  });
});

describe('evidence finalize <ticket-id>', () => {
  beforeEach(() => {
    runEvidence(['init', 'fin-ticket'], tmpDir);
  });

  it('adds census_after to the evidence file', () => {
    runEvidence(['record', 'fin-ticket', 'tsc', 'pass'], tmpDir);
    runEvidence(['record', 'fin-ticket', 'build', 'pass'], tmpDir);
    runEvidence(['record', 'fin-ticket', 'vitest', 'pass'], tmpDir);
    runEvidence(['record', 'fin-ticket', 'mutation', 'pass'], tmpDir);
    runEvidence(['record', 'fin-ticket', 'visual', 'pass'], tmpDir);

    const result = runEvidence(['finalize', 'fin-ticket'], tmpDir);
    expect(result.status).toBe(0);

    const evidencePath = join(tmpDir, '.harness', 'evidence', 'fin-ticket.json');
    const data = JSON.parse(readFileSync(evidencePath, 'utf-8'));

    expect(data).toHaveProperty('census_after');
    expect(typeof data.census_after).toBe('object');
  });

  it('adds end_time to the evidence file', () => {
    runEvidence(['record', 'fin-ticket', 'tsc', 'pass'], tmpDir);
    runEvidence(['finalize', 'fin-ticket'], tmpDir);

    const evidencePath = join(tmpDir, '.harness', 'evidence', 'fin-ticket.json');
    const data = JSON.parse(readFileSync(evidencePath, 'utf-8'));

    expect(data).toHaveProperty('end_time');
    const date = new Date(data.end_time);
    expect(isNaN(date.getTime())).toBe(false);
  });

  it('computes census deltas', () => {
    runEvidence(['finalize', 'fin-ticket'], tmpDir);

    const evidencePath = join(tmpDir, '.harness', 'evidence', 'fin-ticket.json');
    const data = JSON.parse(readFileSync(evidencePath, 'utf-8'));

    expect(data).toHaveProperty('census_delta');
    expect(typeof data.census_delta).toBe('object');
  });

  it('fails if ticket has not been initialized', () => {
    const result = runEvidence(['finalize', 'nonexistent-ticket'], tmpDir);
    expect(result.status).not.toBe(0);
  });

  it('fails without a ticket-id argument', () => {
    const result = runEvidence(['finalize'], tmpDir);
    expect(result.status).not.toBe(0);
  });
});

describe('evidence check <ticket-id>', () => {
  beforeEach(() => {
    runEvidence(['init', 'chk-ticket'], tmpDir);
  });

  it('fails when no gates have been recorded', () => {
    const result = runEvidence(['check', 'chk-ticket'], tmpDir);
    expect(result.status).not.toBe(0);
  });

  it('fails when only some required gates pass', () => {
    runEvidence(['record', 'chk-ticket', 'tsc', 'pass'], tmpDir);
    runEvidence(['record', 'chk-ticket', 'build', 'pass'], tmpDir);
    // Missing vitest, mutation, visual

    const result = runEvidence(['check', 'chk-ticket'], tmpDir);
    expect(result.status).not.toBe(0);
  });

  it('fails when a required gate has result=fail', () => {
    runEvidence(['record', 'chk-ticket', 'tsc', 'fail'], tmpDir);
    runEvidence(['record', 'chk-ticket', 'build', 'pass'], tmpDir);
    runEvidence(['record', 'chk-ticket', 'vitest', 'pass'], tmpDir);
    runEvidence(['record', 'chk-ticket', 'mutation', 'pass'], tmpDir);
    runEvidence(['record', 'chk-ticket', 'visual', 'pass'], tmpDir);

    const result = runEvidence(['check', 'chk-ticket'], tmpDir);
    expect(result.status).not.toBe(0);
  });

  it('passes when all required gates pass', () => {
    runEvidence(['record', 'chk-ticket', 'tsc', 'pass'], tmpDir);
    runEvidence(['record', 'chk-ticket', 'build', 'pass'], tmpDir);
    runEvidence(['record', 'chk-ticket', 'vitest', 'pass'], tmpDir);
    runEvidence(['record', 'chk-ticket', 'mutation', 'pass'], tmpDir);
    runEvidence(['record', 'chk-ticket', 'visual', 'pass'], tmpDir);

    const result = runEvidence(['check', 'chk-ticket'], tmpDir);
    expect(result.status).toBe(0);
  });

  it('outputs information about which gates are missing or failed', () => {
    runEvidence(['record', 'chk-ticket', 'tsc', 'pass'], tmpDir);
    // Missing build, vitest, mutation, visual

    const result = runEvidence(['check', 'chk-ticket'], tmpDir);
    expect(result.status).not.toBe(0);
    // Should mention missing gates
    const output = result.stdout + result.stderr;
    expect(output).toMatch(/missing|fail|required|build|vitest|mutation|visual/i);
  });

  it('fails when ticket does not exist', () => {
    const result = runEvidence(['check', 'nonexistent-ticket'], tmpDir);
    expect(result.status).not.toBe(0);
  });

  it('fails without a ticket-id argument', () => {
    const result = runEvidence(['check'], tmpDir);
    expect(result.status).not.toBe(0);
  });
});
