import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const HOOK_PATH = path.resolve(__dirname, '../../.claude/hooks/test-integrity-guard.sh');

/**
 * Helper to call the hook script with a JSON payload via stdin.
 * Returns { stdout, exitCode }.
 * Uses spawnSync with input option to avoid shell escaping issues.
 */
function callHook(payload: object): { stdout: string; exitCode: number } {
  const input = JSON.stringify(payload);
  const result = spawnSync('bash', [HOOK_PATH], {
    input,
    encoding: 'utf-8',
  });
  return {
    stdout: result.stdout ?? '',
    exitCode: result.status ?? 0,
  };
}

/**
 * Build an Edit tool payload for a test file.
 */
function editPayload(filePath: string, oldString: string, newString: string) {
  return {
    tool_name: 'Edit',
    tool_input: {
      file_path: filePath,
      old_string: oldString,
      new_string: newString,
    },
  };
}

/**
 * Build a Write tool payload.
 */
function writePayload(filePath: string, content: string) {
  return {
    tool_name: 'Write',
    tool_input: {
      file_path: filePath,
      content,
    },
  };
}

describe('test-integrity-guard.sh', () => {
  it('hook script exists and is executable', () => {
    expect(fs.existsSync(HOOK_PATH)).toBe(true);
    const stat = fs.statSync(HOOK_PATH);
    // Check executable bit (owner execute)
    expect(stat.mode & 0o100).toBeTruthy();
  });

  describe('non-test files — always allow', () => {
    it('allows edits to src/*.ts files', () => {
      const payload = editPayload(
        '/repo/src/components/App.tsx',
        'const x = 1;',
        'const x = 2;',
      );
      const { stdout, exitCode } = callHook(payload);
      expect(exitCode).toBe(0);
      // Should not block
      if (stdout.trim()) {
        const json = JSON.parse(stdout);
        expect(json?.hookSpecificOutput?.permissionDecision).not.toBe('deny');
      }
    });

    it('allows edits to server/**/*.ts files', () => {
      const payload = editPayload(
        '/repo/server/routes/events.ts',
        'const a = 1;',
        'const a = 2;',
      );
      const { stdout, exitCode } = callHook(payload);
      expect(exitCode).toBe(0);
      if (stdout.trim()) {
        const json = JSON.parse(stdout);
        expect(json?.hookSpecificOutput?.permissionDecision).not.toBe('deny');
      }
    });

    it('allows Write to a non-test file', () => {
      const payload = writePayload('/repo/src/utils/helpers.ts', 'export const x = 1;');
      const { stdout, exitCode } = callHook(payload);
      expect(exitCode).toBe(0);
      if (stdout.trim()) {
        const json = JSON.parse(stdout);
        expect(json?.hookSpecificOutput?.permissionDecision).not.toBe('deny');
      }
    });
  });

  describe('Edit on test files — adding tests (ALLOW)', () => {
    it('allows adding a new it() block', () => {
      const old = `it('existing test', () => { expect(1).toBe(1); });`;
      const newStr =
        `it('existing test', () => { expect(1).toBe(1); });\n` +
        `it('new test', () => { expect(2).toBe(2); });`;
      const payload = editPayload('tests/api/events.test.ts', old, newStr);
      const { stdout, exitCode } = callHook(payload);
      expect(exitCode).toBe(0);
      if (stdout.trim()) {
        const json = JSON.parse(stdout);
        expect(json?.hookSpecificOutput?.permissionDecision).not.toBe('deny');
      }
    });

    it('allows adding a new describe() block', () => {
      const old = `describe('group', () => {});`;
      const newStr = `describe('group', () => {});\ndescribe('new group', () => {});`;
      const payload = editPayload('tests/unit/math.test.ts', old, newStr);
      const { stdout, exitCode } = callHook(payload);
      expect(exitCode).toBe(0);
      if (stdout.trim()) {
        const json = JSON.parse(stdout);
        expect(json?.hookSpecificOutput?.permissionDecision).not.toBe('deny');
      }
    });

    it('allows adding more expect() assertions', () => {
      const old = `it('test', () => { expect(1).toBe(1); });`;
      const newStr = `it('test', () => { expect(1).toBe(1); expect(2).toBe(2); });`;
      const payload = editPayload('tests/api/health.test.ts', old, newStr);
      const { stdout, exitCode } = callHook(payload);
      expect(exitCode).toBe(0);
      if (stdout.trim()) {
        const json = JSON.parse(stdout);
        expect(json?.hookSpecificOutput?.permissionDecision).not.toBe('deny');
      }
    });

    it('allows edits that keep the same test/expect count', () => {
      const old = `it('test', () => { expect(result).toBe('old'); });`;
      const newStr = `it('test', () => { expect(result).toBe('new'); });`;
      const payload = editPayload('tests/unit/timeAgo.test.ts', old, newStr);
      const { stdout, exitCode } = callHook(payload);
      expect(exitCode).toBe(0);
      if (stdout.trim()) {
        const json = JSON.parse(stdout);
        expect(json?.hookSpecificOutput?.permissionDecision).not.toBe('deny');
      }
    });
  });

  describe('Edit on test files — reducing test blocks (BLOCK)', () => {
    it('blocks removing an it() block', () => {
      const old =
        `it('test one', () => { expect(1).toBe(1); });\n` +
        `it('test two', () => { expect(2).toBe(2); });`;
      const newStr = `it('test one', () => { expect(1).toBe(1); });`;
      const payload = editPayload('tests/api/events.test.ts', old, newStr);
      const { stdout, exitCode } = callHook(payload);
      expect(exitCode).toBe(0);
      const json = JSON.parse(stdout);
      expect(json?.hookSpecificOutput?.permissionDecision).toBe('deny');
    });

    it('blocks removing a test() block', () => {
      const old =
        `test('first', () => { expect(a).toBe(1); });\n` +
        `test('second', () => { expect(b).toBe(2); });`;
      const newStr = `test('first', () => { expect(a).toBe(1); });`;
      const payload = editPayload('tests/unit/math.test.ts', old, newStr);
      const { stdout, exitCode } = callHook(payload);
      expect(exitCode).toBe(0);
      const json = JSON.parse(stdout);
      expect(json?.hookSpecificOutput?.permissionDecision).toBe('deny');
    });

    it('blocks removing a describe() block', () => {
      const old =
        `describe('group A', () => {});\n` + `describe('group B', () => {});`;
      const newStr = `describe('group A', () => {});`;
      const payload = editPayload('tests/api/auth.test.ts', old, newStr);
      const { stdout, exitCode } = callHook(payload);
      expect(exitCode).toBe(0);
      const json = JSON.parse(stdout);
      expect(json?.hookSpecificOutput?.permissionDecision).toBe('deny');
    });
  });

  describe('Edit on test files — reducing expect() count (BLOCK)', () => {
    it('blocks removing expect() assertions', () => {
      const old = `it('test', () => { expect(1).toBe(1); expect(2).toBe(2); });`;
      const newStr = `it('test', () => { expect(1).toBe(1); });`;
      const payload = editPayload('tests/api/health.test.ts', old, newStr);
      const { stdout, exitCode } = callHook(payload);
      expect(exitCode).toBe(0);
      const json = JSON.parse(stdout);
      expect(json?.hookSpecificOutput?.permissionDecision).toBe('deny');
    });
  });

  describe('Edit on test files — adding .skip/.only/.todo (BLOCK)', () => {
    it('blocks adding it.skip()', () => {
      const old = `it('test', () => { expect(1).toBe(1); });`;
      const newStr = `it.skip('test', () => { expect(1).toBe(1); });`;
      const payload = editPayload('tests/api/events.test.ts', old, newStr);
      const { stdout, exitCode } = callHook(payload);
      expect(exitCode).toBe(0);
      const json = JSON.parse(stdout);
      expect(json?.hookSpecificOutput?.permissionDecision).toBe('deny');
    });

    it('blocks adding it.only()', () => {
      const old = `it('test', () => { expect(1).toBe(1); });`;
      const newStr = `it.only('test', () => { expect(1).toBe(1); });`;
      const payload = editPayload('tests/unit/timeAgo.test.ts', old, newStr);
      const { stdout, exitCode } = callHook(payload);
      expect(exitCode).toBe(0);
      const json = JSON.parse(stdout);
      expect(json?.hookSpecificOutput?.permissionDecision).toBe('deny');
    });

    it('blocks adding it.todo()', () => {
      const old = `it('test', () => { expect(1).toBe(1); });`;
      const newStr = `it.todo('test');`;
      const payload = editPayload('tests/api/auth.test.ts', old, newStr);
      const { stdout, exitCode } = callHook(payload);
      expect(exitCode).toBe(0);
      const json = JSON.parse(stdout);
      expect(json?.hookSpecificOutput?.permissionDecision).toBe('deny');
    });

    it('blocks adding describe.skip()', () => {
      const old = `describe('group', () => { it('test', () => {}); });`;
      const newStr = `describe.skip('group', () => { it('test', () => {}); });`;
      const payload = editPayload('tests/api/config.test.ts', old, newStr);
      const { stdout, exitCode } = callHook(payload);
      expect(exitCode).toBe(0);
      const json = JSON.parse(stdout);
      expect(json?.hookSpecificOutput?.permissionDecision).toBe('deny');
    });

    it('blocks adding test.skip()', () => {
      const old = `test('foo', () => { expect(x).toBe(1); });`;
      const newStr = `test.skip('foo', () => { expect(x).toBe(1); });`;
      const payload = editPayload('e2e/dashboard.spec.ts', old, newStr);
      const { stdout, exitCode } = callHook(payload);
      expect(exitCode).toBe(0);
      const json = JSON.parse(stdout);
      expect(json?.hookSpecificOutput?.permissionDecision).toBe('deny');
    });
  });

  describe('Write on test files — deleting content (BLOCK)', () => {
    it('blocks Write that removes all tests (empty content)', () => {
      const payload = writePayload('tests/api/events.test.ts', '');
      const { stdout, exitCode } = callHook(payload);
      expect(exitCode).toBe(0);
      const json = JSON.parse(stdout);
      expect(json?.hookSpecificOutput?.permissionDecision).toBe('deny');
    });

    it('blocks Write that writes content with no tests to a test file', () => {
      const payload = writePayload('tests/unit/math.test.ts', '// empty file\n');
      const { stdout, exitCode } = callHook(payload);
      expect(exitCode).toBe(0);
      const json = JSON.parse(stdout);
      expect(json?.hookSpecificOutput?.permissionDecision).toBe('deny');
    });
  });

  describe('e2e spec files — same rules apply', () => {
    it('allows adding test blocks to e2e spec files', () => {
      const old = `test('existing', async () => { expect(page.url()).toContain('/'); });`;
      const newStr =
        `test('existing', async () => { expect(page.url()).toContain('/'); });\n` +
        `test('new', async () => { expect(true).toBe(true); });`;
      const payload = editPayload('e2e/dashboard.spec.ts', old, newStr);
      const { stdout, exitCode } = callHook(payload);
      expect(exitCode).toBe(0);
      if (stdout.trim()) {
        const json = JSON.parse(stdout);
        expect(json?.hookSpecificOutput?.permissionDecision).not.toBe('deny');
      }
    });

    it('blocks removing test blocks from e2e spec files', () => {
      const old =
        `test('test A', async () => { expect(1).toBe(1); });\n` +
        `test('test B', async () => { expect(2).toBe(2); });`;
      const newStr = `test('test A', async () => { expect(1).toBe(1); });`;
      const payload = editPayload('e2e/dashboard.spec.ts', old, newStr);
      const { stdout, exitCode } = callHook(payload);
      expect(exitCode).toBe(0);
      const json = JSON.parse(stdout);
      expect(json?.hookSpecificOutput?.permissionDecision).toBe('deny');
    });
  });

  describe('deny response format', () => {
    it('returns valid JSON with hookSpecificOutput when blocking', () => {
      const old =
        `it('test one', () => { expect(1).toBe(1); });\n` +
        `it('test two', () => { expect(2).toBe(2); });`;
      const newStr = `it('test one', () => { expect(1).toBe(1); });`;
      const payload = editPayload('tests/api/events.test.ts', old, newStr);
      const { stdout } = callHook(payload);
      const json = JSON.parse(stdout);
      expect(json).toHaveProperty('hookSpecificOutput');
      expect(json.hookSpecificOutput).toHaveProperty('permissionDecision', 'deny');
      expect(json.hookSpecificOutput).toHaveProperty('permissionDecisionReason');
      expect(typeof json.hookSpecificOutput.permissionDecisionReason).toBe('string');
    });
  });
});
