# Staging Environment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a zero-cost staging environment with PR-based promotion, Render API rollback, and prod→staging data sync.

**Architecture:** Second Render free-tier web service deploying from a `staging` branch, sharing the same Postgres DB via schema isolation (`public` for prod, `staging` for staging). Shell scripts handle promotion, rollback, and data sync.

**Tech Stack:** Render (web services + Postgres), GitHub CLI (`gh`), Render API, Prisma schema isolation via `?schema=` URL parameter.

---

### Task 1: Create Render build/start wrapper scripts

**Files:**
- Create: `scripts/render-build.sh`
- Create: `scripts/render-start.sh`

Both services (prod and staging) use the same scripts. When `DATABASE_SCHEMA` env var is set (staging only), the scripts create the schema and construct `DATABASE_URL` with `?schema=staging`. When unset (prod), they do nothing extra.

**Step 1: Create `scripts/render-build.sh`**

```bash
#!/bin/bash
set -e

npm ci --include=dev

# If DATABASE_SCHEMA is set (staging), create the schema and rewrite DATABASE_URL
if [ -n "$DATABASE_SCHEMA" ] && [ -n "$DATABASE_INTERNAL_URL" ]; then
  echo "Ensuring schema '${DATABASE_SCHEMA}' exists..."
  echo "CREATE SCHEMA IF NOT EXISTS \"${DATABASE_SCHEMA}\"" | npx prisma db execute --stdin --url "${DATABASE_INTERNAL_URL}"
  export DATABASE_URL="${DATABASE_INTERNAL_URL}?schema=${DATABASE_SCHEMA}"
  echo "DATABASE_URL set to use schema '${DATABASE_SCHEMA}'"
fi

npm run build
```

**Step 2: Create `scripts/render-start.sh`**

```bash
#!/bin/bash
set -e

if [ -n "$DATABASE_SCHEMA" ] && [ -n "$DATABASE_INTERNAL_URL" ]; then
  export DATABASE_URL="${DATABASE_INTERNAL_URL}?schema=${DATABASE_SCHEMA}"
fi

exec npm start
```

**Step 3: Make scripts executable**

Run: `chmod +x scripts/render-build.sh scripts/render-start.sh`

**Step 4: Commit**

```bash
git add scripts/render-build.sh scripts/render-start.sh
git commit -m "feat: add Render build/start scripts with schema isolation support"
```

---

### Task 2: Update render.yaml with staging service

**Files:**
- Modify: `render.yaml`

**Step 1: Replace render.yaml with both services**

```yaml
databases:
  - name: renzo-db
    plan: free
    databaseName: lobby

services:
  # ── Production ──────────────────────────────────────────
  - type: web
    name: renzo
    runtime: node
    plan: free
    branch: main
    buildCommand: bash scripts/render-build.sh
    startCommand: bash scripts/render-start.sh
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: renzo-db
          property: connectionString
      - key: NODE_ENV
        value: production
      - key: COOKIE_SECRET
        generateValue: true

  # ── Staging ─────────────────────────────────────────────
  - type: web
    name: renzo-staging
    runtime: node
    plan: free
    branch: staging
    buildCommand: bash scripts/render-build.sh
    startCommand: bash scripts/render-start.sh
    envVars:
      - key: DATABASE_INTERNAL_URL
        fromDatabase:
          name: renzo-db
          property: connectionString
      - key: DATABASE_SCHEMA
        value: staging
      - key: NODE_ENV
        value: production
      - key: COOKIE_SECRET
        generateValue: true
```

Key differences for staging:
- `branch: staging` (deploys from staging branch)
- `DATABASE_INTERNAL_URL` (base DB URL, no schema)
- `DATABASE_SCHEMA: staging` (triggers schema isolation in wrapper scripts)

**Step 2: Commit**

```bash
git add render.yaml
git commit -m "feat: add staging service to Render blueprint"
```

---

### Task 3: Create version tracking

**Files:**
- Create: `deploy/versions.json`
- Modify: `package.json` (version field already `1.0.0`)

**Step 1: Create `deploy/versions.json`**

```json
{
  "prod": {
    "version": "1.0.0",
    "commit": "",
    "promotedAt": ""
  },
  "staging": {
    "version": "1.0.0",
    "commit": "",
    "deployedAt": ""
  }
}
```

The `commit` and timestamp fields are populated by promote.sh/rollback.sh.

**Step 2: Commit**

```bash
git add deploy/versions.json
git commit -m "feat: add version tracking file"
```

---

### Task 4: Create promote.sh

**Files:**
- Create: `promote.sh`

This script:
1. Reads current prod version from `deploy/versions.json`
2. Prompts for version bump type (major/minor/patch)
3. Generates changelog from staging commits since last promotion
4. Opens a Release PR (`staging` → `main`) with changelog and `prod` label

**Step 1: Create `promote.sh`**

```bash
#!/bin/bash
set -e

# ── Read current prod version ─────────────────────────────
VERSIONS_FILE="deploy/versions.json"
if [ ! -f "$VERSIONS_FILE" ]; then
  echo "Error: $VERSIONS_FILE not found"
  exit 1
fi

CURRENT_VERSION=$(node -e "console.log(require('./$VERSIONS_FILE').prod.version)")
echo "Current prod version: v${CURRENT_VERSION}"

# ── Determine new version ─────────────────────────────────
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

echo ""
echo "Version bump type:"
echo "  1) patch  (v${MAJOR}.${MINOR}.$((PATCH + 1))) - bug fixes, styling"
echo "  2) minor  (v${MAJOR}.$((MINOR + 1)).0) - new features"
echo "  3) major  (v$((MAJOR + 1)).0.0) - breaking changes"
read -rp "Choose [1/2/3]: " BUMP_TYPE

case "$BUMP_TYPE" in
  1) NEW_VERSION="${MAJOR}.${MINOR}.$((PATCH + 1))" ;;
  2) NEW_VERSION="${MAJOR}.$((MINOR + 1)).0" ;;
  3) NEW_VERSION="$((MAJOR + 1)).0.0" ;;
  *) echo "Invalid choice"; exit 1 ;;
esac

echo "New version: v${NEW_VERSION}"

# ── Generate changelog ─────────────────────────────────────
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [ -n "$LAST_TAG" ]; then
  CHANGELOG=$(git log "${LAST_TAG}..staging" --pretty=format:"- %s (%h)" --no-merges)
else
  CHANGELOG=$(git log main..staging --pretty=format:"- %s (%h)" --no-merges)
fi

if [ -z "$CHANGELOG" ]; then
  echo "No new commits on staging since last release."
  exit 1
fi

echo ""
echo "Changelog:"
echo "$CHANGELOG"
echo ""

# ── Open Release PR ────────────────────────────────────────
BODY="## Release v${NEW_VERSION}

**From:** v${CURRENT_VERSION}
**To:** v${NEW_VERSION}

### Changes
${CHANGELOG}

---
*After merging, tag the commit:*
\`\`\`bash
git tag v${NEW_VERSION} && git push origin v${NEW_VERSION}
\`\`\`
*Then update deploy/versions.json with the new version and commit hash.*"

read -rp "Open Release PR? [y/N]: " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
  echo "Aborted."
  exit 0
fi

gh pr create \
  --base main \
  --head staging \
  --title "Release v${NEW_VERSION}" \
  --body "$BODY" \
  --label "prod"

echo ""
echo "Release PR created. After merging:"
echo "  1. git pull && git tag v${NEW_VERSION} && git push origin v${NEW_VERSION}"
echo "  2. Update deploy/versions.json"
```

**Step 2: Make executable and commit**

```bash
chmod +x promote.sh
git add promote.sh
git commit -m "feat: add promote.sh for staging-to-prod promotion"
```

---

### Task 5: Create rollback.sh

**Files:**
- Create: `rollback.sh`

Uses Render API to deploy a previous commit. Requires `RENDER_API_KEY` env var.

**Step 1: Create `rollback.sh`**

```bash
#!/bin/bash
set -e

SERVICE_ID="srv-d69idbmsb7us73cro2rg"
VERSIONS_FILE="deploy/versions.json"

# ── Check prerequisites ────────────────────────────────────
if [ -z "$RENDER_API_KEY" ]; then
  echo "Error: RENDER_API_KEY environment variable is required"
  echo "Generate one at: https://dashboard.render.com/u/settings#api-keys"
  exit 1
fi

# ── List recent versions ───────────────────────────────────
echo "Recent tagged versions:"
echo ""
git tag -l 'v*' --sort=-version:refname | head -10 | while read -r TAG; do
  COMMIT=$(git rev-list -n 1 "$TAG" 2>/dev/null)
  DATE=$(git log -1 --format='%ci' "$TAG" 2>/dev/null | cut -d' ' -f1)
  SHORT=$(echo "$COMMIT" | cut -c1-7)
  echo "  ${TAG}  ${SHORT}  ${DATE}"
done

echo ""
CURRENT_VERSION=$(node -e "console.log(require('./$VERSIONS_FILE').prod.version)" 2>/dev/null || echo "unknown")
echo "Current prod version: v${CURRENT_VERSION}"
echo ""

# ── Select target version ──────────────────────────────────
read -rp "Roll back to version (e.g. v1.2.0): " TARGET_TAG

if ! git rev-parse "$TARGET_TAG" >/dev/null 2>&1; then
  echo "Error: Tag '${TARGET_TAG}' not found"
  exit 1
fi

TARGET_COMMIT=$(git rev-list -n 1 "$TARGET_TAG")
TARGET_SHORT=$(echo "$TARGET_COMMIT" | cut -c1-7)

echo ""
echo "Will deploy commit ${TARGET_SHORT} (${TARGET_TAG}) to prod"
read -rp "Continue? [y/N]: " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
  echo "Aborted."
  exit 0
fi

# ── Trigger Render deploy ──────────────────────────────────
echo "Triggering deploy..."
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "https://api.render.com/v1/services/${SERVICE_ID}/deploys" \
  -H "Authorization: Bearer ${RENDER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"commitId\": \"${TARGET_COMMIT}\"}")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
  DEPLOY_ID=$(echo "$BODY" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).id))")
  echo "Deploy triggered: ${DEPLOY_ID}"
  echo ""
  echo "Monitor at: https://dashboard.render.com/web/${SERVICE_ID}/deploys/${DEPLOY_ID}"
  echo ""
  echo "Don't forget to update deploy/versions.json:"
  echo "  prod.version = \"${TARGET_TAG#v}\""
  echo "  prod.commit = \"${TARGET_SHORT}\""
else
  echo "Error: Render API returned ${HTTP_CODE}"
  echo "$BODY"
  exit 1
fi
```

**Step 2: Make executable and commit**

```bash
chmod +x rollback.sh
git add rollback.sh
git commit -m "feat: add rollback.sh for Render API-based rollback"
```

---

### Task 6: Create sync-data.sh

**Files:**
- Create: `sync-data.sh`

Copies data from `public` schema to `staging` schema using column intersection for schema compatibility. Requires `DATABASE_URL` pointing to the shared DB.

**Step 1: Create `sync-data.sh`**

```bash
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
# For each table: find common columns, truncate staging, insert from prod
for TABLE in $TABLES; do
  # Use Prisma's table naming (PascalCase maps to "PascalCase" in Postgres)
  QUOTED_TABLE="\"${TABLE}\""

  echo "Syncing ${TABLE}..."

  # Build SQL that finds common columns and copies data
  SQL="
DO \$\$
DECLARE
  common_cols TEXT;
BEGIN
  -- Find columns that exist in both schemas for this table
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

  -- Truncate staging table and copy prod data
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
```

**Step 2: Make executable and commit**

```bash
chmod +x sync-data.sh
git add sync-data.sh
git commit -m "feat: add sync-data.sh for prod-to-staging data sync"
```

---

### Task 7: Update GitHub Actions for staging branch

**Files:**
- Modify: `.github/workflows/node.js.yml`

CI should also run on pushes to `staging` and PRs targeting `staging`.

**Step 1: Update the trigger**

Change the `on` section at the top of `.github/workflows/node.js.yml`:

```yaml
on:
  push:
    branches: [ "main", "staging" ]
  pull_request:
    branches: [ "main", "staging" ]
```

**Step 2: Commit**

```bash
git add .github/workflows/node.js.yml
git commit -m "ci: run tests on staging branch"
```

---

### Task 8: Create staging branch and push

**Step 1: Create and push the staging branch**

```bash
git checkout -b staging
git push -u origin staging
git checkout main
```

**Step 2: Verify on Render**

After pushing, check the Render dashboard. If using Render Blueprint sync, the staging service should auto-create. If not, manually create the staging service via the Render dashboard using the render.yaml config.

---

### Task 9: Update CLAUDE.md with staging workflow

**Files:**
- Modify: `CLAUDE.md`

Add a "Staging Workflow" section documenting:
- How to work with the staging branch
- How to use promote.sh, rollback.sh, sync-data.sh
- The staging URL

**Step 1: Add staging section to CLAUDE.md**

Add after the "Deploy Monitoring" section:

```markdown
---

## Staging Environment

- **Staging URL:** https://renzo-staging.onrender.com (update with actual URL)
- **Branch:** `staging`
- **DB schema:** `staging` (shared Postgres, schema-isolated)

### Workflow

```bash
# 1. Work on a feature branch, merge to staging
git checkout staging && git merge feature-branch && git push

# 2. Validate on staging URL

# 3. When ready, promote to prod
./promote.sh    # Opens Release PR (staging → main)

# 4. After PR is merged, tag the release
git pull && git tag vX.Y.Z && git push origin vX.Y.Z
```

### Scripts

| Script | Purpose |
|--------|---------|
| `promote.sh` | Open a Release PR from staging → main with changelog |
| `rollback.sh` | Roll back prod to a previous version via Render API |
| `sync-data.sh` | Copy prod data → staging (column-intersection safe) |

### Data Sync

```bash
DATABASE_URL="<connection-string>" ./sync-data.sh
```

Copies all tables except `User` from `public` → `staging` schema. Safe with schema differences (uses column intersection).
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add staging workflow to CLAUDE.md"
```

---

### Task 10: Create `prod` GitHub label

**Step 1: Create the label**

```bash
gh label create prod --description "Release to production" --color "d93f0b"
```

**Step 2: Verify**

```bash
gh label list | grep prod
```

---

## Post-Implementation Checklist

- [ ] Verify staging service is running on Render
- [ ] Create a VIEWER user on staging for the UX reviewer
- [ ] Run `sync-data.sh` to populate staging with prod data
- [ ] Test `promote.sh` with a test release
- [ ] Generate a `RENDER_API_KEY` and store it locally for `rollback.sh`
- [ ] Update `deploy/versions.json` with current prod commit
