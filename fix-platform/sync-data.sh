#!/bin/bash
set -e

STAGING_SCHEMA="staging"
PROD_SCHEMA="public"
# Tables to sync (skip users — staging has its own auth)
TABLES="Service Event Advisory BuildingConfig PublishedSnapshot"

# ── Check prerequisites ────────────────────────────────────
if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL environment variable is required"
  echo "Set it to the shared Postgres connection string (no schema param)"
  exit 1
fi

# Ensure we're using the base URL without schema param
BASE_URL=$(echo "$DATABASE_URL" | sed 's/[?&]schema=[^&]*//')

echo "Syncing data: ${PROD_SCHEMA} → ${STAGING_SCHEMA}"
echo "Tables: ${TABLES}"
echo ""

if [ "$1" != "--force" ]; then
  read -rp "This will TRUNCATE all staging tables and replace with prod data. Continue? [y/N]: " CONFIRM
  if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "Aborted."
    exit 0
  fi
fi

# ── Generate and run sync SQL ──────────────────────────────
for TABLE in $TABLES; do
  QUOTED_TABLE="\"${TABLE}\""

  echo "Syncing ${TABLE}..."

  SQL="
DO \$\$
DECLARE
  common_cols TEXT;
BEGIN
  SELECT string_agg(quote_ident(c1.column_name), ', ')
  INTO common_cols
  FROM information_schema.columns c1
  INNER JOIN information_schema.columns c2
    ON c1.column_name = c2.column_name
  WHERE c1.table_schema = '${PROD_SCHEMA}'
    AND c1.table_name = '${TABLE}'
    AND c2.table_schema = '${STAGING_SCHEMA}'
    AND c2.table_name = '${TABLE}';

  IF common_cols IS NULL THEN
    RAISE NOTICE 'Table ${TABLE}: no common columns found, skipping';
    RETURN;
  END IF;

  EXECUTE format('TRUNCATE TABLE ${STAGING_SCHEMA}.${QUOTED_TABLE} CASCADE');
  EXECUTE format(
    'INSERT INTO ${STAGING_SCHEMA}.${QUOTED_TABLE} (%s) SELECT %s FROM ${PROD_SCHEMA}.${QUOTED_TABLE}',
    common_cols, common_cols
  );

  RAISE NOTICE 'Table ${TABLE}: synced (columns: %)', common_cols;
END \$\$;
"

  echo "$SQL" | npx prisma db execute --stdin --url "${BASE_URL}"
done

echo ""
echo "Sync complete. Staging now has a copy of prod data."
echo "Note: User accounts were NOT synced (staging has its own auth)."
