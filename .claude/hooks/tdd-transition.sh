#!/usr/bin/env bash
# =============================================================================
# .claude/hooks/tdd-transition.sh -- TDD State Machine PostToolUse Hook
#
# Registered as a PostToolUse hook in .claude/settings.json for Bash tool.
# Runs AFTER Bash tool calls to auto-transition TDD state based on test output.
#
# Hook Protocol (PostToolUse):
#   - Registered via settings.json under hooks.PostToolUse with matcher "Bash"
#   - Input arrives on stdin as JSON:
#       {"tool_input": {"command": "..."}, "tool_response": {"output": "...", ...}}
#   - This is a PostToolUse hook -- it cannot block operations, only observe.
#   - Advisory messages printed to stdout are shown to the agent as context.
#   - Always exit 0.
#
# Auto-transition logic (triggered when a vitest/test run is detected):
#   RED state:
#     - Tests show failures   -> stay RED (new test is failing as expected)
#     - All tests pass        -> WARN: new test should be failing first
#
#   GREEN state:
#     - All tests pass        -> auto-transition to REFACTOR
#     - Tests still failing   -> stay GREEN (keep working)
#
#   REFACTOR state:
#     - All tests pass        -> prompt to transition to RED (next cycle)
#     - Tests failing         -> WARN: refactoring broke tests
#
# Vitest output patterns detected:
#   Pass: "Tests  N passed" / "N passed"
#   Fail: "Tests  N failed" / "N failed"
# =============================================================================

set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo ".")"
STATE_FILE="$REPO_ROOT/.harness/.tdd-state"
DISABLED_MARKER="$REPO_ROOT/.harness/.tdd-disabled"
TDD_STATE_SCRIPT="$REPO_ROOT/scripts/tdd-state.sh"

# ---------------------------------------------------------------------------
# Fast exit conditions
# ---------------------------------------------------------------------------

# If disabled, skip
if [[ -f "$DISABLED_MARKER" ]]; then
  exit 0
fi

# If state file does not exist, skip
if [[ ! -f "$STATE_FILE" ]]; then
  exit 0
fi

# ---------------------------------------------------------------------------
# Read hook input
# ---------------------------------------------------------------------------

INPUT="$(cat)"

# Extract the command that was run
# Input format: {"tool_input": {"command": "..."}, "tool_response": {...}}
COMMAND="$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || true)"

if [[ -z "$COMMAND" ]]; then
  exit 0
fi

# Check if this was a test run (vitest, npx vitest, npm run test, npm test)
is_test_command=false
if echo "$COMMAND" | grep -qE '(vitest|npm\s+(run\s+)?test)'; then
  is_test_command=true
fi

if [[ "$is_test_command" != "true" ]]; then
  exit 0
fi

# ---------------------------------------------------------------------------
# Parse test output from tool response
# ---------------------------------------------------------------------------

TOOL_OUTPUT="$(echo "$INPUT" | jq -r '.tool_response.output // .tool_response // empty' 2>/dev/null || true)"

if [[ -z "$TOOL_OUTPUT" ]]; then
  exit 0
fi

# Detect pass/fail from vitest output
# Vitest formats:
#   "Tests  148 passed (148)"
#   "Tests  1 failed | 147 passed (148)"
#   "x tests failed"

has_failures=false
all_pass=false

if echo "$TOOL_OUTPUT" | grep -qiE '([0-9]+\s+failed|Tests\s+[0-9]+\s+failed)'; then
  has_failures=true
fi

if echo "$TOOL_OUTPUT" | grep -qiE '([0-9]+\s+passed|Tests\s+[0-9]+\s+passed|all tests passed)'; then
  if [[ "$has_failures" == "false" ]]; then
    all_pass=true
  fi
fi

# If we could not determine pass/fail, skip
if [[ "$has_failures" == "false" && "$all_pass" == "false" ]]; then
  exit 0
fi

# ---------------------------------------------------------------------------
# Read current TDD state
# ---------------------------------------------------------------------------

TDD_STATE="$(jq -r '.state // "UNINITIALIZED"' "$STATE_FILE" 2>/dev/null || echo "UNINITIALIZED")"

if [[ "$TDD_STATE" == "UNINITIALIZED" ]]; then
  exit 0
fi

# ---------------------------------------------------------------------------
# Auto-transition logic
# ---------------------------------------------------------------------------

case "$TDD_STATE" in
  RED)
    if [[ "$has_failures" == "true" ]]; then
      echo ""
      echo "[TDD] State: RED | Tests failing -- good! Your new test is failing as expected."
      echo "[TDD] Next step: run 'scripts/tdd-state.sh transition test_failed' to move to GREEN"
      echo "[TDD] Then implement the minimum code to make the test pass."
    elif [[ "$all_pass" == "true" ]]; then
      echo ""
      echo "[TDD] WARNING: State is RED but all tests passed!"
      echo "[TDD] Your new test should be FAILING before you write implementation code."
      echo "[TDD] Check that your test actually exercises new/unimplemented behavior."
    fi
    ;;

  GREEN)
    if [[ "$all_pass" == "true" ]]; then
      echo ""
      echo "[TDD] All tests passing in GREEN state!"
      if [[ -x "$TDD_STATE_SCRIPT" ]]; then
        "$TDD_STATE_SCRIPT" transition test_passed 2>/dev/null || true
      fi
      echo "[TDD] Auto-transitioned: GREEN -> REFACTOR"
      echo "[TDD] Next step: refactor/clean up your code. Run tests after each change."
      echo "[TDD] When done: run 'scripts/tdd-state.sh transition refactor_done' to return to RED"
    elif [[ "$has_failures" == "true" ]]; then
      echo ""
      echo "[TDD] State: GREEN | Tests still failing -- keep working to make them pass."
    fi
    ;;

  REFACTOR)
    if [[ "$all_pass" == "true" ]]; then
      echo ""
      echo "[TDD] All tests passing in REFACTOR state."
      echo "[TDD] When you are done cleaning up, run: scripts/tdd-state.sh transition refactor_done"
      echo "[TDD] This will return you to RED state for the next feature."
    elif [[ "$has_failures" == "true" ]]; then
      echo ""
      echo "[TDD] WARNING: State is REFACTOR but tests are FAILING!"
      echo "[TDD] Your refactoring broke tests. Fix them before continuing."
      echo "[TDD] Tip: revert the last change and refactor more carefully."
    fi
    ;;
esac

exit 0
