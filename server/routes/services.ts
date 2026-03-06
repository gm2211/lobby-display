/**
 * Services API Routes - Custom router with status change logging.
 *
 * Replaces the createCrudRoutes factory to intercept PUT requests
 * and log status transitions to ServiceStatusLog.
 *
 * ROUTES:
 * - GET /api/services - List all services
 * - POST /api/services - Create new service (logs initial status)
 * - PUT /api/services/:id - Update service (logs status change if changed)
 * - DELETE /api/services/:id - Mark for deletion
 * - POST /api/services/:id/unmark - Undo mark for deletion
 *
 * RELATED FILES:
 * - prisma/schema.prisma - Service and ServiceStatusLog models
 * - server/routes/metrics.ts - Consumes ServiceStatusLog for history queries
 * - src/types.ts - Service type definition
 */
import { Router } from 'express';
import prisma from '../db.js';
import { asyncHandler, validateId, NotFoundError } from '../middleware/errorHandler.js';

const router = Router();

// GET / - list all services
router.get('/', asyncHandler(async (_req, res) => {
  const items = await prisma.service.findMany({ orderBy: { sortOrder: 'asc' } });
  res.json(items);
}));

// POST / - create service
router.post('/', asyncHandler(async (req, res) => {
  const item = await prisma.service.create({ data: req.body });
  // Log initial status
  await prisma.serviceStatusLog.create({
    data: { serviceId: item.id, status: item.status }
  });
  res.json(item);
}));

// PUT /:id - update service (LOG STATUS CHANGE)
router.put('/:id', asyncHandler(async (req, res) => {
  const id = validateId(req.params.id);
  // Get old status
  const old = await prisma.service.findUnique({ where: { id } });
  if (!old) throw new NotFoundError('Service not found');

  const item = await prisma.service.update({ where: { id }, data: req.body });

  // Log if status changed
  if (req.body.status && req.body.status !== old.status) {
    await prisma.serviceStatusLog.create({
      data: { serviceId: id, status: item.status }
    });
  }
  res.json(item);
}));

// DELETE /:id - mark for deletion
router.delete('/:id', asyncHandler(async (req, res) => {
  const id = validateId(req.params.id);
  await prisma.service.update({ where: { id }, data: { markedForDeletion: true } });
  res.json({ ok: true });
}));

// POST /:id/unmark
router.post('/:id/unmark', asyncHandler(async (req, res) => {
  const id = validateId(req.params.id);
  await prisma.service.update({ where: { id }, data: { markedForDeletion: false } });
  res.json({ ok: true });
}));

export default router;
