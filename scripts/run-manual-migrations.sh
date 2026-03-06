#!/usr/bin/env bash
# run-manual-migrations.sh
#
# Applies manual SQL migration files that Prisma cannot generate automatically
# (e.g., cross-schema foreign key constraints).
#
# Usage:
#   DATABASE_URL="postgresql://user:pass@host:5432/dbname" ./scripts/run-manual-migrations.sh
#
# The script applies migrations in alphabetical order and reports success/failure
# for each file.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$SCRIPT_DIR/../prisma/migrations/manual"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set." >&2
  exit 1
fi

if ! command -v psql &>/dev/null; then
  echo "ERROR: psql is not installed or not in PATH." >&2
  exit 1
fi

# Known manual migrations (applied in order):
#   cross_schema_fk.sql  — cross-schema FK: platform."PlatformUser" -> public."User"

echo "Applying manual migrations from: $MIGRATIONS_DIR"
echo ""

applied=0
failed=0

for sql_file in "$MIGRATIONS_DIR"/*.sql; do
  if [[ ! -f "$sql_file" ]]; then
    echo "No .sql files found in $MIGRATIONS_DIR"
    break
  fi

  filename="$(basename "$sql_file")"
  printf "  Applying %s ... " "$filename"

  if psql "$DATABASE_URL" -f "$sql_file" -v ON_ERROR_STOP=1 --quiet; then
    echo "OK"
    applied=$((applied + 1))
  else
    echo "FAILED"
    failed=$((failed + 1))
  fi
done

echo ""
echo "Done: $applied applied, $failed failed."

if [[ $failed -gt 0 ]]; then
  exit 1
fi
