/**
 * Platform Search API Routes - Global search across platform entities.
 *
 * Searches the SearchIndex model for matching entities.
 *
 * ROUTES:
 * - GET /api/platform/search?q=...&type=...&limit=...&offset=... - Search entities (any auth)
 *
 * QUERY PARAMS:
 * - q      (required) - search term, case-insensitive match on title and body
 * - type   (optional) - filter by entity type (e.g. 'Announcement', 'Event')
 * - limit  (optional) - max results to return, default 20, max 100
 * - offset (optional) - number of results to skip, default 0
 *
 * RELATED FILES:
 * - server/services/search.ts   - searchEntities() service
 * - server/routes/platform/index.ts - mounts this router
 * - prisma/schema.prisma         - SearchIndex model
 */
import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler, ValidationError } from '../../middleware/errorHandler.js';
import { searchEntities } from '../../services/search.js';

const router = Router();

/**
 * GET /api/platform/search
 *
 * Search across platform entities using the SearchIndex.
 *
 * @query q      - Required search term
 * @query type   - Optional entity type filter
 * @query limit  - Max results (default 20, max 100)
 * @query offset - Results to skip (default 0)
 *
 * @returns { results: SearchIndex[], total: number }
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { q, type, limit: limitRaw, offset: offsetRaw } = req.query;

    if (!q || typeof q !== 'string' || q.trim() === '') {
      throw new ValidationError('Query parameter "q" is required');
    }

    const limit = Math.min(
      parseInt(typeof limitRaw === 'string' ? limitRaw : '20', 10) || 20,
      100,
    );
    const offset = parseInt(typeof offsetRaw === 'string' ? offsetRaw : '0', 10) || 0;

    const entityType = typeof type === 'string' && type.trim() !== '' ? type.trim() : undefined;

    const allResults = await searchEntities(q.trim(), entityType);

    const total = allResults.length;
    const results = allResults.slice(offset, offset + limit);

    res.json({ results, total });
  }),
);

export default router;
