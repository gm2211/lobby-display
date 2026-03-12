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
| Unhandled | 500 | |

## Auto-Scrolling (Dashboard.tsx)

**DO NOT BREAK THIS.** The `AutoScrollCards` component uses `CSS transform: translateY()` instead of native scrolling because Safari has a bug where `scrollTop`/`scrollBy` silently fail on `position:absolute + overflow:auto` elements inside flexbox.

**CSS:** Wrapper = `position: relative` + `flex: 1` + `minHeight: 0`. Scroll container = `position: absolute` + `inset: 0` + `overflow: hidden` (not `auto`). Inner content uses `willChange: 'transform'`.

**JS:** Accumulate fractional pixels (browsers ignore sub-pixel transforms). Only move when accumulated >= 1px (`Math.floor()`). Apply `transform: translateY(-Npx)` directly via `inner.style.transform`. Content is duplicated for seamless looping — when offset reaches the first copy's height + gap, reset to 0.

Without these patterns, scrolling silently does nothing.

## Platform Patterns

The platform API (`/api/platform/*`) is a resident-facing layer built on top of the existing dashboard infrastructure. All platform routes use UUID primary keys, cursor-based pagination, and platform-specific role authorization.

### Platform CRUD Factory (`createPlatformCrudRoutes`)

Located at `server/utils/createPlatformCrudRoutes.ts`. Use this for any new platform Prisma model with standard CRUD needs.

```typescript
// server/routes/platform/amenities.ts
import { createPlatformCrudRoutes } from '../../utils/createPlatformCrudRoutes.js';

export default createPlatformCrudRoutes({
  model: 'amenity',
  orderBy: { name: 'asc' },
  writeRole: 'EDITOR',           // optional, default is 'EDITOR'
  transformCreate: (data) => ({  // optional
    ...data,
    active: data.active ?? true,
  }),
  transformGet: (item) => ({     // optional
    ...item,
    // e.g. parse a JSON field
  }),
});
```

Register in `server/app.ts`:
```typescript
import platformRouter from './routes/platform/index.js';
app.use('/api/platform', platformProtect, platformRouter);
```

**Generated routes:**
- `GET /` — List with cursor-based pagination; excludes `markedForDeletion`
- `GET /:id` — Detail by UUID; returns 404 if not found
- `POST /` — Create (requires `writeRole`, default `EDITOR`)
- `PUT /:id` — Update (requires `writeRole`)
- `DELETE /:id` — Soft delete (sets `markedForDeletion: true`)

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `model` | `PlatformModel` | required | Prisma model name (camelCase) |
| `orderBy` | `Record<string, 'asc'\|'desc'>` | `{ id: 'asc' }` | Sort order for list queries |
| `writeRole` | `Role` | `'EDITOR'` | Min role required for POST/PUT/DELETE |
| `transformCreate` | `(data) => data` | identity | Transform body before `prisma.create()` |
| `transformUpdate` | `(data) => data` | identity | Transform body before `prisma.update()` |
| `transformGet` | `(item) => item` | identity | Transform each item after DB fetch |

**Pagination:**
```
GET /api/platform/amenities?limit=20
GET /api/platform/amenities?cursor=<uuid>&limit=20
GET /api/platform/amenities?buildingId=<uuid>&limit=20

Response: { items: T[], nextCursor: string | null }
```

The list route fetches `limit + 1` records to determine whether a next page exists (N+1 trick). `nextCursor` is the `id` of the last item in the current page, or `null` if there are no more pages.

**Key difference from `createCrudRoutes`:** IDs are UUID strings — never call `parseInt()` or `validateId()` on them.

### Platform Auth Middleware

Located at `server/middleware/platformAuth.ts`.

```typescript
import { platformProtect, platformProtectStrict, requirePlatformRole } from '../middleware/platformAuth.js';
```

| Middleware | Purpose |
|-----------|---------|
| `platformProtect` | Requires session auth; blocks non-GET mutations for VIEWER role |
| `platformProtectStrict` | Requires session auth + loads `PlatformUser` record into `req.platformUser` |
| `requirePlatformRole(...roles)` | Checks `req.platformUser.role` against allowed list; must follow `platformProtectStrict` |

**Platform roles** (`PlatformRole` enum): `RESIDENT`, `BOARD_MEMBER`, `MANAGER`, `SECURITY`, `CONCIERGE`

**Usage pattern:**
```typescript
// Route requiring a platform user with MANAGER or BOARD_MEMBER role
router.post(
  '/admin-action',
  platformProtectStrict,
  requirePlatformRole('MANAGER', 'BOARD_MEMBER'),
  asyncHandler(async (req, res) => {
    const platformUser = req.platformUser!; // typed as PlatformUser
    // ...
  })
);
```

`platformProtect` is applied globally to all `/api/platform/*` routes in `server/app.ts`. Use `platformProtectStrict` + `requirePlatformRole` inside individual routes that need role-gating beyond the base check.

### SSE Channels

Located at `server/sse.ts`. The SSE system supports both a global channel (backwards-compatible) and named channels for targeted broadcasts.

**API:**
```typescript
import { broadcastEvent, broadcast } from '../sse.ts';

// Send a typed event with a JSON payload to subscribers of a named channel
broadcastEvent('platform:announcements', 'announcement:new', { id, title, priority });

// Send a generic refresh event to a named channel
broadcast('platform:bookings');

// Send a refresh to ALL clients (legacy, no channel)
broadcast();
```

**Subscribing (client-side):**
```
GET /api/events?channel=platform:announcements
GET /api/events?channel=platform:bookings
GET /api/events              ← global (receives all refresh events)
```

**Named channels in use:**

| Channel | Events |
|---------|--------|
| `platform:announcements` | `announcement:new` |
| `platform:bookings` | `data: refresh` |

**Notifier service pattern:**

When a route needs to trigger SSE events on mutations, create a dedicated notifier service:

```typescript
// server/services/myEntityNotifier.ts
import { broadcastEvent } from '../sse.js';

export function notifyNewMyEntity(entity: { id: string; name: string }): void {
  broadcastEvent('platform:my-entity', 'my-entity:new', {
    id: entity.id,
    name: entity.name,
  });
}
```

Then call it from the route after the DB mutation:
```typescript
import { notifyNewMyEntity } from '../../services/myEntityNotifier.js';

router.post('/', asyncHandler(async (req, res) => {
  const entity = await prisma.myEntity.create({ data: req.body });
  notifyNewMyEntity(entity);
  res.status(201).json(entity);
}));
```

See `server/services/announcementNotifier.ts` for a complete example.

### Platform Models (Prisma Multi-Schema)

Platform models live in the `platform` Postgres schema, isolated from the `public` schema used by dashboard models. Every platform model must include `@@schema("platform")`:

```prisma
model MyPlatformModel {
  id                String   @id @default(uuid())
  markedForDeletion Boolean  @default(false)
  // ... fields

  @@schema("platform")
}
```

Required fields for `createPlatformCrudRoutes` compatibility:
- `id String @id @default(uuid())` — UUID primary key
- `markedForDeletion Boolean @default(false)` — soft-delete flag

Optional but common:
- `buildingId String?` — enables `?buildingId=<uuid>` list filtering
- `createdAt DateTime @default(now())`
- `updatedAt DateTime @updatedAt`

### Booking Rules Engine

Located at `server/services/bookingRules.ts`. Validates amenity booking requests against all active `AmenityRule` records before a booking is created.

```typescript
import { validateBooking, checkAvailability } from '../services/bookingRules.js';

// Validate a booking before creating it
const result = await validateBooking({
  amenityId: 'uuid-here',
  userId: 'uuid-here',
  userRole: 'RESIDENT',   // PlatformRoleValue
  startTime: new Date('2026-03-01T10:00:00'),
  endTime:   new Date('2026-03-01T11:00:00'),
});

if (!result.valid) {
  // result.errors is string[] — one message per violated rule
  throw new ValidationError(result.errors.join('; '));
}

// Get available time slots for a date
const slots = await checkAvailability('amenity-uuid', new Date('2026-03-01'));
// slots: TimeSlot[] — each has startTime, endTime, bookingCount, available
```

**Rules enforced by `validateBooking`:**

| Rule Type | `ruleValue` shape | What it checks |
|-----------|------------------|---------------|
| `MAX_BOOKINGS_PER_DAY` | `{ limit: number }` | Per-user daily booking count |
| `MAX_BOOKINGS_PER_WEEK` | `{ limit: number }` | Per-user weekly booking count |
| `BLACKOUT_DATE` | `{ date: "YYYY-MM-DD" }` | Whether the start date is a blocked date |
| `ROLE_RESTRICTION` | `{ allowedRoles: string[] }` | Whether the user's role is allowed |

Capacity and time constraints (`capacity`, `minAdvanceHours`, `maxDurationHours`) are checked directly from the `Amenity` record, not from `AmenityRule` rows.

The `BookingStatus` enum includes `WAITLISTED` — use it when an amenity is at capacity but the system should queue the user (do not fall back to a string literal).

### Storage Abstraction

Located at `server/utils/storage.ts`. Provides a pluggable file upload interface so routes don't hard-code filesystem paths.

```typescript
import { getStorageProvider } from '../utils/storage.js';

// In a route handler:
const storage = getStorageProvider(); // reads STORAGE_PROVIDER env var

const url = await storage.upload(fileBuffer, 'photo.jpg', 'image/jpeg');
// Returns: '/images/uploads/<uuid>.jpg'  (local)  or  full S3 URL (s3)

await storage.delete(url);   // safe even if file doesn't exist
storage.getUrl(url);          // returns public-facing URL
```

**Providers:**

| `STORAGE_PROVIDER` | Class | Storage location |
|-------------------|-------|-----------------|
| `local` (default) | `LocalStorageProvider` | `public/images/uploads/` (served statically) |
| `s3` | `S3StorageProvider` | AWS S3 (stub — requires `@aws-sdk/client-s3` and env vars) |

S3 env vars: `S3_BUCKET`, `S3_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.

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
