# Renzo

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

## CRITICAL GOTCHAS

**Stop and read these before making changes.**

| Trap | Rule |
|------|------|
| Auto-scrolling | **Do NOT touch `AutoScrollCards` CSS/JS without reading DEVELOPMENT.md first.** Breaking it is silent -- `scrollTop` stays at 0 with no errors. |
| CSS shorthand mixing | **Never** mix shorthand (`border`) and longhand (`borderColor`) on the same React element. Causes rerender bugs. Always use all-longhand (`borderWidth`, `borderStyle`, `borderColor`). |
| `asyncHandler()` | **Every** async Express route handler must be wrapped in `asyncHandler()`. Unwrapped handlers silently swallow errors. |

## Other Gotchas

| Trap | Rule |
|------|------|
| `markedForDeletion` vs `deletedAt` | `deletedAt` exists in the schema but is **vestigial** -- only use `markedForDeletion` for soft-deletion logic |
| `Events.details` type | JSON string in DB, `string[]` via API transforms in `createCrudRoutes` |
| Preview mode | Dashboard accepts `?preview=true` query param for draft content |
| SSE updates | Publish triggers real-time push via `server/sse.ts` |
| Snapshots | See `server/routes/snapshots.ts` header comment for draft/publish workflow |
| Role-based access | GETs require auth only (any role). Mutations (POST/PUT/DELETE) require `EDITOR` or `ADMIN`. See `dashboardProtect` in `server/app.ts` |
| CSRF | All state-changing `/api/*` requests require a CSRF token via `server/middleware/csrf.ts` |

## Platform Gotchas

| Trap | Rule |
|------|------|
| Platform schema isolation | Every new platform model **must** include `@@schema("platform")`. Omitting it puts the model in the `public` schema (dashboard), causing join failures. |
| Platform CRUD uses UUID IDs | Platform routes use `String @id @default(uuid())` — **never** call `parseInt()` or `validateId()` on platform IDs. Use the raw string from `req.params.id`. |
| Announcements use a custom router | `server/routes/platform/announcements.ts` is a custom router (not the factory) because it emits SSE events via `announcementNotifier`. Do not replace it with `createPlatformCrudRoutes` without adding back the SSE call. |
| `BookingStatus` includes `WAITLISTED` | The `BookingStatus` enum has `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`, `COMPLETED`, **and `WAITLISTED`**. The booking rules engine checks capacity; if full, set status to `WAITLISTED` rather than rejecting outright. |
| `platformProtectStrict` vs `platformProtect` | `platformProtect` only checks the session role. `platformProtectStrict` additionally loads the `PlatformUser` record and attaches it to `req.platformUser`. Use `platformProtectStrict` + `requirePlatformRole()` whenever the route needs to enforce platform-specific roles (RESIDENT, MANAGER, etc.). |

---

## Quality Gates

Run all three before pushing:

```bash
npx tsc --noEmit
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/renzo" npm run build
npx vitest run   # uses renzo_test DB automatically (see vitest.config.ts)
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
| `sync-data.sh` | Copy prod data → staging (column-intersection safe) |

### Staging

- **Branch:** `deploy/staging` (auto-advanced on push to main)
- **DB:** `renzo-staging-db` (separate free-tier Postgres)

```bash
DATABASE_URL="<connection-string>" ./sync-data.sh  # Copy prod data to staging
```

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
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/renzo" npm run dev &
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
