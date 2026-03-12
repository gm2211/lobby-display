#!/usr/bin/env bash
# PreToolUse hook: guards test file integrity
#
# Blocks Edit/Write operations on test files (tests/**/*.test.ts, e2e/**/*.spec.ts) if:
#  1. A Write replaces/deletes all test content (Write to a test file with no tests)
#  2. An Edit reduces the count of it/test/describe blocks
#  3. An Edit adds .skip/.only/.todo to existing test blocks
#  4. An Edit reduces expect() assertion count
#
# Outputs JSON: { hookSpecificOutput: { hookEventName, permissionDecision, permissionDecisionReason } }
# Exit code 0 in all cases (decision is communicated via JSON).

set -euo pipefail

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

# Only handle Edit and Write tools
if [[ "$TOOL_NAME" != "Edit" && "$TOOL_NAME" != "Write" ]]; then
  exit 0
fi

FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

# Normalize path: strip leading / and repo prefix for pattern matching
BASENAME=$(basename "$FILE_PATH")
# Check if the file matches test patterns: tests/**/*.test.ts or e2e/**/*.spec.ts
# We match on the file_path itself using patterns
is_test_file() {
  local fp="$1"
  # Match paths ending in .test.ts under tests/ directory
  if echo "$fp" | grep -qE '(^|/)tests/[^/].*\.test\.ts$'; then
    return 0
  fi
  # Match paths ending in .spec.ts under e2e/ directory
  if echo "$fp" | grep -qE '(^|/)e2e/[^/].*\.spec\.ts$'; then
    return 0
  fi
  return 1
}

if ! is_test_file "$FILE_PATH"; then
  exit 0
fi

# ---- Count helpers ----
count_test_blocks() {
  # Count lines with it(, test(, describe( — but not .skip/.only/.todo variants
  # We count: \bit\s*\(, \btest\s*\(, \bdescribe\s*\(
  # Use || true to prevent grep's exit code 1 (no matches) from killing the script
  echo "$1" | grep -oE '\b(it|test|describe)\s*\(' | wc -l || true
}

count_skip_only_todo() {
  # Count .skip( .only( .todo( patterns (could be it.skip, test.only, describe.skip etc.)
  echo "$1" | grep -oE '\.(skip|only|todo)\s*\(' | wc -l || true
}

count_expect() {
  echo "$1" | grep -oE '\bexpect\s*\(' | wc -l || true
}

deny() {
  local reason="$1"
  jq -n --arg reason "$reason" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
  exit 0
}

# ---- Handle Write tool ----
if [[ "$TOOL_NAME" == "Write" ]]; then
  CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // empty')

  NEW_TEST_BLOCKS=$(count_test_blocks "$CONTENT")
  NEW_EXPECT=$(count_expect "$CONTENT")

  if [[ "$NEW_TEST_BLOCKS" -eq 0 && "$NEW_EXPECT" -eq 0 ]]; then
    deny "BLOCKED: Writing to test file '$FILE_PATH' with no test blocks (it/test/describe) or expect() calls. This would delete all tests. If intentional, create a new test file instead."
  fi

  exit 0
fi

# ---- Handle Edit tool ----
OLD_STRING=$(echo "$INPUT" | jq -r '.tool_input.old_string // empty')
NEW_STRING=$(echo "$INPUT" | jq -r '.tool_input.new_string // empty')

OLD_BLOCKS=$(count_test_blocks "$OLD_STRING")
NEW_BLOCKS=$(count_test_blocks "$NEW_STRING")

OLD_SKIP=$(count_skip_only_todo "$OLD_STRING")
NEW_SKIP=$(count_skip_only_todo "$NEW_STRING")

OLD_EXPECT=$(count_expect "$OLD_STRING")
NEW_EXPECT=$(count_expect "$NEW_STRING")

# Check 1: Reduced test block count
if [[ "$NEW_BLOCKS" -lt "$OLD_BLOCKS" ]]; then
  deny "BLOCKED: Edit to '$FILE_PATH' reduces test block count from $OLD_BLOCKS to $NEW_BLOCKS (it/test/describe blocks). Removing tests is not allowed. Add new tests instead."
fi

# Check 2: Added .skip/.only/.todo
if [[ "$NEW_SKIP" -gt "$OLD_SKIP" ]]; then
  deny "BLOCKED: Edit to '$FILE_PATH' adds .skip/.only/.todo modifier(s) (from $OLD_SKIP to $NEW_SKIP). Skipping or focusing tests is not allowed."
fi

# Check 3: Reduced expect() count
if [[ "$NEW_EXPECT" -lt "$OLD_EXPECT" ]]; then
  deny "BLOCKED: Edit to '$FILE_PATH' reduces expect() assertion count from $OLD_EXPECT to $NEW_EXPECT. Removing assertions is not allowed."
fi

# All checks passed — allow
exit 0
