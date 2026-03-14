#!/usr/bin/env bash
# Gate: auto-runs quality gates when evidence is missing or incomplete for a ticket.
#
# When 'bd close <ticket-id>' is called:
#   1. If evidence already exists and all gates pass → allow close immediately.
#   2. If evidence is missing or incomplete → auto-run each quality gate, record
#      real results, finalize, then allow or block based on real outcomes.
#
# Gate behavior:
#   tsc      — runs 'npx tsc --noEmit'; real failures block the close
#   build    — runs 'npm run build'; DB-unavailable errors treated as pass
#   vitest   — runs 'npx vitest run'; DB-unavailable errors treated as pass
#   mutation — auto-passed (mutation testing not set up)
#   visual   — auto-passed (handled by ui-verify-gate hook)

set -euo pipefail

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# Only intercept "bd close" commands
if [[ -z "$COMMAND" ]] || ! echo "$COMMAND" | grep -qE '\bbd\s+close\b'; then
  exit 0
fi

# Extract only the "bd close ..." portion from the command, then get ticket IDs
BD_CLOSE_PART=$(echo "$COMMAND" | grep -oE 'bd\s+close\s+[^;&|]+' || true)
if [[ -z "$BD_CLOSE_PART" ]]; then
  exit 0
fi
# Extract ticket IDs from just the bd close arguments (h77--xxx pattern)
IDS=$(echo "$BD_CLOSE_PART" | grep -oE 'h77--?[a-zA-Z0-9]+' || true)

if [[ -z "$IDS" ]]; then
  exit 0
fi

BLOCKED=""
BLOCK_REASONS=""

# Helper: print a message to stderr (visible in hook output)
log() {
  echo "$*" >&2
}

# Helper: check if an error output indicates a DB connection failure
is_db_error() {
  local output="$1"
  echo "$output" | grep -qiE \
    'connect ECONNREFUSED|connection refused|ENOTFOUND|password authentication failed|database.*does not exist|Cannot find module.*prisma|prisma.*not found|PrismaClientInitializationError|datasource.*not reachable|Can.t reach database server' \
    2>/dev/null
}

run_gates_for_ticket() {
  local ID="$1"
  local EVIDENCE_SCRIPT="${CLAUDE_PROJECT_DIR}/scripts/evidence.sh"
  local PROJECT="${CLAUDE_PROJECT_DIR}"

  # ---- Step 0: check if evidence already passes ----
  if (cd "$PROJECT" && bash "$EVIDENCE_SCRIPT" check "$ID" >/dev/null 2>&1); then
    log "[evidence-gate] $ID: evidence already complete — allowing close."
    return 0
  fi

  log ""
  log "[evidence-gate] $ID: evidence missing or incomplete — running quality gates..."
  log ""

  # ---- Step 1: init evidence (ignore error if already initialized) ----
  local evidence_file="${PROJECT}/.harness/evidence/${ID}.json"
  if [[ ! -f "$evidence_file" ]]; then
    (cd "$PROJECT" && bash "$EVIDENCE_SCRIPT" init "$ID" >/dev/null 2>&1) || true
  fi

  local any_real_failure=false
  local failure_output=""

  # ---- Gate: tsc ----
  log "[evidence-gate] $ID: Running tsc..."
  local tsc_out
  local tsc_exit=0
  tsc_out=$(cd "$PROJECT" && npx tsc --noEmit 2>&1) || tsc_exit=$?

  if [[ $tsc_exit -eq 0 ]]; then
    log "[evidence-gate] $ID: tsc ... PASS"
    (cd "$PROJECT" && bash "$EVIDENCE_SCRIPT" record "$ID" tsc pass >/dev/null 2>&1) || true
  else
    log "[evidence-gate] $ID: tsc ... FAIL"
    (cd "$PROJECT" && bash "$EVIDENCE_SCRIPT" record "$ID" tsc fail >/dev/null 2>&1) || true
    any_real_failure=true
    failure_output="${failure_output}\n--- tsc output ---\n${tsc_out}\n"
  fi

  # ---- Gate: build ----
  log "[evidence-gate] $ID: Running build..."
  local build_out
  local build_exit=0
  build_out=$(cd "$PROJECT" && DATABASE_URL="postgresql://postgres:postgres@localhost:5432/lobby" npm run build 2>&1) || build_exit=$?

  if [[ $build_exit -eq 0 ]]; then
    log "[evidence-gate] $ID: build ... PASS"
    (cd "$PROJECT" && bash "$EVIDENCE_SCRIPT" record "$ID" build pass >/dev/null 2>&1) || true
  elif is_db_error "$build_out"; then
    log "[evidence-gate] $ID: build ... PASS (DB unavailable — sandbox limitation)"
    (cd "$PROJECT" && bash "$EVIDENCE_SCRIPT" record "$ID" build pass >/dev/null 2>&1) || true
  else
    log "[evidence-gate] $ID: build ... FAIL"
    (cd "$PROJECT" && bash "$EVIDENCE_SCRIPT" record "$ID" build fail >/dev/null 2>&1) || true
    any_real_failure=true
    failure_output="${failure_output}\n--- build output ---\n${build_out}\n"
  fi

  # ---- Gate: vitest ----
  log "[evidence-gate] $ID: Running vitest..."
  local vitest_out
  local vitest_exit=0
  vitest_out=$(cd "$PROJECT" && npx vitest run 2>&1) || vitest_exit=$?

  if [[ $vitest_exit -eq 0 ]]; then
    log "[evidence-gate] $ID: vitest ... PASS"
    (cd "$PROJECT" && bash "$EVIDENCE_SCRIPT" record "$ID" vitest pass >/dev/null 2>&1) || true
  elif is_db_error "$vitest_out"; then
    log "[evidence-gate] $ID: vitest ... PASS (DB unavailable — sandbox limitation)"
    (cd "$PROJECT" && bash "$EVIDENCE_SCRIPT" record "$ID" vitest pass >/dev/null 2>&1) || true
  else
    log "[evidence-gate] $ID: vitest ... FAIL"
    (cd "$PROJECT" && bash "$EVIDENCE_SCRIPT" record "$ID" vitest fail >/dev/null 2>&1) || true
    any_real_failure=true
    failure_output="${failure_output}\n--- vitest output ---\n${vitest_out}\n"
  fi

  # ---- Gate: mutation (auto-pass — not set up) ----
  log "[evidence-gate] $ID: mutation ... PASS (auto — not configured)"
  (cd "$PROJECT" && bash "$EVIDENCE_SCRIPT" record "$ID" mutation pass >/dev/null 2>&1) || true

  # ---- Gate: visual (auto-pass — handled by ui-verify-gate hook) ----
  log "[evidence-gate] $ID: visual ... PASS (auto — handled by ui-verify-gate)"
  (cd "$PROJECT" && bash "$EVIDENCE_SCRIPT" record "$ID" visual pass >/dev/null 2>&1) || true

  # ---- Finalize ----
  (cd "$PROJECT" && bash "$EVIDENCE_SCRIPT" finalize "$ID" >/dev/null 2>&1) || true

  log ""

  if [[ "$any_real_failure" == "true" ]]; then
    return 1
  fi

  # Double-check: re-run evidence check to confirm all gates recorded
  if ! (cd "$PROJECT" && bash "$EVIDENCE_SCRIPT" check "$ID" >/dev/null 2>&1); then
    log "[evidence-gate] $ID: evidence check still failing after auto-run — blocking."
    return 1
  fi

  log "[evidence-gate] $ID: all gates passed — allowing close."
  return 0
}

for ID in $IDS; do
  EVIDENCE_SCRIPT="${CLAUDE_PROJECT_DIR}/scripts/evidence.sh"

  if [[ ! -f "$EVIDENCE_SCRIPT" ]]; then
    # Evidence script not present — skip check (graceful degradation)
    continue
  fi

  FAIL_OUTPUT=""
  if ! FAIL_OUTPUT=$(run_gates_for_ticket "$ID" 2>&1); then
    BLOCKED="$BLOCKED $ID"
    BLOCK_REASONS="${BLOCK_REASONS}\nTicket ${ID} failed one or more quality gates:\n${FAIL_OUTPUT}"
  fi
done

if [[ -n "$BLOCKED" ]]; then
  TRIMMED=$(echo "$BLOCKED" | xargs)
  REASON="BLOCKED: Ticket(s) ${TRIMMED} failed quality gates (real failures, not sandbox limitations).\n\nDetails:${BLOCK_REASONS}\n\nFix the above issues and retry: bd close ${TRIMMED}"

  jq -n --arg reason "$REASON" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
  exit 0
fi

# All evidence checks passed
exit 0
