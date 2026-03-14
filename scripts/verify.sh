#\!/usr/bin/env bash
# verify.sh -- Unified quality gate runner
#
# Usage:
#   scripts/verify.sh [--quick | --full]
#
# Modes:
#   --quick  Fast feedback: tsc, vitest --changed, census check
#            Stops at first failure for speed.
#   --full   (default) Complete verification: tsc, build, vitest, census check
#            Continues all gates to collect all failures.
#
# Output:
#   Colorized terminal output showing pass/fail per gate.
#   Structured JSON report written to .harness/verify-report.json
#
# Exit codes:
#   0  All gates passed
#   1  One or more gates failed

set -uo pipefail

# ---------------------------------------------------------------------------
# Colors
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

CHECK="${GREEN}checkmark${RESET}"
CROSS="${RED}x${RESET}"
DASH="${YELLOW}-${RESET}"

# Use Unicode symbols if supported
if locale charmap 2>/dev/null | grep -qi utf; then
  CHECK="${GREEN}✓${RESET}"
  CROSS="${RED}✗${RESET}"
fi

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
MODE="full"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HARNESS_DIR="$PROJECT_ROOT/.harness"
REPORT_FILE="$HARNESS_DIR/verify-report.json"
DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/lobby}"

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --quick)
      MODE="quick"
      shift
      ;;
    --full)
      MODE="full"
      shift
      ;;
    -h|--help)
      grep '^# ' "$0" | sed 's/^# //'
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: $0 [--quick | --full]" >&2
      exit 1
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# now_ns -> nanoseconds compatible with macOS bash 3.2
now_ns() {
  python3 -c "import time; print(int(time.time() * 1e9))"
}

# elapsed_seconds <start_ns> -> floating-point seconds
elapsed_seconds() {
  local start_ns="$1"
  local end_ns
  end_ns=$(now_ns)
  python3 -c "print(round(($end_ns - $start_ns) / 1e9, 1))"
}

# truncate_lines <max> -- keep last N lines of stdin
truncate_lines() {
  local max="$1"
  tail -n "$max"
}

# json_string <value> -- escape a bash string for JSON
json_string() {
  python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$1"
}

# ---------------------------------------------------------------------------
# Gate runner
# ---------------------------------------------------------------------------
# run_gate <cmd...>
# Sets globals:
#   GATE_PASSED   (true|false)
#   GATE_DURATION (float seconds)
#   GATE_OUTPUT   (captured output, truncated to 50 lines)
run_gate() {
  local cmd_args=("$@")

  local start
  start=$(now_ns)
  local tmpout
  tmpout=$(mktemp)

  if "${cmd_args[@]}" >"$tmpout" 2>&1; then
    GATE_PASSED=true
  else
    GATE_PASSED=false
  fi

  GATE_DURATION=$(elapsed_seconds "$start")
  GATE_OUTPUT=$(truncate_lines 50 < "$tmpout")
  rm -f "$tmpout"
}

# ---------------------------------------------------------------------------
# Per-gate result storage (bash 3.2 compatible -- no associative arrays)
# ---------------------------------------------------------------------------
# Each gate stores: passed (true/false/skipped), duration, extra fields as JSON fragment

GATE_TSC_JSON=""
GATE_BUILD_JSON=""
GATE_VITEST_JSON=""
GATE_CENSUS_JSON=""
ERRORS_LIST=""
FAILED_COUNT=0

store_gate() {
  local name="$1"    # tsc|build|vitest|census
  local passed="$2"  # true|false|skipped
  local duration="$3"
  local extra="${4:-}"

  local json_val
  if [[ "$passed" == "skipped" ]]; then
    json_val="{\"passed\":null,\"skipped\":true,\"duration_seconds\":$duration${extra:+,$extra}}"
  elif [[ "$passed" == "true" ]]; then
    json_val="{\"passed\":true,\"duration_seconds\":$duration${extra:+,$extra}}"
  else
    json_val="{\"passed\":false,\"duration_seconds\":$duration${extra:+,$extra}}"
    if [[ -z "$ERRORS_LIST" ]]; then
      ERRORS_LIST="$name"
    else
      ERRORS_LIST="$ERRORS_LIST|$name"
    fi
    ((FAILED_COUNT++)) || true
  fi

  case "$name" in
    tsc)    GATE_TSC_JSON="$json_val" ;;
    build)  GATE_BUILD_JSON="$json_val" ;;
    vitest) GATE_VITEST_JSON="$json_val" ;;
    census) GATE_CENSUS_JSON="$json_val" ;;
  esac
}

gate_passed() {
  local name="$1"
  local json
  case "$name" in
    tsc)    json="$GATE_TSC_JSON" ;;
    build)  json="$GATE_BUILD_JSON" ;;
    vitest) json="$GATE_VITEST_JSON" ;;
    census) json="$GATE_CENSUS_JSON" ;;
    *)      return 1 ;;
  esac
  [[ "$json" == *'"passed":true'* ]]
}

gate_failed() {
  local name="$1"
  local json
  case "$name" in
    tsc)    json="$GATE_TSC_JSON" ;;
    build)  json="$GATE_BUILD_JSON" ;;
    vitest) json="$GATE_VITEST_JSON" ;;
    census) json="$GATE_CENSUS_JSON" ;;
    *)      return 1 ;;
  esac
  [[ "$json" == *'"passed":false'* ]]
}

gate_set() {
  local name="$1"
  case "$name" in
    tsc)    [[ -n "$GATE_TSC_JSON" ]] ;;
    build)  [[ -n "$GATE_BUILD_JSON" ]] ;;
    vitest) [[ -n "$GATE_VITEST_JSON" ]] ;;
    census) [[ -n "$GATE_CENSUS_JSON" ]] ;;
    *)      return 1 ;;
  esac
}

OVERALL_START=$(now_ns)

# ---------------------------------------------------------------------------
# Individual gate implementations
# ---------------------------------------------------------------------------

do_tsc() {
  echo -e "  ${CYAN}>${RESET} tsc --noEmit..."
  cd "$PROJECT_ROOT"
  run_gate npx tsc --noEmit
  local output_lines
  output_lines=$(echo "$GATE_OUTPUT" | grep -c '' 2>/dev/null || echo 0)
  [[ -z "$GATE_OUTPUT" ]] && output_lines=0

  if [[ "$GATE_PASSED" == "true" ]]; then
    echo -e "  ${CHECK} tsc --noEmit (${GATE_DURATION}s)"
    store_gate "tsc" "true" "$GATE_DURATION" "\"output_lines\":$output_lines"
  else
    echo -e "  ${CROSS} tsc --noEmit (${GATE_DURATION}s)"
    echo "$GATE_OUTPUT" | sed 's/^/    /' >&2
    store_gate "tsc" "false" "$GATE_DURATION" "\"output_lines\":$output_lines"
  fi
}

do_build() {
  echo -e "  ${CYAN}>${RESET} npm run build..."
  cd "$PROJECT_ROOT"
  run_gate env DATABASE_URL="$DATABASE_URL" npm run build
  local output_lines
  output_lines=$(echo "$GATE_OUTPUT" | grep -c '' 2>/dev/null || echo 0)
  [[ -z "$GATE_OUTPUT" ]] && output_lines=0

  if [[ "$GATE_PASSED" == "true" ]]; then
    echo -e "  ${CHECK} npm run build (${GATE_DURATION}s)"
    store_gate "build" "true" "$GATE_DURATION" "\"output_lines\":$output_lines"
  else
    echo -e "  ${CROSS} npm run build (${GATE_DURATION}s)"
    echo "$GATE_OUTPUT" | sed 's/^/    /' >&2
    store_gate "build" "false" "$GATE_DURATION" "\"output_lines\":$output_lines"
  fi
}

do_vitest() {
  local changed_only="${1:-false}"
  local vitest_cmd label

  if [[ "$changed_only" == "true" ]]; then
    vitest_cmd="npx vitest run --changed"
    label="vitest run --changed"
  else
    vitest_cmd="npx vitest run"
    label="vitest run"
  fi

  echo -e "  ${CYAN}>${RESET} ${label}..."
  cd "$PROJECT_ROOT"
  # shellcheck disable=SC2086
  run_gate $vitest_cmd

  local tests_passed=0
  local tests_failed=0
  if echo "$GATE_OUTPUT" | grep -qE 'Tests[[:space:]]+[0-9]'; then
    local passed_str
    passed_str=$(echo "$GATE_OUTPUT" | grep -oE '[0-9]+ passed' | grep -oE '^[0-9]+' | tail -1 || true)
    local failed_str
    failed_str=$(echo "$GATE_OUTPUT" | grep -oE '[0-9]+ failed' | grep -oE '^[0-9]+' | tail -1 || true)
    [[ -n "$passed_str" ]] && tests_passed="$passed_str"
    [[ -n "$failed_str" ]] && tests_failed="$failed_str"
  fi

  if [[ "$GATE_PASSED" == "true" ]]; then
    echo -e "  ${CHECK} ${label} (${GATE_DURATION}s)"
    store_gate "vitest" "true" "$GATE_DURATION" "\"tests_passed\":$tests_passed,\"tests_failed\":$tests_failed"
  else
    echo -e "  ${CROSS} ${label} (${GATE_DURATION}s)"
    if [[ "$tests_failed" -gt 0 ]]; then
      echo -e "    ${RED}-> ${tests_failed} test(s) failed (see output above)${RESET}" >&2
    fi
    echo "$GATE_OUTPUT" | sed 's/^/    /' >&2
    store_gate "vitest" "false" "$GATE_DURATION" "\"tests_passed\":$tests_passed,\"tests_failed\":$tests_failed"
  fi
}

do_census() {
  local census_script="$SCRIPT_DIR/test-census.sh"
  local census_baseline="$HARNESS_DIR/census-baseline.json"

  if [[ ! -f "$census_script" ]] || [[ ! -f "$census_baseline" ]]; then
    local reason="no census script"
    [[ -f "$census_script" ]] && reason="no baseline"
    echo -e "  ${DASH} census check (skipped - ${reason})"
    store_gate "census" "skipped" "0" "\"note\":\"skipped: ${reason}\""
    return
  fi

  echo -e "  ${CYAN}>${RESET} census check..."
  cd "$PROJECT_ROOT"
  run_gate bash "$census_script" --check

  if [[ "$GATE_PASSED" == "true" ]]; then
    echo -e "  ${CHECK} census check (${GATE_DURATION}s)"
    store_gate "census" "true" "$GATE_DURATION" "\"note\":\"no regression\""
  else
    echo -e "  ${CROSS} census check (${GATE_DURATION}s)"
    echo "$GATE_OUTPUT" | sed 's/^/    /' >&2
    store_gate "census" "false" "$GATE_DURATION" "\"note\":\"regression detected\""
  fi
}

# ---------------------------------------------------------------------------
# Write JSON report
# ---------------------------------------------------------------------------
write_report() {
  local total_duration
  total_duration=$(elapsed_seconds "$OVERALL_START")
  local timestamp
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  # Build gates JSON block -- include only gates that were set
  local gates_block="{"
  local first=true
  for key in tsc build vitest census; do
    if gate_set "$key"; then
      local gate_json
      case "$key" in
        tsc)    gate_json="$GATE_TSC_JSON" ;;
        build)  gate_json="$GATE_BUILD_JSON" ;;
        vitest) gate_json="$GATE_VITEST_JSON" ;;
        census) gate_json="$GATE_CENSUS_JSON" ;;
      esac
      [[ "$first" == "true" ]] && first=false || gates_block+=","
      gates_block+="\"$key\":$gate_json"
    fi
  done
  gates_block+="}"

  # Build errors array from pipe-delimited list
  local errors_json="["
  local efirst=true
  if [[ -n "$ERRORS_LIST" ]]; then
    IFS='|' read -r -a err_arr <<< "$ERRORS_LIST"
    for err in "${err_arr[@]}"; do
      [[ -z "$err" ]] && continue
      [[ "$efirst" == "true" ]] && efirst=false || errors_json+=","
      errors_json+=$(json_string "$err")
    done
  fi
  errors_json+="]"

  local overall_passed="true"
  [[ $FAILED_COUNT -gt 0 ]] && overall_passed="false"

  mkdir -p "$HARNESS_DIR"
  # Write JSON report using printf (avoids Python true/false parsing issues)
  printf '{\n  "timestamp": "%s",\n  "mode": "%s",\n  "duration_seconds": %s,\n  "passed": %s,\n  "gates": %s,\n  "errors": %s\n}\n' \
    "$timestamp" "$MODE" "$total_duration" "$overall_passed" "$gates_block" "$errors_json" > "$REPORT_FILE"
}

# ---------------------------------------------------------------------------
# Main execution
# ---------------------------------------------------------------------------
echo -e "${BOLD}[verify]${RESET} Running in ${CYAN}${MODE}${RESET} mode..."
echo ""

if [[ "$MODE" == "quick" ]]; then
  # Quick mode: stop at first failure

  do_tsc
  if gate_failed "tsc"; then
    echo -e "  ${DASH} vitest run --changed (skipped - tsc failed)"
    store_gate "vitest" "skipped" "0" "\"note\":\"skipped: tsc failed\""
    echo -e "  ${DASH} census check (skipped - tsc failed)"
    store_gate "census" "skipped" "0" "\"note\":\"skipped: tsc failed\""
  else
    do_vitest "true"
    if gate_failed "vitest"; then
      echo -e "  ${DASH} census check (skipped - vitest failed)"
      store_gate "census" "skipped" "0" "\"note\":\"skipped: vitest failed\""
    else
      do_census
    fi
  fi

else
  # Full mode: run all gates, collect all failures

  do_tsc
  do_build
  do_vitest "false"
  do_census

fi

echo ""

TOTAL_DURATION=$(elapsed_seconds "$OVERALL_START")
write_report

if [[ $FAILED_COUNT -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}All gates passed${RESET} (${TOTAL_DURATION}s total)"
  echo "Report: ${REPORT_FILE}"
  exit 0
else
  echo -e "${RED}${BOLD}FAILED: ${FAILED_COUNT} gate(s) failed${RESET} (${TOTAL_DURATION}s total)" >&2
  echo -e "${RED}Failed gates:${RESET}" >&2
  for key in tsc build vitest census; do
    if gate_failed "$key"; then
      echo -e "  ${CROSS} $key" >&2
    fi
  done
  echo "Report: ${REPORT_FILE}"
  exit 1
fi
