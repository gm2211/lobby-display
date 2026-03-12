#!/usr/bin/env bash
# =============================================================================
# scripts/tdd-state.sh — TDD State Machine Manager
#
# Manages the Red→Green→Refactor TDD cycle state for the harness.
#
# State file: .harness/.tdd-state (JSON)
# Disable marker: .harness/.tdd-disabled
#
# Usage:
#   scripts/tdd-state.sh show               — display current state and context
#   scripts/tdd-state.sh init               — initialize state to RED
#   scripts/tdd-state.sh transition <event> — trigger a state transition
#     Events: test_failed | test_passed | refactor_done
#   scripts/tdd-state.sh reset              — reset to RED
#   scripts/tdd-state.sh disable            — disable enforcement
#   scripts/tdd-state.sh enable             — re-enable enforcement
#
# Valid transitions:
#   RED      + test_failed   → GREEN
#   GREEN    + test_passed   → REFACTOR
#   REFACTOR + refactor_done → RED
# =============================================================================

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo ".")"
STATE_FILE="$REPO_ROOT/.harness/.tdd-state"
DISABLED_MARKER="$REPO_ROOT/.harness/.tdd-disabled"
HARNESS_DIR="$REPO_ROOT/.harness"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

now_iso() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

ensure_harness_dir() {
  mkdir -p "$HARNESS_DIR"
}

is_disabled() {
  [[ -f "$DISABLED_MARKER" ]]
}

state_exists() {
  [[ -f "$STATE_FILE" ]]
}

get_state() {
  if state_exists; then
    jq -r '.state' "$STATE_FILE"
  else
    echo "UNINITIALIZED"
  fi
}

get_since() {
  if state_exists; then
    jq -r '.since' "$STATE_FILE"
  else
    echo "N/A"
  fi
}

write_state() {
  local new_state="$1"
  local current_time
  current_time="$(now_iso)"

  local existing_transitions="[]"
  if state_exists; then
    existing_transitions="$(jq '.transitions // []' "$STATE_FILE")"
  fi

  local existing_snapshot="null"
  if state_exists; then
    existing_snapshot="$(jq '.test_snapshot // null' "$STATE_FILE")"
  fi

  jq -n \
    --arg state "$new_state" \
    --arg since "$current_time" \
    --argjson transitions "$existing_transitions" \
    --argjson test_snapshot "$existing_snapshot" \
    '{
      state: $state,
      since: $since,
      transitions: $transitions,
      test_snapshot: $test_snapshot
    }' > "$STATE_FILE"
}

append_transition() {
  local from="$1"
  local to="$2"
  local event="$3"
  local current_time
  current_time="$(now_iso)"

  local tmp
  tmp="$(mktemp)"
  jq \
    --arg from "$from" \
    --arg to "$to" \
    --arg at "$current_time" \
    --arg event "$event" \
    '.transitions += [{"from": $from, "to": $to, "at": $at, "event": $event}]' \
    "$STATE_FILE" > "$tmp" && mv "$tmp" "$STATE_FILE"
}

update_state_field() {
  local field="$1"
  local value="$2"
  local tmp
  tmp="$(mktemp)"
  jq --arg field "$field" --arg value "$value" \
    '.[$field] = $value' "$STATE_FILE" > "$tmp" && mv "$tmp" "$STATE_FILE"
}

color_state() {
  local state="$1"
  case "$state" in
    RED)      printf "\033[1;31m%s\033[0m" "$state" ;;
    GREEN)    printf "\033[1;32m%s\033[0m" "$state" ;;
    REFACTOR) printf "\033[1;33m%s\033[0m" "$state" ;;
    *)        printf "%s" "$state" ;;
  esac
}

# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

cmd_show() {
  if is_disabled; then
    echo "TDD enforcement is DISABLED (.harness/.tdd-disabled exists)"
    echo ""
  fi

  if ! state_exists; then
    echo "TDD state not initialized. Run: scripts/tdd-state.sh init"
    exit 0
  fi

  local current_state since
  current_state="$(get_state)"
  since="$(get_since)"

  echo ""
  echo "  TDD State: $(color_state "$current_state")"
  echo "  Since:     $since"
  echo ""

  case "$current_state" in
    RED)
      echo "  Expected action: Write a FAILING test"
      echo "  Allowed writes:  tests/**/*.test.ts, e2e/**/*.spec.ts, config files"
      echo "  Blocked writes:  server/**/*.ts, src/**/*.ts, src/**/*.tsx"
      echo ""
      echo "  Transition: run vitest and see a new test FAIL => state becomes GREEN"
      ;;
    GREEN)
      echo "  Expected action: Make the failing test PASS"
      echo "  Allowed writes:  server/**/*.ts, src/**/*.ts, src/**/*.tsx, config files"
      echo "  Blocked writes:  tests/**/*.test.ts, e2e/**/*.spec.ts"
      echo ""
      echo "  Transition: run vitest and all tests PASS => state becomes REFACTOR"
      ;;
    REFACTOR)
      echo "  Expected action: Clean up / refactor (all tests must stay green)"
      echo "  Allowed writes:  everything"
      echo ""
      echo "  Transition: signal refactor_done => state becomes RED (next cycle)"
      ;;
  esac

  echo ""

  local transition_count
  transition_count="$(jq '.transitions | length' "$STATE_FILE")"
  if [[ "$transition_count" -gt 0 ]]; then
    echo "  Recent transitions (last 5):"
    jq -r '[ .transitions | last(if length > 5 then .[length-5:] else . end)[] ] |
      .[] | "    \(.from) -> \(.to) [\(.event)] at \(.at)"' "$STATE_FILE" 2>/dev/null || true
    echo ""
  fi

  local snapshot
  snapshot="$(jq -r '.test_snapshot // empty' "$STATE_FILE" 2>/dev/null || true)"
  if [[ -n "$snapshot" ]] && [[ "$snapshot" != "null" ]]; then
    echo "  Test snapshot:"
    jq -r '.test_snapshot | to_entries[] | "    \(.key): \(.value)"' "$STATE_FILE" 2>/dev/null || true
    echo ""
  fi
}

cmd_init() {
  ensure_harness_dir

  if state_exists; then
    echo "TDD state already initialized (current: $(get_state))"
    echo "Use 'reset' to restart, or 'show' to view current state."
    exit 0
  fi

  local current_time
  current_time="$(now_iso)"

  jq -n \
    --arg since "$current_time" \
    '{
      state: "RED",
      since: $since,
      transitions: [],
      test_snapshot: null
    }' > "$STATE_FILE"

  echo "TDD state initialized -> RED"
  echo "Next: write a failing test, then run: scripts/tdd-state.sh transition test_failed"
}

cmd_transition() {
  local event="${1:-}"

  if [[ -z "$event" ]]; then
    echo "Usage: scripts/tdd-state.sh transition <event>" >&2
    echo "Events: test_failed | test_passed | refactor_done" >&2
    exit 1
  fi

  if ! state_exists; then
    echo "TDD state not initialized. Run: scripts/tdd-state.sh init" >&2
    exit 1
  fi

  local current_state
  current_state="$(get_state)"

  case "$current_state/$event" in
    RED/test_failed)
      append_transition "RED" "GREEN" "test_failed"
      update_state_field "state" "GREEN"
      update_state_field "since" "$(now_iso)"
      echo "Transition: RED -> GREEN (test_failed)"
      echo "Now make the failing test pass."
      ;;
    GREEN/test_passed)
      append_transition "GREEN" "REFACTOR" "test_passed"
      update_state_field "state" "REFACTOR"
      update_state_field "since" "$(now_iso)"
      echo "Transition: GREEN -> REFACTOR (test_passed)"
      echo "All tests pass. Now clean up / refactor."
      ;;
    REFACTOR/refactor_done)
      append_transition "REFACTOR" "RED" "refactor_done"
      update_state_field "state" "RED"
      update_state_field "since" "$(now_iso)"
      echo "Transition: REFACTOR -> RED (refactor_done)"
      echo "Cycle complete. Write the next failing test."
      ;;
    RED/test_passed)
      echo "WARNING: In RED state but all tests passed. Your new test should be FAILING first!" >&2
      echo "State unchanged: RED" >&2
      exit 1
      ;;
    GREEN/test_failed)
      echo "Still in GREEN state -- tests are failing. Keep working to make them pass."
      exit 0
      ;;
    REFACTOR/test_failed)
      echo "WARNING: In REFACTOR state but tests are failing. Refactoring broke tests! Fix before continuing." >&2
      exit 1
      ;;
    *)
      echo "Invalid transition: $current_state + $event" >&2
      echo "Valid events for $current_state:" >&2
      case "$current_state" in
        RED)      echo "  test_failed   -- a new failing test exists" >&2 ;;
        GREEN)    echo "  test_passed   -- all tests now pass" >&2 ;;
        REFACTOR) echo "  refactor_done -- done cleaning up, ready for next feature" >&2 ;;
      esac
      exit 1
      ;;
  esac
}

cmd_reset() {
  ensure_harness_dir

  local current_time
  current_time="$(now_iso)"

  local existing_transitions="[]"
  if state_exists; then
    existing_transitions="$(jq '.transitions // []' "$STATE_FILE")"
    local current_state
    current_state="$(get_state)"
    existing_transitions="$(echo "$existing_transitions" | jq \
      --arg from "$current_state" \
      --arg at "$current_time" \
      '. += [{"from": $from, "to": "RED", "at": $at, "event": "reset"}]')"
  fi

  jq -n \
    --arg since "$current_time" \
    --argjson transitions "$existing_transitions" \
    '{
      state: "RED",
      since: $since,
      transitions: $transitions,
      test_snapshot: null
    }' > "$STATE_FILE"

  echo "TDD state reset -> RED"
}

cmd_disable() {
  ensure_harness_dir
  touch "$DISABLED_MARKER"
  echo "TDD enforcement DISABLED (.harness/.tdd-disabled created)"
  echo "All Edit/Write operations will be allowed."
  echo "Run 'enable' to re-enable enforcement."
}

cmd_enable() {
  if [[ -f "$DISABLED_MARKER" ]]; then
    rm -f "$DISABLED_MARKER"
    echo "TDD enforcement ENABLED"
  else
    echo "TDD enforcement was already enabled"
  fi
}

cmd_help() {
  cat <<'HELPEOF'
Usage: scripts/tdd-state.sh <command> [args]

Commands:
  show                    Display current state, context, and transition history
  init                    Initialize state to RED (creates .harness/.tdd-state)
  transition <event>      Manually trigger a state transition
                            Events: test_failed | test_passed | refactor_done
  reset                   Reset state to RED (preserves transition history)
  disable                 Disable TDD enforcement (creates .harness/.tdd-disabled)
  enable                  Re-enable TDD enforcement
  help                    Show this help

State machine:
  RED      -- write a failing test  --[test_failed]-->  GREEN
  GREEN    -- make tests pass       --[test_passed]-->  REFACTOR
  REFACTOR -- clean up code         --[refactor_done]--> RED
HELPEOF
}

# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------

COMMAND="${1:-help}"
shift || true

case "$COMMAND" in
  show)       cmd_show ;;
  init)       cmd_init ;;
  transition) cmd_transition "${1:-}" ;;
  reset)      cmd_reset ;;
  disable)    cmd_disable ;;
  enable)     cmd_enable ;;
  help|--help|-h) cmd_help ;;
  *)
    echo "Unknown command: $COMMAND" >&2
    cmd_help >&2
    exit 1
    ;;
esac
