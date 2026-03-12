#!/usr/bin/env bash
# evidence.sh — per-task evidence ledger for quality gate verification
#
# Commands:
#   evidence init <ticket-id>                  — initialize evidence file
#   evidence record <ticket-id> <gate> <result> — record a gate result (pass|fail)
#   evidence finalize <ticket-id>              — capture census_after, compute deltas
#   evidence check <ticket-id>                 — exit 0 only if all required gates pass
#
# Evidence files are stored in .harness/evidence/<ticket-id>.json
# relative to the directory the script is called from (project root).

set -euo pipefail

REQUIRED_GATES=("tsc" "build" "vitest" "mutation" "visual")

usage() {
  cat >&2 <<EOF
Usage: evidence.sh <command> [args...]

Commands:
  init <ticket-id>                     Create evidence file for a ticket
  record <ticket-id> <gate> <result>   Record gate result (pass|fail)
  finalize <ticket-id>                 Capture census_after and compute deltas
  check <ticket-id>                    Check all required gates pass (exit 0 = ok)

Required gates: tsc, build, vitest, mutation, visual
EOF
  exit 1
}

# Get the evidence directory (relative to CWD, which should be project root)
evidence_dir() {
  echo ".harness/evidence"
}

# Get the evidence file path for a ticket
evidence_file() {
  local ticket_id="$1"
  echo "$(evidence_dir)/${ticket_id}.json"
}

# Capture a census snapshot: counts of files grouped by type
# Returns a JSON object with file counts
capture_census() {
  # Count TypeScript files
  local ts_count
  ts_count=$(find . -name "*.ts" -not -path "*/node_modules/*" -not -path "*/.harness/*" 2>/dev/null | wc -l | tr -d ' ')

  # Count TSX files
  local tsx_count
  tsx_count=$(find . -name "*.tsx" -not -path "*/node_modules/*" -not -path "*/.harness/*" 2>/dev/null | wc -l | tr -d ' ')

  # Count test files (need to combine both patterns)
  local test_count
  test_count=$(find . \( -name "*.test.ts" -o -name "*.test.tsx" \) -not -path "*/node_modules/*" 2>/dev/null | wc -l | tr -d ' ')

  # Count shell scripts
  local sh_count
  sh_count=$(find . -name "*.sh" -not -path "*/node_modules/*" -not -path "*/.harness/*" 2>/dev/null | wc -l | tr -d ' ')

  jq -n \
    --arg ts "$ts_count" \
    --arg tsx "$tsx_count" \
    --arg test "$test_count" \
    --arg sh "$sh_count" \
    '{
      ts_files: ($ts | tonumber),
      tsx_files: ($tsx | tonumber),
      test_files: ($test | tonumber),
      sh_files: ($sh | tonumber)
    }'
}

# Compute delta between two census objects
compute_delta() {
  local before="$1"
  local after="$2"

  jq -n \
    --argjson before "$before" \
    --argjson after "$after" \
    '{
      ts_files: (($after.ts_files // 0) - ($before.ts_files // 0)),
      tsx_files: (($after.tsx_files // 0) - ($before.tsx_files // 0)),
      test_files: (($after.test_files // 0) - ($before.test_files // 0)),
      sh_files: (($after.sh_files // 0) - ($before.sh_files // 0))
    }'
}

# ISO 8601 timestamp
now_iso() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

# ---- Subcommands ----

cmd_init() {
  local ticket_id="${1:-}"
  if [[ -z "$ticket_id" ]]; then
    echo "ERROR: init requires <ticket-id>" >&2
    usage
  fi

  local file
  file=$(evidence_file "$ticket_id")
  local dir
  dir=$(evidence_dir)

  # Check if already initialized
  if [[ -f "$file" ]]; then
    echo "ERROR: Evidence file already exists for ticket '$ticket_id': $file" >&2
    echo "Use 'evidence record' to add gate results." >&2
    exit 1
  fi

  # Create directory
  mkdir -p "$dir"

  # Capture census_before
  local census_before
  census_before=$(capture_census)

  # Get agent name from environment or git
  local agent
  agent="${CLAUDE_AGENT_NAME:-${USER:-unknown}}"

  # Write initial evidence file
  jq -n \
    --arg ticket_id "$ticket_id" \
    --arg agent "$agent" \
    --arg start_time "$(now_iso)" \
    --argjson census_before "$census_before" \
    '{
      ticket_id: $ticket_id,
      agent: $agent,
      start_time: $start_time,
      gates: {},
      census_before: $census_before
    }' > "$file"

  echo "Initialized evidence for ticket: $ticket_id"
  echo "File: $file"
}

cmd_record() {
  local ticket_id="${1:-}"
  local gate="${2:-}"
  local result="${3:-}"

  if [[ -z "$ticket_id" ]]; then
    echo "ERROR: record requires <ticket-id> <gate> <result>" >&2
    usage
  fi
  if [[ -z "$gate" ]]; then
    echo "ERROR: record requires <gate> argument" >&2
    usage
  fi
  if [[ -z "$result" ]]; then
    echo "ERROR: record requires <result> argument (pass|fail)" >&2
    usage
  fi

  # Validate result
  if [[ "$result" != "pass" && "$result" != "fail" ]]; then
    echo "ERROR: <result> must be 'pass' or 'fail', got: '$result'" >&2
    exit 1
  fi

  local file
  file=$(evidence_file "$ticket_id")

  # Check ticket is initialized
  if [[ ! -f "$file" ]]; then
    echo "ERROR: Evidence file not found for ticket '$ticket_id'" >&2
    echo "Run 'evidence init $ticket_id' first." >&2
    exit 1
  fi

  local timestamp
  timestamp=$(now_iso)

  # Update the gates object in the evidence file
  local tmp
  tmp="${file}.tmp"
  jq \
    --arg gate "$gate" \
    --arg result "$result" \
    --arg timestamp "$timestamp" \
    '.gates[$gate] = { result: $result, timestamp: $timestamp }' \
    "$file" > "$tmp" && mv "$tmp" "$file"

  echo "Recorded gate '$gate' = $result for ticket: $ticket_id"
}

cmd_finalize() {
  local ticket_id="${1:-}"
  if [[ -z "$ticket_id" ]]; then
    echo "ERROR: finalize requires <ticket-id>" >&2
    usage
  fi

  local file
  file=$(evidence_file "$ticket_id")

  # Check ticket is initialized
  if [[ ! -f "$file" ]]; then
    echo "ERROR: Evidence file not found for ticket '$ticket_id'" >&2
    echo "Run 'evidence init $ticket_id' first." >&2
    exit 1
  fi

  # Capture census_after
  local census_after
  census_after=$(capture_census)

  # Get census_before
  local census_before
  census_before=$(jq '.census_before' "$file")

  # Compute delta
  local census_delta
  census_delta=$(compute_delta "$census_before" "$census_after")

  local end_time
  end_time=$(now_iso)

  local tmp
  tmp="${file}.tmp"
  jq \
    --argjson census_after "$census_after" \
    --argjson census_delta "$census_delta" \
    --arg end_time "$end_time" \
    '. + {
      census_after: $census_after,
      census_delta: $census_delta,
      end_time: $end_time
    }' \
    "$file" > "$tmp" && mv "$tmp" "$file"

  echo "Finalized evidence for ticket: $ticket_id"
  echo "  census_delta: $(echo "$census_delta" | jq -c .)"
}

cmd_check() {
  local ticket_id="${1:-}"
  if [[ -z "$ticket_id" ]]; then
    echo "ERROR: check requires <ticket-id>" >&2
    usage
  fi

  local file
  file=$(evidence_file "$ticket_id")

  # Check ticket is initialized
  if [[ ! -f "$file" ]]; then
    echo "ERROR: Evidence file not found for ticket '$ticket_id'" >&2
    echo "Run 'evidence init $ticket_id' first." >&2
    exit 1
  fi

  local all_pass=true
  local missing_gates=()
  local failed_gates=()

  for gate in "${REQUIRED_GATES[@]}"; do
    local gate_result
    gate_result=$(jq -r --arg gate "$gate" '.gates[$gate].result // "missing"' "$file")

    if [[ "$gate_result" == "missing" ]]; then
      missing_gates+=("$gate")
      all_pass=false
    elif [[ "$gate_result" == "fail" ]]; then
      failed_gates+=("$gate")
      all_pass=false
    fi
  done

  if [[ "$all_pass" == "true" ]]; then
    echo "All required gates passed for ticket: $ticket_id"
    exit 0
  else
    echo "Evidence check FAILED for ticket: $ticket_id" >&2

    if [[ ${#missing_gates[@]} -gt 0 ]]; then
      echo "  Missing gates: ${missing_gates[*]}" >&2
    fi

    if [[ ${#failed_gates[@]} -gt 0 ]]; then
      echo "  Failed gates: ${failed_gates[*]}" >&2
    fi

    echo "" >&2
    echo "Required gates: ${REQUIRED_GATES[*]}" >&2
    echo "Run 'evidence record <ticket-id> <gate> <pass|fail>' for each gate." >&2
    exit 1
  fi
}

# ---- Main dispatch ----

SUBCOMMAND="${1:-}"
shift 2>/dev/null || true

case "$SUBCOMMAND" in
  init)
    cmd_init "$@"
    ;;
  record)
    cmd_record "$@"
    ;;
  finalize)
    cmd_finalize "$@"
    ;;
  check)
    cmd_check "$@"
    ;;
  "")
    echo "ERROR: No subcommand provided." >&2
    usage
    ;;
  *)
    echo "ERROR: Unknown subcommand: '$SUBCOMMAND'" >&2
    usage
    ;;
esac
