# Staging Environment Design

**Date:** 2026-02-20
**Status:** Approved

## Problem

All changes (code and content) deploy directly to prod. No way to validate changes before they hit the lobby screens. Need a staging environment with zero additional cost.

## Infrastructure

Two Render web services sharing one Postgres DB with schema isolation:

| | Prod | Staging |
|---|---|---|
| Service | existing | new (free tier) |
| Branch | `main` | `staging` |
| DB schema | `public` | `staging` |
| DATABASE_URL | `...?schema=public` | `...?schema=staging` |

Staging auto-deploys from the `staging` branch. Free-tier service spins down after 15 min idle (acceptable for 2 users).

## Semver

All versions follow semver (`vMAJOR.MINOR.PATCH`):
- Patch: bug fixes, styling tweaks
- Minor: new features, content model changes
- Major: breaking changes, auth overhauls, schema changes requiring migration

Version stored in `package.json` and tracked in `deploy/versions.json`:
```json
{
  "prod": { "version": "1.2.0", "commit": "abc1234" },
  "staging": { "version": "1.3.0-rc1", "commit": "def5678" }
}
```

## Code Promotion (staging → prod)

Git-based with PR gate:

```
feature-branch → staging (PR, auto-deploys to staging)
                    ↓ review on staging URL
                staging → main (Release PR with "prod" label)
                    ↓ merge → auto-deploy, git tag vX.Y.Z
```

`promote.sh`:
1. Read current prod version from `deploy/versions.json`
2. Prompt for new version (major/minor/patch bump)
3. Generate changelog from commits since last release
4. Open Release PR (`staging` → `main`) with changelog body and `prod` label
5. After merge: tag commit, update `deploy/versions.json`

## Rollback

Render API-based — no git reverts, no messy history:

`rollback.sh`:
1. Read current and previous prod versions from git history of `deploy/versions.json`
2. List recent versions with their commits
3. Prompt for target version
4. Call Render API to deploy that commit: `POST /services/{serviceId}/deploys`
5. Update `deploy/versions.json` with rolled-back version

Requires `RENDER_API_KEY` env var.

## Data Sync (prod → staging)

Same-DB, schema-to-schema copy with column-intersection for schema compatibility:

`sync-data.sh`:
1. Query `information_schema.columns` for both `public` and `staging` schemas
2. Compute column intersection per table
3. Truncate staging tables
4. `INSERT INTO staging.X (col1, col2, ...) SELECT col1, col2, ... FROM public.X`
5. Skip `users` table (staging has its own auth)
6. Report copied tables, skipped columns, and any errors

**Schema compatibility:**
- Staging has new columns → get Prisma default values (safe)
- Staging removed columns → ignored (safe)
- Column type changes → INSERT fails loudly (intentional, forces manual handling)

**Safety:** Script only reads from `public`, writes to `staging`. Prod data is never mutated.

## Scripts

All scripts live at repo root:
- `promote.sh` — open Release PR from staging → main
- `rollback.sh` — roll back prod to a previous version via Render API
- `sync-data.sh` — copy prod data to staging schema

## Non-goals

- Automated data sync (on-demand only)
- Content promotion (staging content → prod content)
- Feature flags
- Multiple staging environments
