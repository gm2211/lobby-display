#\!/usr/bin/env bash
# verify-hook.sh — PostToolUse hook wrapper for verify.sh
#
# Runs verify.sh --quick in the background after Edit/Write tool calls
# that touch source files. Does NOT block tool execution.
#
# Usage (in Claude Code settings as a PostToolUse hook):
#   scripts/verify-hook.sh
#
# The hook receives tool input via stdin as JSON when invoked by Claude Code.
# It checks if the modified file is within a watched path, then fires
# verify.sh --quick asynchronously.
#
# Result is stored in .harness/last-hook-verify.json for later inspection.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HARNESS_DIR="$PROJECT_ROOT/.harness"
RESULT_FILE="$HARNESS_DIR/last-hook-verify.json"
LOG_FILE="$HARNESS_DIR/verify-hook.log"

# ---------------------------------------------------------------------------
# File pattern matching
# Watched paths: server/**, src/**, tests/**, e2e/**
# ---------------------------------------------------------------------------
WATCHED_PATTERNS=(
  "^server/"
  "^src/"
  "^tests/"
  "^e2e/"
)

file_is_watched() {
  local file_path="$1"
  # Normalize: strip leading PROJECT_ROOT prefix if absolute
  local rel_path="${file_path#$PROJECT_ROOT/}"

  for pattern in "${WATCHED_PATTERNS[@]}"; do
    if echo "$rel_path" | grep -qE "$pattern"; then
      return 0
    fi
  done
  return 1
}

# ---------------------------------------------------------------------------
# Parse tool input from stdin (Claude Code passes JSON via stdin)
# ---------------------------------------------------------------------------
INPUT_JSON=""
if [[ ! -t 0 ]]; then
  INPUT_JSON=$(cat)
fi

# Extract file path from tool input JSON
# Claude Code sends {"tool_input": {"file_path": "..."}} or {"tool_input": {"path": "..."}}
MODIFIED_FILE=""
if [[ -n "$INPUT_JSON" ]]; then
  MODIFIED_FILE=$(echo "$INPUT_JSON" | python3 -c "
import json, sys
data = json.load(sys.stdin)
tool_input = data.get('tool_input', data)
# Try common field names for file path
for key in ('file_path', 'path', 'notebook_path'):
    val = tool_input.get(key, '')
    if val:
        print(val)
        break
" 2>/dev/null || true)
fi

# If we couldn't parse a file path or it's not watched, exit silently
if [[ -z "$MODIFIED_FILE" ]]; then
  exit 0
fi

if ! file_is_watched "$MODIFIED_FILE"; then
  exit 0
fi

# ---------------------------------------------------------------------------
# Fire verify.sh --quick asynchronously
# ---------------------------------------------------------------------------
mkdir -p "$HARNESS_DIR"

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Write a "running" marker so callers can see a check is in progress
cat > "$RESULT_FILE" << JSON
{
  "timestamp": "$TIMESTAMP",
  "status": "running",
  "triggered_by": "$MODIFIED_FILE",
  "mode": "quick"
}
JSON

# Run verify in background, capturing exit code to result file
(
  if "$SCRIPT_DIR/verify.sh" --quick >> "$LOG_FILE" 2>&1; then
    EXIT_CODE=0
  else
    EXIT_CODE=$?
  fi

  # Update result file with final status
  DONE_TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  if [[ $EXIT_CODE -eq 0 ]]; then
    STATUS="passed"
  else
    STATUS="failed"
  fi

  cat > "$RESULT_FILE" << JSON
{
  "timestamp": "$DONE_TS",
  "status": "$STATUS",
  "exit_code": $EXIT_CODE,
  "triggered_by": "$MODIFIED_FILE",
  "mode": "quick",
  "report": ".harness/verify-report.json"
}
JSON

  echo "[$DONE_TS] verify-hook: $STATUS (triggered by $MODIFIED_FILE)" >> "$LOG_FILE"
) &

# Disown so it survives if parent exits
disown $\! 2>/dev/null || true

# Exit 0 immediately — do NOT block the tool execution
exit 0
