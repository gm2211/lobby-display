/**
 * CRUD Route Factory - Generates standard CRUD routes for Prisma models.
 *
 * PURPOSE:
 * Eliminates duplication across services.ts, events.ts, and advisories.ts.
 * Each file can now be ~10 lines instead of ~40.
 *
 * GENERATED ROUTES:
 * - GET /         - List all items (optional orderBy)
 * - POST /        - Create new item
 * - PUT /:id      - Update item by ID
 * - DELETE /:id   - Mark item for deletion (soft delete)
 * - POST /:id/unmark - Unmark item for deletion
 * - POST /reorder - Set sortOrder from an ordered list of IDs (only when `reorderable: true`)
 *
 * USAGE:
 * ```typescript
 * // server/routes/services.ts
 * import { createCrudRoutes } from '../utils/createCrudRoutes.js';
 *
 * export default createCrudRoutes({
 *   model: 'service',
 *   orderBy: { sortOrder: 'asc' }
 * });
 * ```
 *
 * GOTCHAS / AI AGENT NOTES:
 * - All routes are wrapped with asyncHandler for error catching
 * - ID parameters are validated (throws ValidationError if invalid)
 * - transformGet/transformCreate allow custom field processing (e.g., JSON parse/stringify)
 * - Uses Prisma's dynamic model access: prisma[model].findMany()
 *
 * RELATED FILES:
 * - server/middleware/errorHandler.ts - provides asyncHandler, ValidationError
 * - server/routes/services.ts, events.ts, advisories.ts - use this factory
 */
import { Router } from 'express';
import prisma from '../db.js';
import { asyncHandler, validateId, NotFoundError, ValidationError } from '../middleware/errorHandler.js';

type PrismaModel = 'service' | 'event' | 'advisory';

interface CrudOptions<T> {
  /** Prisma model name (lowercase): 'service', 'event', or 'advisory' */
  model: PrismaModel;
  /** Optional orderBy clause for list queries */
  orderBy?: Record<string, 'asc' | 'desc'>;
  /** Transform data before creating (e.g., stringify JSON fields) */
  transformCreate?: (data: Record<string, unknown>) => Record<string, unknown>;
  /** Transform data before updating (e.g., stringify JSON fields) */
  transformUpdate?: (data: Record<string, unknown>) => Record<string, unknown>;
  /** Transform items after fetching (e.g., parse JSON fields) */
  transformGet?: (item: T) => T;
  /** Expose POST /reorder (model must have a `sortOrder` column) */
  reorderable?: boolean;
}

/**
 * Creates a router with standard CRUD operations for a Prisma model.
 *
 * @param options - Configuration for the CRUD routes
 * @returns Express Router with GET, POST, PUT, DELETE, and unmark routes
 */
export function createCrudRoutes<T>(options: CrudOptions<T>): Router {
  const {
    model,
    orderBy = {},
    transformCreate = (d) => d,
    transformUpdate = (d) => d,
    transformGet = (item) => item,
    reorderable = false,
  } = options;

  const router = Router();

  // Type-safe access to Prisma model
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getModel = () => (prisma as any)[model];

  /**
   * GET / - List all items
   * Returns all items, ordered by orderBy option
   */
  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      const items = await getModel().findMany({
        orderBy,
      });
      res.json(items.map(transformGet));
    })
  );

  /**
   * POST / - Create new item
   * Applies transformCreate to request body before saving
   */
  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const data = transformCreate(req.body);
      const item = await getModel().create({ data });
      res.json(transformGet(item as T));
    })
  );

  /**
   * POST /reorder - Persist a new display order
   * Body: { ids: number[] } in the desired order. Each listed item gets
   * sortOrder = its index. All IDs must exist; written in one transaction.
   * Registered before the /:id routes so "reorder" is never parsed as an ID.
   */
  if (reorderable) {
    router.post(
      '/reorder',
      asyncHandler(async (req, res) => {
        const ids: unknown = req.body?.ids;
        if (
          !Array.isArray(ids) ||
          ids.length === 0 ||
          !ids.every(id => Number.isInteger(id) && (id as number) > 0) ||
          new Set(ids).size !== ids.length
        ) {
          throw new ValidationError('ids must be a non-empty array of unique positive integers');
        }
        const numericIds = ids as number[];
        const existing = await getModel().count({ where: { id: { in: numericIds } } });
        if (existing !== numericIds.length) {
          throw new NotFoundError('One or more items not found');
        }
        await prisma.$transaction(
          numericIds.map((id, index) =>
            getModel().update({ where: { id }, data: { sortOrder: index } }),
          ),
        );
        res.json({ ok: true });
      })
    );
  }

  /**
   * PUT /:id - Update item by ID
   * Applies transformUpdate to request body before saving
   */
  router.put(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = validateId(req.params.id);
      const data = transformUpdate(req.body);
      const item = await getModel().update({
        where: { id },
        data,
      });
      res.json(transformGet(item as T));
    })
  );

  /**
   * DELETE /:id - Mark item for deletion
   * Sets markedForDeletion: true (soft delete until publish)
   */
  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = validateId(req.params.id);
      await getModel().update({
        where: { id },
        data: { markedForDeletion: true },
      });
      res.json({ ok: true });
    })
  );

  /**
   * POST /:id/unmark - Unmark item for deletion
   * Sets markedForDeletion: false
   */
  router.post(
    '/:id/unmark',
    asyncHandler(async (req, res) => {
      const id = validateId(req.params.id);
      await getModel().update({
        where: { id },
        data: { markedForDeletion: false },
      });
      res.json({ ok: true });
    })
  );

  return router;
}
