/**
 * Advisories API Routes - CRUD operations for ticker advisories.
 *
 * Uses createCrudRoutes factory for standard operations.
 * Advisories are messages shown in the bottom ticker (e.g., maintenance notices).
 *
 * ROUTES:
 * - GET /api/advisories - List all advisories
 * - POST /api/advisories - Create new advisory
 * - PUT /api/advisories/:id - Update advisory
 * - DELETE /api/advisories/:id - Mark for deletion
 * - POST /api/advisories/:id/unmark - Undo mark for deletion
 *
 * RELATED FILES:
 * - server/utils/createCrudRoutes.ts - Factory that generates these routes
 * - src/types.ts - Advisory type definition
 */
import { createCrudRoutes } from '../utils/createCrudRoutes.js';
import type { Advisory } from '@prisma/client';

export default createCrudRoutes<Advisory>({
  model: 'advisory',
  // No orderBy - advisories don't have sortOrder
});
