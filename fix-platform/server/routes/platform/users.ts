/**
 * Platform Users Sub-Router (placeholder)
 *
 * Future: Platform-specific resident user management.
 */
import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler.js';

const router = Router();

router.get('/', asyncHandler(async (_req, res) => {
  res.json({ status: 'ok', module: 'users' });
}));

export default router;
