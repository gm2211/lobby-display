#!/bin/bash
# sync-data.sh — Copy prod's published content → staging. Read-only on prod.
# Thin wrapper around scripts/sync-prod-to-staging.ts (see its header for details).
#
# Usage:
#   PROD_SYNC_USER=<viewer> PROD_SYNC_PASS=<pass> \
#   STAGING_DATABASE_URL=<staging external URL> ./sync-data.sh [--apply]
#
# Without --apply it is a dry run. Or run the "Sync Prod Data → Staging" GitHub Action.
set -e
exec npx tsx "$(dirname "$0")/scripts/sync-prod-to-staging.ts" "$@"
