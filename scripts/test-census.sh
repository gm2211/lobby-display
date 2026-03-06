#\!/usr/bin/env bash
# test-census.sh — inventories the test suite and produces a machine-readable JSON snapshot.
#
# Usage:
#   scripts/test-census.sh                  # output JSON to stdout
#   scripts/test-census.sh --baseline       # save to .harness/census-baseline.json
#   scripts/test-census.sh --check          # compare vs baseline, exit 1 on regression
#   scripts/test-census.sh --output <file>  # write to specific file

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HARNESS_DIR="$REPO_ROOT/.harness"
BASELINE_FILE="$HARNESS_DIR/census-baseline.json"

MODE="stdout"
OUTPUT_FILE=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --baseline)
      MODE="baseline"
      shift
      ;;
    --check)
      MODE="check"
      shift
      ;;
    --output)
      MODE="output"
      OUTPUT_FILE="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: $0 [--baseline | --check | --output <file>]" >&2
      exit 1
      ;;
  esac
done

# Ensure .harness directory exists
mkdir -p "$HARNESS_DIR"

# ── Counting helpers ──────────────────────────────────────────────────────────

# Count lines matching a pattern in a file (returns 0 if no match)
count_pattern() {
  local pattern="$1"
  local file="$2"
  grep -cE "$pattern" "$file" 2>/dev/null || echo 0
}

# Count metrics for a single file
count_file() {
  local file="$1"

  # describe blocks: describe(...), test.describe(...) — any word followed by describe(
  local describes
  describes=$(count_pattern '(^|[^a-zA-Z])(describe)\s*\(' "$file")

  # it/test blocks — plain calls (not .skip/.only/.todo/.describe variants)
  # Matches: standalone "it(" and "test(" at the start or after non-word chars
  # Excludes: test.describe, test.skip, it.skip, etc. (those have a dot before the word)
  local tests
  tests=$(count_pattern '(^|[^a-zA-Z.])(it|test)\s*\(' "$file")

  # expect( calls
  local assertions
  assertions=$(count_pattern 'expect\(' "$file")

  # Skip occurrences: .skip(
  local skipped
  skipped=$(count_pattern '\.(skip)\s*\(' "$file")

  # Only occurrences: .only(
  local only
  only=$(count_pattern '\.(only)\s*\(' "$file")

  # Todo occurrences: .todo(
  local todo
  todo=$(count_pattern '\.(todo)\s*\(' "$file")

  echo "$describes $tests $assertions $skipped $only $todo"
}

# ── Build census ──────────────────────────────────────────────────────────────

build_census() {
  local timestamp
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  # Collect all test files
  local -a test_files=()
  while IFS= read -r -d '' f; do
    test_files+=("$f")
  done < <(find "$REPO_ROOT/tests" -name "*.test.ts" -print0 2>/dev/null | sort -z)

  while IFS= read -r -d '' f; do
    test_files+=("$f")
  done < <(find "$REPO_ROOT/e2e" -name "*.spec.ts" -print0 2>/dev/null | sort -z)

  local total_files=${#test_files[@]}
  local total_describes=0
  local total_tests=0
  local total_assertions=0
  local total_skipped=0
  local total_only=0
  local total_todo=0

  # Build file entries JSON
  local files_json=""
  local first=1

  for abs_file in "${test_files[@]}"; do
    # Make path relative to repo root
    local rel_file="${abs_file#$REPO_ROOT/}"

    read -r describes tests assertions skipped only todo < <(count_file "$abs_file")

    total_describes=$((total_describes + describes))
    total_tests=$((total_tests + tests))
    total_assertions=$((total_assertions + assertions))
    total_skipped=$((total_skipped + skipped))
    total_only=$((total_only + only))
    total_todo=$((total_todo + todo))

    local entry
    entry=$(printf '    "%s": {\n      "describes": %d,\n      "tests": %d,\n      "assertions": %d,\n      "skipped": %d,\n      "only": %d,\n      "todo": %d\n    }' \
      "$rel_file" "$describes" "$tests" "$assertions" "$skipped" "$only" "$todo")

    if [[ $first -eq 1 ]]; then
      files_json="$entry"
      first=0
    else
      files_json="$files_json,\n$entry"
    fi
  done

  # Emit JSON
  printf '{\n'
  printf '  "timestamp": "%s",\n' "$timestamp"
  printf '  "totals": {\n'
  printf '    "files": %d,\n' "$total_files"
  printf '    "describes": %d,\n' "$total_describes"
  printf '    "tests": %d,\n' "$total_tests"
  printf '    "assertions": %d,\n' "$total_assertions"
  printf '    "skipped": %d,\n' "$total_skipped"
  printf '    "only": %d,\n' "$total_only"
  printf '    "todo": %d\n' "$total_todo"
  printf '  },\n'
  printf '  "files": {\n'
  printf '%b\n' "$files_json"
  printf '  }\n'
  printf '}\n'
}

# ── Check mode ────────────────────────────────────────────────────────────────

run_check() {
  if [ ! -f "$BASELINE_FILE" ]; then
    echo "ERROR: No baseline found at $BASELINE_FILE" >&2
    echo "Run with --baseline first to create one." >&2
    exit 1
  fi

  local current
  current=$(build_census)

  local baseline
  baseline=$(cat "$BASELINE_FILE")

  local failed=0

  # Helper: extract integer value for a JSON key from the totals block
  json_get_total() {
    local json="$1"
    local key="$2"
    # Extract the totals block, then find the key
    echo "$json" | grep -A 10 '"totals"' | grep -oE "\"$key\"\s*:\s*[0-9]+" | grep -oE '[0-9]+' | head -1
  }

  # Extract totals from baseline
  local b_files b_tests b_assertions b_skipped b_only b_todo
  b_files=$(json_get_total "$baseline" "files")
  b_tests=$(json_get_total "$baseline" "tests")
  b_assertions=$(json_get_total "$baseline" "assertions")
  b_skipped=$(json_get_total "$baseline" "skipped")
  b_only=$(json_get_total "$baseline" "only")
  b_todo=$(json_get_total "$baseline" "todo")

  # Extract totals from current
  local c_files c_tests c_assertions c_skipped c_only c_todo
  c_files=$(json_get_total "$current" "files")
  c_tests=$(json_get_total "$current" "tests")
  c_assertions=$(json_get_total "$current" "assertions")
  c_skipped=$(json_get_total "$current" "skipped")
  c_only=$(json_get_total "$current" "only")
  c_todo=$(json_get_total "$current" "todo")

  echo "=== Test Census Check ==="
  echo ""
  printf "%-16s %-9s %-9s %s\n" "Metric" "Baseline" "Current" "Status"
  printf "%-16s %-9s %-9s %s\n" "------" "--------" "-------" "------"

  # Check: test count decreased?
  local test_status="OK"
  if [[ "$c_tests" -lt "$b_tests" ]]; then
    test_status="FAIL (decreased by $((b_tests - c_tests)))"
    failed=1
  elif [[ "$c_tests" -gt "$b_tests" ]]; then
    test_status="OK (increased by $((c_tests - b_tests)))"
  fi
  printf "%-16s %-9s %-9s %s\n" "tests" "$b_tests" "$c_tests" "$test_status"

  # Check: assertion count decreased?
  local assert_status="OK"
  if [[ "$c_assertions" -lt "$b_assertions" ]]; then
    assert_status="FAIL (decreased by $((b_assertions - c_assertions)))"
    failed=1
  elif [[ "$c_assertions" -gt "$b_assertions" ]]; then
    assert_status="OK (increased by $((c_assertions - b_assertions)))"
  fi
  printf "%-16s %-9s %-9s %s\n" "assertions" "$b_assertions" "$c_assertions" "$assert_status"

  # Check: file count (detect deletions)
  local file_status="OK"
  if [[ "$c_files" -lt "$b_files" ]]; then
    file_status="FAIL (${b_files} -> ${c_files}, possible deletions)"
    failed=1
  elif [[ "$c_files" -gt "$b_files" ]]; then
    file_status="OK (added $((c_files - b_files)) file(s))"
  fi
  printf "%-16s %-9s %-9s %s\n" "files" "$b_files" "$c_files" "$file_status"

  # Check: detect individually deleted files by comparing file keys
  local baseline_file_list current_file_list
  baseline_file_list=$(echo "$baseline" | grep -oE '"(tests|e2e)/[^"]+\.(test|spec)\.ts"' | tr -d '"' | sort)
  current_file_list=$(echo "$current" | grep -oE '"(tests|e2e)/[^"]+\.(test|spec)\.ts"' | tr -d '"' | sort)

  local deleted_files
  deleted_files=$(comm -23 <(echo "$baseline_file_list") <(echo "$current_file_list") 2>/dev/null || true)
  if [[ -n "$deleted_files" ]]; then
    echo ""
    echo "FAIL: The following test files were deleted:"
    echo "$deleted_files" | while read -r f; do echo "  - $f"; done
    failed=1
  fi

  # Check: .skip/.only increased?
  local skip_status="OK"
  if [[ "$c_skipped" -gt "$b_skipped" ]]; then
    skip_status="FAIL (increased by $((c_skipped - b_skipped)))"
    failed=1
  fi
  printf "%-16s %-9s %-9s %s\n" "skipped" "$b_skipped" "$c_skipped" "$skip_status"

  local only_status="OK"
  if [[ "$c_only" -gt "$b_only" ]]; then
    only_status="FAIL (increased by $((c_only - b_only)))"
    failed=1
  fi
  printf "%-16s %-9s %-9s %s\n" "only" "$b_only" "$c_only" "$only_status"

  # Warn (but pass) if .todo increased
  local todo_status="OK"
  if [[ "$c_todo" -gt "$b_todo" ]]; then
    todo_status="WARN (increased by $((c_todo - b_todo)))"
  fi
  printf "%-16s %-9s %-9s %s\n" "todo" "$b_todo" "$c_todo" "$todo_status"

  echo ""

  if [[ $failed -ne 0 ]]; then
    echo "RESULT: FAIL — regressions detected (see above)"
    exit 1
  else
    echo "RESULT: PASS — no regressions detected"
    exit 0
  fi
}

# ── Main ──────────────────────────────────────────────────────────────────────

case "$MODE" in
  stdout)
    build_census
    ;;
  baseline)
    echo "Building census and saving to $BASELINE_FILE ..." >&2
    build_census > "$BASELINE_FILE"
    echo "Saved: $BASELINE_FILE" >&2
    cat "$BASELINE_FILE"
    ;;
  output)
    build_census > "$OUTPUT_FILE"
    echo "Saved: $OUTPUT_FILE" >&2
    ;;
  check)
    run_check
    ;;
esac
