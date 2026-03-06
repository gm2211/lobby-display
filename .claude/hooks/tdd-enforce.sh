#!/usr/bin/env bash
# =============================================================================
# .claude/hooks/tdd-enforce.sh -- TDD State Machine PreToolUse Hook
#
# Registered as a PreToolUse hook in .claude/settings.json for Edit and Write tools.
# Runs BEFORE every Edit/Write tool call to enforce Red->Green->Refactor discipline.
#
# Hook Protocol (PreToolUse):
#   - Registered via settings.json under hooks.PreToolUse with matcher "Edit|Write"
#   - Input arrives on stdin as JSON: {"tool_input": {"file_path": "..."}, ...}
#   - To BLOCK: print deny JSON to stdout and exit 0
#       {"hookSpecificOutput": {"hookEventName": "PreToolUse",
#                               "permissionDecision": "deny",
#                               "permissionDecisionReason": "..."}}
#   - To ALLOW: exit 0 with no output
#
# State enforcement:
#   RED state:
#     ALLOW  -- tests/**/*.test.ts, e2e/**/*.spec.ts
#     ALLOW  -- config files (.claude/**, package.json, tsconfig*, *.config.*, *.md)
#     BLOCK  -- server/**/*.ts, src/**/*.ts, src/**/*.tsx
#
#   GREEN state:
#     ALLOW  -- server/**/*.ts, src/**/*.ts, src/**/*.tsx
#     ALLOW  -- config files
#     BLOCK  -- tests/**/*.test.ts, e2e/**/*.spec.ts
#
#   REFACTOR state:
#     ALLOW  -- everything
#
#   Disabled / not initialized:
#     ALLOW  -- everything (graceful degradation)
# =============================================================================

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo ".")"
STATE_FILE="$REPO_ROOT/.harness/.tdd-state"
DISABLED_MARKER="$REPO_ROOT/.harness/.tdd-disabled"

# ---------------------------------------------------------------------------
# Fast exit conditions (allow everything)
# ---------------------------------------------------------------------------

# If disabled marker exists, allow all
if [[ -f "$DISABLED_MARKER" ]]; then
  exit 0
fi

# If state file does not exist (not initialized), allow all
if [[ ! -f "$STATE_FILE" ]]; then
  exit 0
fi

# ---------------------------------------------------------------------------
# Read hook input
# ---------------------------------------------------------------------------

INPUT="$(cat)"

# Extract the file path being written/edited
# The input JSON has the structure: {"tool_input": {"file_path": "..."}}
FILE_PATH="$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null || true)"

if [[ -z "$FILE_PATH" ]]; then
  # No file path found -- allow (e.g., notebook edits or unknown format)
  exit 0
fi

# ---------------------------------------------------------------------------
# Read current TDD state
# ---------------------------------------------------------------------------

TDD_STATE="$(jq -r '.state // "UNINITIALIZED"' "$STATE_FILE" 2>/dev/null || echo "UNINITIALIZED")"

# If state is unrecognized, allow
if [[ "$TDD_STATE" == "UNINITIALIZED" ]]; then
  exit 0
fi

# REFACTOR state -- allow everything
if [[ "$TDD_STATE" == "REFACTOR" ]]; then
  exit 0
fi

# ---------------------------------------------------------------------------
# Path classification helpers
# ---------------------------------------------------------------------------

# Normalize path: strip leading ./ and repo root prefix for matching
NORMALIZED_PATH="$FILE_PATH"
# Remove repo root prefix if absolute path
if [[ "$NORMALIZED_PATH" == /* ]]; then
  NORMALIZED_PATH="${NORMALIZED_PATH#$REPO_ROOT/}"
fi
NORMALIZED_PATH="${NORMALIZED_PATH#./}"

is_test_file() {
  local p="$1"
  if [[ "$p" == tests/* ]] && [[ "$p" == *.test.ts ]]; then return 0; fi
  if [[ "$p" == e2e/* ]] && [[ "$p" == *.spec.ts ]]; then return 0; fi
  return 1
}

is_source_file() {
  local p="$1"
  if [[ "$p" == server/* ]] && [[ "$p" == *.ts ]]; then return 0; fi
  if [[ "$p" == src/* ]] && [[ "$p" == *.ts ]]; then return 0; fi
  if [[ "$p" == src/* ]] && [[ "$p" == *.tsx ]]; then return 0; fi
  return 1
}

is_config_file() {
  local p="$1"
  case "$p" in
    .claude/*) return 0 ;;
    package.json) return 0 ;;
    package-lock.json) return 0 ;;
    tsconfig*.json) return 0 ;;
    *.config.ts) return 0 ;;
    *.config.js) return 0 ;;
    *.config.mjs) return 0 ;;
    *.md) return 0 ;;
    *.sh) return 0 ;;
    .harness/*) return 0 ;;
    scripts/*) return 0 ;;
    prisma/*) return 0 ;;
    .github/*) return 0 ;;
    .gitignore) return 0 ;;
    .env*) return 0 ;;
    docker-compose*) return 0 ;;
    index.html) return 0 ;;
    render.yaml) return 0 ;;
    vite.config.ts) return 0 ;;
    vitest.config.ts) return 0 ;;
    vitest.workspace.ts) return 0 ;;
  esac
  return 1
}

deny_with_message() {
  local msg="$1"
  jq -n --arg reason "$msg" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
  exit 0
}

# ---------------------------------------------------------------------------
# Enforce rules by state
# ---------------------------------------------------------------------------

case "$TDD_STATE" in
  RED)
    # In RED: allow test files and config files; block source files
    if is_config_file "$NORMALIZED_PATH"; then
      exit 0
    fi
    if is_test_file "$NORMALIZED_PATH"; then
      exit 0
    fi
    if is_source_file "$NORMALIZED_PATH"; then
      deny_with_message "TDD violation: You are in RED state. Write a failing test first before changing source code.

File blocked: $FILE_PATH

To unblock:
1. Write a failing test in tests/ or e2e/
2. Run vitest to confirm it fails
3. Transition state: scripts/tdd-state.sh transition test_failed
4. Then you can edit source files in GREEN state

Or disable enforcement: scripts/tdd-state.sh disable"
    fi
    # Not a test, source, or known config file -- allow (e.g., docs, misc files)
    exit 0
    ;;

  GREEN)
    # In GREEN: allow source files and config files; block test files
    if is_config_file "$NORMALIZED_PATH"; then
      exit 0
    fi
    if is_source_file "$NORMALIZED_PATH"; then
      exit 0
    fi
    if is_test_file "$NORMALIZED_PATH"; then
      deny_with_message "TDD violation: You are in GREEN state. Make the existing tests pass before writing new tests.

File blocked: $FILE_PATH

To unblock:
1. Run vitest to see which tests are failing
2. Fix the source code to make all tests pass
3. Transition state: scripts/tdd-state.sh transition test_passed
4. Then you can write more tests in REFACTOR or next RED state

Or disable enforcement: scripts/tdd-state.sh disable"
    fi
    # Not a test, source, or known config file -- allow
    exit 0
    ;;
esac

# Default: allow
exit 0
