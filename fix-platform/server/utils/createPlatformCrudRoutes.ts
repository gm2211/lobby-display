/**
 * Platform CRUD Route Factory - Generates standard CRUD routes for platform Prisma models.
 *
 * PURPOSE:
 * Extended version of createCrudRoutes.ts with platform-specific features:
 * - UUID primary keys (String @id @default(uuid())) instead of autoincrement integers
 * - Cursor-based pagination (?cursor=<uuid>&limit=N) instead of offset-based
 * - Configurable per-operation role authorization (default: write requires EDITOR+)
 * - Soft-delete via markedForDeletion (consistent with existing pattern)
 * - Optional building/workspace scoping (?buildingId=<uuid>)
 *
 * GENERATED ROUTES:
 * - GET /         - List with cursor pagination, excludes markedForDeletion, optional buildingId filter
 * - GET /:id      - Detail by UUID
 * - POST /        - Create (requires writeRole, default EDITOR+)
 * - PUT /:id      - Update (requires writeRole, default EDITOR+)
 * - DELETE /:id   - Soft delete sets markedForDeletion: true (requires writeRole, default EDITOR+)
 *
 * USAGE:
 * ```typescript
 * // server/routes/platform/announcements.ts
 * import { createPlatformCrudRoutes } from '../../utils/createPlatformCrudRoutes.js';
 *
 * export default createPlatformCrudRoutes({
 *   model: 'announcement',
 *   orderBy: { createdAt: 'desc' },
 * });
 * ```
 *
 * PAGINATION:
 * ```
 * GET /api/platform/announcements?limit=20
 * GET /api/platform/announcements?cursor=<uuid>&limit=20
 * Response: { items: [...], nextCursor: "<uuid>" | null }
 * ```
 *
 * GOTCHAS / AI AGENT NOTES:
 * - IDs are UUIDs (strings), not integers — no parseInt/validateId conversion
 * - The list route fetches limit+1 to determine if more pages exist (N+1 trick)
 * - transformCreate/transformUpdate/transformGet are applied before/after DB calls
 * - All async handlers are wrapped in asyncHandler for error catching
 * - writeRole defaults to 'EDITOR'; pass 'ADMIN' for admin-only mutations
 *
 * RELATED FILES:
 * - server/utils/createCrudRoutes.ts - original factory for integer-ID models
 * - server/middleware/errorHandler.ts - asyncHandler, NotFoundError
 * - server/middleware/auth.ts - ROLE_LEVEL, requireAuth, requireMinRole
 * - prisma/schema.prisma - platform schema models with UUID PKs
 */
import { Router } from 'express';
import type { Role } from '@prisma/client';
import prisma from '../db.js';
import { asyncHandler, NotFoundError } from '../middleware/errorHandler.js';
import { requireAuth, requireMinRole } from '../middleware/auth.js';

/** All valid platform model names (lowercase camelCase Prisma names) */
type PlatformModel =
  | 'announcement'
  | 'amenity'
  | 'amenityRule'
  | 'booking'
  | 'consentRecord'
  | 'directoryEntry'
  | 'document'
  | 'forumPost'
  | 'forumReply'
  | 'maintenanceRequest'
  | 'marketplaceListing'
  | 'parcel'
  | 'payment'
  | 'platformUser'
  | 'survey'
  | 'surveyResponse'
  | 'trainingCourse'
  | 'trainingEnrollment'
  | 'violation'
  | 'visitor'
  | 'visitorLog';

/** Default page size for cursor-based pagination */
const DEFAULT_LIMIT = 20;

/** Maximum page size to prevent overly large queries */
const MAX_LIMIT = 100;

interface PlatformCrudOptions<T> {
  /** Prisma model name (lowercase camelCase): 'announcement', 'amenity', etc. */
  model: PlatformModel;

  /** Optional orderBy clause for list queries. Defaults to { id: 'asc' }. */
  orderBy?: Record<string, 'asc' | 'desc'>;

  /**
   * Minimum role required for write operations (POST/PUT/DELETE).
   * Defaults to 'EDITOR'. Pass 'ADMIN' for admin-only mutations.
   */
  writeRole?: Role;

  /** Transform data before creating (e.g., add defaults, stringify JSON fields) */
  transformCreate?: (data: Record<string, unknown>) => Record<string, unknown>;

  /** Transform data before updating (e.g., stringify JSON fields) */
  transformUpdate?: (data: Record<string, unknown>) => Record<string, unknown>;

  /** Transform items after fetching (e.g., parse JSON fields, add computed properties) */
  transformGet?: (item: T) => T;
}

/**
 * Creates a router with standard CRUD operations for a platform Prisma model.
 *
 * All models are assumed to have:
 * - `id`: String UUID primary key
 * - `markedForDeletion`: Boolean soft-delete flag
 * - Optionally `buildingId`: String for workspace scoping
 *
 * @param options - Configuration for the CRUD routes
 * @returns Express Router with GET /, GET /:id, POST /, PUT /:id, DELETE /:id
 */
export function createPlatformCrudRoutes<T>(options: PlatformCrudOptions<T>): Router {
  const {
    model,
    orderBy = { id: 'asc' },
    writeRole = 'EDITOR',
    transformCreate = (d) => d,
    transformUpdate = (d) => d,
    transformGet = (item: T) => item,
  } = options;

  const router = Router();

  // Type-safe dynamic access to Prisma model
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getModel = () => (prisma as any)[model];

  /**
   * GET / — List with cursor-based pagination
   *
   * Query params:
   * - cursor: UUID of the last item from the previous page
   * - limit: number of items per page (default: 20, max: 100)
   * - buildingId: optional UUID to scope results to a building/workspace
   *
   * Response: { items: T[], nextCursor: string | null }
   */
  router.get(
    '/',
    requireAuth,
    asyncHandler(async (req, res) => {
      const rawLimit = Number(req.query.limit) || DEFAULT_LIMIT;
      const limit = Math.min(Math.max(1, rawLimit), MAX_LIMIT);
      const cursor = req.query.cursor as string | undefined;
      const buildingId = req.query.buildingId as string | undefined;

      // Build where clause: always exclude soft-deleted, optionally filter by buildingId
      const where: Record<string, unknown> = { markedForDeletion: false };
      if (buildingId) {
        where.buildingId = buildingId;
      }

      // Build cursor args for Prisma cursor-based pagination
      const cursorArgs = cursor
        ? { cursor: { id: cursor }, skip: 1 }
        : {};

      // Fetch limit+1 to determine if a next page exists (N+1 trick)
      const rows = await getModel().findMany({
        where,
        orderBy,
        take: limit + 1,
        ...cursorArgs,
      });

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? items[items.length - 1].id : null;

      res.json({
        items: items.map(transformGet as (item: unknown) => unknown),
        nextCursor,
      });
    })
  );

  /**
   * GET /:id — Detail by UUID
   *
   * Returns 404 if not found.
   * ID is treated as a string UUID (not parsed as integer).
   */
  router.get(
    '/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const id = req.params.id;

      const item = await getModel().findUnique({
        where: { id },
      });

      if (!item) {
        throw new NotFoundError(`${model} ${id} not found`);
      }

      res.json(transformGet(item as T));
    })
  );

  /**
   * POST / — Create item
   *
   * Requires writeRole (default: EDITOR+).
   * Applies transformCreate to request body before saving.
   * Returns 201 on success.
   */
  router.post(
    '/',
    requireMinRole(writeRole),
    asyncHandler(async (req, res) => {
      const data = transformCreate(req.body);
      const item = await getModel().create({ data });
      res.status(201).json(transformGet(item as T));
    })
  );

  /**
   * PUT /:id — Update item
   *
   * Requires writeRole (default: EDITOR+).
   * Applies transformUpdate to request body before saving.
   * ID is treated as a string UUID.
   */
  router.put(
    '/:id',
    requireMinRole(writeRole),
    asyncHandler(async (req, res) => {
      const id = req.params.id;
      const data = transformUpdate(req.body);

      const item = await getModel().update({
        where: { id },
        data,
      });

      res.json(transformGet(item as T));
    })
  );

  /**
   * DELETE /:id — Soft delete
   *
   * Requires writeRole (default: EDITOR+).
   * Sets markedForDeletion: true instead of hard-deleting.
   * Consistent with the existing platform soft-delete pattern.
   * ID is treated as a string UUID.
   */
  router.delete(
    '/:id',
    requireMinRole(writeRole),
    asyncHandler(async (req, res) => {
      const id = req.params.id;

      await getModel().update({
        where: { id },
        data: { markedForDeletion: true },
      });

      res.json({ ok: true });
    })
  );

  return router;
}
