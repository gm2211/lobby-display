# Development Patterns

Reference guide for common patterns in this codebase. **Read this when implementing new features.**

## Adding an Admin Section

1. Create `src/components/admin/sections/NewSection.tsx`:
   ```typescript
   /**
    * NewSection - Manages [entity] in the admin panel.
    *
    * GOTCHAS / AI AGENT NOTES:
    * - List any non-obvious behaviors here
    *
    * RELATED FILES:
    * - server/routes/newEntity.ts - Backend API
    * - src/types.ts - Type definitions
    */
   interface Props {
     items: NewEntity[];
     onSave: () => Promise<void>;
     hasChanged: boolean;
   }

   export function NewSection({ items, onSave, hasChanged }: Props) {
     // Implementation...
   }
   ```

2. Export from `src/components/admin/sections/index.ts`
3. Add to `src/pages/Admin.tsx`

## Adding an API Route

### Standard CRUD (recommended)

```typescript
// server/routes/newEntity.ts
import { createCrudRoutes } from '../utils/createCrudRoutes.js';
import type { NewEntity } from '@prisma/client';

export default createCrudRoutes<NewEntity>({
  model: 'newEntity',
  orderBy: { sortOrder: 'asc' },  // optional
});
```

Register in `server/app.ts`:
```typescript
import newEntityRoutes from './routes/newEntity.js';
app.use('/api/new-entity', dashboardProtect, newEntityRoutes);
```

### With Field Transforms (JSON fields, etc.)

```typescript
export default createCrudRoutes<Event>({
  model: 'event',
  orderBy: { sortOrder: 'asc' },
  transformCreate: (data) => ({
    ...data,
    details: JSON.stringify(data.details || []),
  }),
  transformUpdate: (data) => ({
    ...data,
    ...(data.details !== undefined && { details: JSON.stringify(data.details) }),
  }),
  transformGet: (item) => ({
    ...item,
    details: JSON.parse(item.details),
  }),
});
```

### Drag-and-Drop Reordering

For a model with a `sortOrder` column, pass `reorderable: true` to `createCrudRoutes` to expose
`POST /reorder` with body `{ ids: number[] }` (sets `sortOrder` = index in one transaction).
On the client, use `src/components/admin/useDragReorder.ts` (pointer events, so it works on
touch screens; arrow keys on the handle also work). See `EventsSection.tsx` for the pattern.
Don't send `sortOrder` in edit (PUT) bodies, or editing an item moves it.

### Custom Routes

```typescript
import { Router } from 'express';
import { asyncHandler, NotFoundError, validateId } from '../middleware/errorHandler.js';
import prisma from '../db.js';

const router = Router();

router.get('/:id', asyncHandler(async (req, res) => {
  const id = validateId(req.params.id);
  const item = await prisma.newEntity.findUnique({ where: { id } });
  if (!item) throw new NotFoundError('Entity not found');
  res.json(item);
}));

export default router;
```

## Error Handling

Always wrap async handlers with `asyncHandler()`:

```typescript
import { asyncHandler, NotFoundError, ValidationError, validateId } from '../middleware/errorHandler.js';

router.post('/', asyncHandler(async (req, res) => {
  if (!name) throw new ValidationError('Name is required');
  const parent = await prisma.parent.findUnique({ where: { id } });
  if (!parent) throw new NotFoundError('Parent not found');
  const item = await prisma.entity.create({ data: { name, value } });
  res.status(201).json(item);
}));
```

| Error Type | Status | Source |
|-----------|--------|--------|
| `ValidationError` | 400 | `server/middleware/errorHandler.ts` |
| `AuthenticationError` | 401 | `server/middleware/auth.ts` |
| `AuthorizationError` | 403 | `server/middleware/auth.ts` |
| `NotFoundError` | 404 | `server/middleware/errorHandler.ts` |
| Prisma bad input (unknown field, wrong type) | 400 | mapped in `errorHandler` |
| Prisma record not found (`P2025`) | 404 | mapped in `errorHandler` |
| Prisma unique / foreign-key conflict (`P2002`, `P2003`) | 409 | mapped in `errorHandler` |
| Unknown `/api/*` route | 404 (JSON) | `server/app.ts` |
| Unhandled | 500, generic message | |

Clients never see the raw message of a 5xx error (it can contain Prisma queries and
schema details); the full error goes to the server log. If a user should read the
reason, throw `ValidationError` or `NotFoundError` with a message written for them.

### Validating input

- `PUT /api/config` uses an allow-list (`FIELD_RULES` in `server/routes/config.ts`). Add a
  rule when you add a `BuildingConfig` column.
- Values that end up in server-rendered HTML/CSS (theme font and colors) must pass the
  allow-lists in `shared/theme/safeCss.ts`.
- Check `typeof` before handing request values to Prisma `where` clauses
  (see `readCredentials` in `server/routes/auth.ts`).

## Auto-Scrolling (Dashboard.tsx)

**DO NOT BREAK THIS.** The `AutoScrollCards` component uses `CSS transform: translateY()` instead of native scrolling because Safari has a bug where `scrollTop`/`scrollBy` silently fail on `position:absolute + overflow:auto` elements inside flexbox.

**CSS:** Wrapper = `position: relative` + `flex: 1` + `minHeight: 0`. Scroll container = `position: absolute` + `inset: 0` + `overflow: hidden` (not `auto`). Inner content uses `willChange: 'transform'`.

**JS:** Accumulate fractional pixels (browsers ignore sub-pixel transforms). Only move when accumulated >= 1px (`Math.floor()`). Apply `transform: translateY(-Npx)` directly via `inner.style.transform`. Content is duplicated for seamless looping — when offset reaches the first copy's height + gap, reset to 0.

Without these patterns, scrolling silently does nothing.

## E2E Tests (Playwright)

E2E tests live in `e2e/` (separate from `tests/`) and run against a live server. They verify full end-to-end behavior in a real browser.

### Structure

```
e2e/
├── playwright.config.ts    # Config (baseURL, serial, retries)
├── auth.setup.ts           # Login via browser, save session to .auth/
├── global-setup.ts         # Health-check polling
├── helpers/
│   ├── auth.ts             # Credential loading + API login
│   ├── api-client.ts       # Typed HTTP client with auto-CSRF
│   └── test-data.ts        # [e2e-test]-prefixed entity factory + cleanup
└── tests/
    ├── health.spec.ts      # Smoke tests
    ├── auth.spec.ts        # Login/logout flows
    ├── dashboard.spec.ts   # Public dashboard rendering
    ├── preview.spec.ts     # Preview/snapshot modes
    ├── admin/*.spec.ts     # Admin UI CRUD
    └── api/*.spec.ts       # API-level regression
```

### Writing New E2E Tests

1. **API tests** go in `e2e/tests/api/` — use `request` fixture (no browser)
2. **UI tests** go in `e2e/tests/` or `e2e/tests/admin/` — use `page` fixture
3. **Prefix test data** with `[e2e-test]` using `TestDataManager`
4. **Clean up** in `afterAll` — staging is a shared environment
5. **Use `sortOrder: 9999`** and `active: false` to avoid dashboard impact
6. **Serial execution** — tests share a staging DB, no parallelism

### Running Locally

```bash
# Start dev server first
npm run dev

# In another terminal
E2E_ADMIN_USER=admin E2E_ADMIN_PASS=secret npm run e2e:local
```

### Running Against Staging

```bash
# Requires E2E credentials (see GitHub Actions secrets)
npm run e2e:staging
```

Or via the CI workflow — every push to `main` triggers:
1. Auto-tag + deploy to staging
2. E2E regression suite runs against `https://seven7-hudson-staging.onrender.com`
3. Results appear in the GitHub Actions "E2E Regression (Staging)" workflow

Check the latest E2E status:
```bash
gh run list --workflow="E2E Regression (Staging)" --limit=3
```

View failure logs:
```bash
gh run view <run-id> --log-failed
```

Download the HTML report artifact from the GitHub Actions run page for full test details including screenshots and traces.

### E2E as a Promotion Gate

`promote.sh` checks E2E status before allowing production deploys:
- If E2E passed for the tag's commit, promotion proceeds
- If E2E failed or hasn't run, promotion is **blocked**
- Use `./promote.sh --force <tag>` to override in emergencies

### E2E Gotchas

| Issue | Fix |
|-------|-----|
| Render cold start delays | `global-setup.ts` polls `/api/health` for up to 90s |
| SSE blocks `networkidle` | Use `domcontentloaded` instead for dashboard pages |
| React controlled inputs | Use `pressSequentially` (real keyboard events), not `fill()` |
| Inline-styled admin cards | Use `ancestor::div[contains(@style, "border-radius")]` xpath to find the card, then locate buttons within |
| Duplicate auto-scroll elements | Cards are duplicated for seamless scroll — use `.first()` |
| Shared staging DB | Serial execution; `[e2e-test]` prefix; cleanup after each test |
