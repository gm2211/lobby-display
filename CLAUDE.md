# Building Updates

> Development patterns (admin sections, API routes, error handling, auto-scrolling) are in **[DEVELOPMENT.md](./DEVELOPMENT.md)**.

---

## KEEP DOCS IN SYNC

**Every meaningful change** (new routes, new components, schema changes, new patterns, new gotchas) **must** be reflected in the relevant docs:

| File | What belongs there |
|------|-------------------|
| `README.md` | Project structure, setup instructions, high-level overview |
| `CLAUDE.md` | Gotchas, quality gates, deploy/staging workflow, session rules |
| `DEVELOPMENT.md` | Code patterns (admin sections, API routes, error handling, auto-scrolling) |
| `AGENTS.md` | Agent workflow (beads, session completion, quality gates) |

If you add a route, update README's structure and DEVELOPMENT.md's patterns. If you discover a gotcha, add it to CLAUDE.md. **Stale docs cause bugs.**

---

## Context compaction

If conversation exceeds **~150k tokens**, run `/compact` proactively before continuing. Skip ONLY when actively processing a single large file/transcript that justifies the budget. Durable state belongs in memory, bd issues, and PRs — not in the live transcript.

---

## CRITICAL GOTCHAS

**Stop and read these before making changes.**

| Trap | Rule |
|------|------|
| Production database | **NEVER allow any external IP connection to the production database.** No exceptions. No temporary access, no debugging, no one-off queries. All prod DB access goes through the application layer only. |
| Auto-scrolling | **Do NOT touch `AutoScrollCards` CSS/JS without reading DEVELOPMENT.md first.** Breaking it is silent -- `scrollTop` stays at 0 with no errors. |
| CSS shorthand mixing | **Never** mix shorthand (`border`) and longhand (`borderColor`) on the same React element. Causes rerender bugs. Always use all-longhand (`borderWidth`, `borderStyle`, `borderColor`). |
| `asyncHandler()` | **Every** async Express route handler must be wrapped in `asyncHandler()`. Unwrapped handlers silently swallow errors. |

## Other Gotchas

| Trap | Rule |
|------|------|
| `markedForDeletion` vs `deletedAt` | `deletedAt` exists in the schema but is **vestigial** -- only use `markedForDeletion` for soft-deletion logic |
| `Events.details` type | JSON string in DB, `string[]` via API transforms in `createCrudRoutes` |
| Default theme | Empty `BuildingConfig.themePreset` (fresh DB) resolves to `DEFAULT_THEME_ID` in `shared/theme/registry.ts` (`77-hudson`, prod's charcoal-green look, primary `#222721`). The `default` (slate blue) preset is only used when picked explicitly |
| Preview mode | Dashboard accepts `?preview=true` query param for draft content |
| NEW badge | `Event.firstPublishedAt` is set **only by publish** (clients can't set it; events routes strip it). Each snapshot bakes `newInLastUpdate` per event, carried over when a publish doesn't change the events list. Rules live in `shared/newBadge.ts` (`BuildingConfig.newBadgeMode` = `days` / `untilNextUpdate` / `off`, `newBadgeDays` default 7). Draft-status diffs ignore both bookkeeping fields |
| Admin optimistic writes | Sections fire writes without `await` and call `onSave(optimistic)`. `Admin.tsx` resyncs only once `mutations.whenIdle()` (in `src/utils/api.ts`) resolves and drops stale `draft-status` responses. Don't add timer-based refetches; see DEVELOPMENT.md |
| SSE updates | Publish triggers real-time push via `server/sse.ts` |
| Snapshots | See `server/routes/snapshots.ts` header comment for draft/publish workflow |
| Role-based access | `VIEWER` (lobby screens) can only read `GET /api/snapshots/latest` and the SSE stream. Everything else under `/api/services`, `/events`, `/advisories`, `/config`, `/snapshots` needs `EDITOR`+, reads included. Users and metrics are `ADMIN` only. See `editorOnly` / `snapshotsProtect` in `server/app.ts`. If the dashboard needs new data, add it to the snapshot rather than opening a draft endpoint to viewers |
| CSRF | All state-changing `/api/*` requests require a CSRF token via `server/middleware/csrf.ts` |
| Config writes | `PUT /api/config` only accepts the fields in `FIELD_RULES` (`server/routes/config.ts`); unknown keys are ignored. **New `BuildingConfig` column = new rule**, or the API silently drops it. Never pass `req.body` straight to Prisma there |
| Theme values in HTML | `fontFamily` / `colorPrimary` / `colorSecondary` are injected into a server-rendered `<style>` block. They go through the allow-lists in `shared/theme/safeCss.ts` on write **and** on render (`server/themeCSS.ts`). Don't interpolate other config text into the page without escaping |
| Sessions vs. users | `server/middleware/sessionUser.ts` re-checks the user on every request: deleted user or changed password = logged out, role change applies at once. Don't cache role decisions outside `req.session.user` |
| Lobby (VIEWER) cookie | express-session only re-sends the cookie when session **data** changes, so the keep-alive in `server/app.ts` stamps `lastRefreshAt` daily. Changing `cookie.maxAge` alone does nothing for the browser |
| Uploads | Images are stored in the database (`UploadedImage`) and served by `GET /images/uploads/:name` in `server/app.ts`, because Render's disk is wiped on every deploy. The stored extension and Content-Type come from the validated MIME type, never the client filename. A static fallback still serves files older versions wrote to `public/images/uploads` |
| Restoring snapshots | Never delete + recreate `Service` rows: `ServiceStatusLog` cascades and Metrics history is lost. Use `upsertService()` in `server/routes/snapshots.ts` |
| Demo seed | `seedIfEmpty()` (`server/index.ts`) only runs on a never-used DB (no snapshots, no content, no config). An empty services list is a valid state, not a reason to seed |
| Content-Security-Policy | Production responses carry a CSP (`CONTENT_SECURITY_POLICY` in `server/app.ts`): **no inline `<script>`**, scripts from our origin only. That is why the login page's script lives in `server/login.js`. Loading a script, font or frame from a new origin means editing the policy. Not sent in dev (Vite needs inline scripts), so test CSP-sensitive changes on a production build |
| Publish is one transaction | `POST /api/snapshots` deletes marked items, stamps NEW badges and writes the snapshot inside `prisma.$transaction`. Helpers called from it take the transaction client (`db`), not the global `prisma` |
| Setup token | If `SETUP_TOKEN` is set, creating the first admin (`POST /api/auth/setup`) requires it. Unset = open to the first visitor whenever the user table is empty |
| Client IP | Behind Render the client IP comes from `X-Forwarded-For`. Default trusts the left-most entry (client-controlled); set `TRUST_PROXY_HOPS` to the real proxy count to fix it. Login also has a per-username limit because of this |
| E2E runner | `e2e-staging.yml` is pinned to `ubuntu-24.04`. `ubuntu-latest` moved to a release Playwright 1.58 can't install browsers on, and every run failed before any test |
| Error responses | 5xx responses never include the raw error message (Prisma leaks schema/SQL). Throw `ValidationError` / `NotFoundError` for anything a user should read; common Prisma errors are mapped to 400/404/409 in `errorHandler` |

---

## Bead pickup workflow (MANDATORY)

When picking up any `bd` issue for work:

1. **Plan first** — write a short plan covering scope, files to change, **spec yaml updates required**, and verification approach. No code edits before the plan.
2. **Update the spec** — every plan MUST include edits to the project's `*.spec.yaml` capturing the new/changed behavior. Spec edit precedes implementation. If no spec yaml exists yet, create one as part of the first bead pickup.
3. **Implement** — code to satisfy the spec.
4. **Specify-verify** — run `specify verify` against local dev OR the deployed site. Lint alone is insufficient.
5. **Close only with evidence** — a bead is NOT considered resolved until `specify verify` passes (locally or against the remote site). Attach verification output to the bead.

---

## Quality Gates

Run all three before pushing:

```bash
npx tsc --noEmit
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/lobby" npm run build
npx vitest run   # uses lobby_test DB automatically (see vitest.config.ts)
```

---

## Worktree Workflow

**All code changes** happen in a worktree, never directly on main. Worktrees live in `.worktrees/` (gitignored) so sub-agents stay within the sandbox.

```bash
# Start
git worktree add .worktrees/<branch> -b <branch>
cd .worktrees/<branch> && npm ci

# Finish (from project root)
git merge <branch> && git push
git worktree remove .worktrees/<branch>
git branch -d <branch>
```

---

## 3-Branch Deploy Model

```
feature → main (trunk) ──auto-tag + advance──→ deploy/staging → Render Staging
                        ──promote.sh──────────→ deploy/prod    → Render Prod
```

| Branch | Purpose | Who advances it |
|--------|---------|----------------|
| `main` | Trunk — all development lands here | Developers |
| `deploy/staging` | What Render Staging deploys | GitHub Action (auto on push to main) |
| `deploy/prod` | What Render Prod deploys | `promote.sh` (manual) |

Pushing to `main` does **not** trigger a Render deploy directly. The `auto-tag` GitHub Action creates a new `v*` patch tag and advances `deploy/staging`. Render watches the `deploy/*` branches.

### Deploy Monitoring

- **Service ID (prod):** `srv-d69idbmsb7us73cro2rg`
- **Live URL:** https://seven7-hudson-dashboard-r8ib.onrender.com

Monitor deploys after advancing a deploy branch (not after pushing to main):
1. `list_deploys(serviceId: "srv-d69idbmsb7us73cro2rg", limit: 1)` to get the deploy ID
2. Poll `get_deploy(serviceId, deployId)` every ~15 seconds
3. Show progress bar based on status:
   - `build_in_progress` -- `███░░░░░░░ Building...`
   - `update_in_progress` -- `█████████░ Deploying...`
   - `live` -- `██████████ Live!`
   - `build_failed` / `update_failed` / `deactivated` -- report the failure and stop

### Scripts

| Script | Purpose |
|--------|---------|
| `deploy.sh` | Core: `./deploy.sh <staging\|prod> <tag>` — advance a deploy branch |
| `promote.sh` | Promote a tag to prod: `./promote.sh [tag]` (E2E gate enforced, `--force` to override) |
| `rollback.sh` | Roll back: `./rollback.sh <staging\|prod> <tag>` |
| `sync-data.sh` | Copy prod's published content → staging. Read-only on prod (VIEWER login + one GET via the API, never the prod DB). Dry run unless `--apply`. Also a GitHub Action: **Sync Prod Data → Staging** |

### Staging

- **Branch:** `deploy/staging` (auto-advanced on push to main)
- **DB:** `lobby-staging-db` (separate free-tier Postgres)

```bash
PROD_SYNC_USER=<viewer> PROD_SYNC_PASS=<pass> \
STAGING_DATABASE_URL="<staging external connection string>" ./sync-data.sh --apply
```

Staging and prod are **separate databases**, so the sync reads prod through its API
(`GET /api/snapshots/latest`) and writes staging's DB directly. It refuses any
`STAGING_DATABASE_URL` whose database name lacks "staging". Uploaded images
(`/images/uploads/*`) are rewritten to absolute prod URLs since they live on prod's disk.
Staging users are not touched.

### Previewing unmerged PRs on staging

Staging only auto-deploys from `main`. To preview open PRs without merging, merge their
branches into a throwaway branch and `./deploy.sh staging <that-branch>`. The next push to
`main` overwrites it.

---

## E2E Tests (Playwright)

E2E tests live in `e2e/` and run against a live staging (or local) deployment. They are **completely separate** from the Vitest unit/API tests in `tests/`.

### Running

```bash
npm run e2e:local     # Against http://localhost:3000
npm run e2e:staging   # Against https://seven7-hudson-staging.onrender.com
npm run e2e:report    # View last HTML report
```

Requires env vars: `E2E_ADMIN_USER`, `E2E_ADMIN_PASS`, `E2E_EDITOR_USER`, `E2E_EDITOR_PASS`, `E2E_VIEWER_USER`, `E2E_VIEWER_PASS`. Store in `.env.e2e` (gitignored).

### CI Workflow

`e2e-staging.yml` runs automatically after every push to main (triggered by the auto-tag workflow deploying to staging). Also runs nightly and on manual `workflow_dispatch`.

After a push it waits until `GET /api/version` on staging reports the pushed commit (Render sets `RENDER_GIT_COMMIT`, written by `scripts/render-build.sh`) before testing; `/api/health` alone answers from the previous build while Render is still building. If the admin login is rejected, `e2e/auth.setup.ts` fails with the server's message: that means the `E2E_*` GitHub secrets don't match a user on staging.

### Production Promotion Gate

`promote.sh` checks E2E workflow status via `gh run list` before allowing promotion. If E2E failed or hasn't run, promotion is blocked. Use `--force` for emergencies:

```bash
./promote.sh              # Interactive, E2E gate enforced
./promote.sh v1.0.5       # Direct, E2E gate enforced
./promote.sh --force v1.0.5   # Override gate (emergencies only)
```

### Test Data Convention

All E2E-created entities are prefixed with `[e2e-test]` and use `sortOrder: 9999`, `active: false` to minimize dashboard impact. Tests clean up after themselves.

---

## Visual Verification for UI Features

**All UI/frontend changes require headless browser verification before marking a task complete.**

Agents working on UI features MUST follow this loop:

1. **Start the dev server** (if not already running):
   ```bash
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/lobby" npm run dev &
   curl --retry 10 --retry-delay 2 --retry-connrefused http://localhost:3000/api/health
   ```

2. **Take a screenshot** via Playwright:
   ```bash
   npx tsx -e "
     import { chromium } from 'playwright';
     const browser = await chromium.launch();
     const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
     await page.goto('http://localhost:3000/<PAGE>', { waitUntil: 'domcontentloaded' });
     await page.waitForTimeout(2000);
     await page.screenshot({ path: process.env.TMPDIR + '/ui-verify.png', fullPage: true });
     await browser.close();
   "
   ```
   Use `domcontentloaded` — SSE blocks `networkidle`.

3. **Read the screenshot** with the Read tool and visually inspect it against acceptance criteria.

4. **If it doesn't look right**, fix the code and repeat from step 2.

5. **A UI task is NOT complete** until a screenshot passes visual inspection.

### Enforcement

- The coordinator tags UI tickets with `[ui]` in the title (e.g., `bd create --title="[ui] Redesign header"`)
- A `PreToolUse` hook on `bd close` checks for a `VISUAL_VERIFIED` comment
- Agents must post verification before closing: `bd comments add <id> --author <name> "VISUAL_VERIFIED: <what was checked>"`
- The hook blocks close with an error if verification is missing

---

## Session Completion

**Work is NOT done until `git push` succeeds. Never stop before pushing.**

1. Create `bd` issues for any remaining follow-up work
2. Run all quality gates (above)
3. Close finished `bd` issues
4. Push everything:
   ```bash
   git pull --rebase && bd sync && git push
   git status  # must show "up to date with origin"
   ```
