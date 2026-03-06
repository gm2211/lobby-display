#!/usr/bin/env bash
# Gate: blocks bd close on [ui] tickets without VISUAL_VERIFIED comment

set -euo pipefail

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# Only intercept "bd close" commands
if [[ -z "$COMMAND" ]] || ! echo "$COMMAND" | grep -qE '\bbd\s+close\b'; then
  exit 0
fi

# Extract ticket IDs (pattern: word-chars + hyphen + word-chars, excluding --flags)
IDS=$(echo "$COMMAND" | grep -oE '\b[a-zA-Z0-9]+-[a-zA-Z0-9]+\b' | grep -v '^--')

BLOCKED=""
for ID in $IDS; do
  # Get title from bd show --json
  TITLE=$(bd show "$ID" --json 2>/dev/null | jq -r '.[0].title // empty' 2>/dev/null || true)

  # Check if [ui] tagged (case-insensitive)
  if echo "$TITLE" | grep -qi '\[ui\]'; then
    # Check for VISUAL_VERIFIED in comments
    HAS_VERIFIED=$(bd comments "$ID" --json 2>/dev/null | jq -r '.[].text // empty' 2>/dev/null | grep -c 'VISUAL_VERIFIED' || true)

    if [[ "$HAS_VERIFIED" -eq 0 ]]; then
      BLOCKED="$BLOCKED $ID"
    fi
  fi
done

if [[ -n "$BLOCKED" ]]; then
  # Build the deny message
  TRIMMED=$(echo "$BLOCKED" | xargs)
  jq -n --arg ids "$TRIMMED" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: ("BLOCKED: Ticket(s) " + $ids + " tagged [ui] but missing VISUAL_VERIFIED comment.\n\nTo unblock:\n1. Take a screenshot: npx tsx -e \"import {chromium} from '\''playwright'\''; ...\"\n2. Read it with the Read tool\n3. Post verification: bd comments add <ID> --author <your-name> \"VISUAL_VERIFIED: <what you checked>\"\n4. Then retry: bd close <ID>")
    }
  }'
  exit 0
fi

# All checks passed
exit 0
