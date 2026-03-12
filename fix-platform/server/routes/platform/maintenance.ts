/**
 * Maintenance Request API Routes
 *
 * Handles CRUD for resident maintenance requests, with comments and photos.
 *
 * ROUTES:
 * - GET  /api/maintenance           - List, filterable by status/category/assigneeId
 * - GET  /api/maintenance/:id       - Detail with comments + photos
 * - POST /api/maintenance           - Create (any authenticated user)
 * - PUT  /api/maintenance/:id       - Update status/assignment (EDITOR+ required)
 * - POST /api/maintenance/:id/comments - Add comment (any authenticated user)
 * - POST /api/maintenance/:id/photos   - Add photo (any authenticated user)
 *
 * STATUS WORKFLOW (enforced server-side):
 *   OPEN → IN_PROGRESS → RESOLVED → CLOSED
 *   Backwards transitions (e.g. CLOSED → OPEN) are rejected with 400.
 *
 * AUTH:
 * - All routes require authentication (requireAuth)
 * - PUT requires EDITOR or ADMIN (requireMinRole('EDITOR'))
 *
 * RELATED FILES:
 * - server/middleware/auth.ts     - requireAuth, requireMinRole
 * - server/middleware/errorHandler.ts - asyncHandler, NotFoundError, ValidationError, validateId
 * - prisma/schema.prisma          - MaintenanceRequest, MaintenanceComment, MaintenancePhoto models
 * - tests/unit/maintenance-routes.test.ts - unit tests (Prisma mocked)
 */
import { Router } from 'express';
import prisma from '../../db.js';
import {
  asyncHandler,
  validateId,
  NotFoundError,
  ValidationError,
} from '../../middleware/errorHandler.js';
import { requireAuth, requireMinRole } from '../../middleware/auth.js';

const router = Router();

/**
 * Valid status transitions: maps current status → allowed next statuses.
 * Moving forward is allowed; backwards is not.
 */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  OPEN:        ['IN_PROGRESS'],
  IN_PROGRESS: ['RESOLVED', 'OPEN'],
  RESOLVED:    ['CLOSED'],
  CLOSED:      [],
};

// ─── GET / ─────────────────────────────────────────────────────────────────

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { status, category, assigneeId } = req.query;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (category) where.category = category;
    if (assigneeId) where.assigneeId = validateId(String(assigneeId), 'assigneeId');

    const requests = await prisma.maintenanceRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    res.json({ items: requests });
  })
);

// ─── GET /:id ────────────────────────────────────────────────────────────────

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = validateId(req.params.id);

    const maintenance = await prisma.maintenanceRequest.findUnique({
      where: { id },
      include: {
        comments: {
          orderBy: { createdAt: 'asc' },
        },
        photos: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!maintenance) throw new NotFoundError('Maintenance request not found');

    res.json(maintenance);
  })
);

// ─── POST / ──────────────────────────────────────────────────────────────────

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { title, description, category, unitNumber, priority } = req.body;

    if (!title) throw new ValidationError('title is required');
    if (!description) throw new ValidationError('description is required');

    // reportedBy is a PlatformUser UUID — look up via session user id
    const userId = req.session.user!.id;
    const platformUser = await prisma.platformUser.findFirst({ where: { userId } });
    const reportedBy = platformUser?.id ?? userId;

    const maintenance = await prisma.maintenanceRequest.create({
      data: {
        title,
        description,
        category: category || 'OTHER',
        unitNumber: unitNumber || '',
        priority: priority || 'MEDIUM',
        reportedBy,
      },
    });

    res.status(201).json(maintenance);
  })
);

// ─── PUT /:id ────────────────────────────────────────────────────────────────

router.put(
  '/:id',
  requireAuth,
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const id = validateId(req.params.id);

    const existing = await prisma.maintenanceRequest.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Maintenance request not found');

    const { status, assigneeId, title, description, category, unitNumber } = req.body;

    // Enforce status transition workflow
    if (status !== undefined && status !== existing.status) {
      const allowed = ALLOWED_TRANSITIONS[existing.status] ?? [];
      if (!allowed.includes(status)) {
        throw new ValidationError(
          `Invalid status transition: ${existing.status} → ${status}. Allowed: ${allowed.join(', ') || 'none'}`
        );
      }
    }

    const data: Record<string, unknown> = {};
    if (status !== undefined) data.status = status;
    if (assigneeId !== undefined) data.assigneeId = assigneeId;
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (category !== undefined) data.category = category;
    if (unitNumber !== undefined) data.unitNumber = unitNumber;

    const updated = await prisma.maintenanceRequest.update({
      where: { id },
      data,
    });

    res.json(updated);
  })
);

// ─── GET /:id/comments ─────────────────────────────────────────────────────

router.get(
  '/:id/comments',
  requireAuth,
  asyncHandler(async (req, res) => {
    const requestId = validateId(req.params.id);

    const existing = await prisma.maintenanceRequest.findUnique({ where: { id: requestId } });
    if (!existing) throw new NotFoundError('Maintenance request not found');

    const comments = await prisma.maintenanceComment.findMany({
      where: { requestId },
      orderBy: { createdAt: 'asc' },
      include: {
        author: {
          select: { id: true, displayName: true },
        },
      },
    });

    const result = comments.map(c => ({
      id: c.id,
      requestId: c.requestId,
      authorId: c.authorId,
      authorName: c.author?.displayName ?? 'Unknown',
      body: c.body,
      createdAt: c.createdAt,
    }));

    res.json(result);
  })
);

// ─── POST /:id/comments ────────────────────────────────────────────────────

router.post(
  '/:id/comments',
  requireAuth,
  asyncHandler(async (req, res) => {
    const requestId = validateId(req.params.id);
    const { body } = req.body;

    if (!body) throw new ValidationError('body is required');

    const existing = await prisma.maintenanceRequest.findUnique({ where: { id: requestId } });
    if (!existing) throw new NotFoundError('Maintenance request not found');

    const authorId = req.session.user!.id;

    const comment = await prisma.maintenanceComment.create({
      data: {
        requestId,
        authorId,
        body,
      },
    });

    res.status(201).json(comment);
  })
);

// ─── POST /:id/photos ──────────────────────────────────────────────────────

router.post(
  '/:id/photos',
  requireAuth,
  asyncHandler(async (req, res) => {
    const requestId = validateId(req.params.id);
    const { url } = req.body;

    if (!url) throw new ValidationError('url is required');

    const existing = await prisma.maintenanceRequest.findUnique({ where: { id: requestId } });
    if (!existing) throw new NotFoundError('Maintenance request not found');

    const uploadedById = req.session.user!.id;

    const photo = await prisma.maintenancePhoto.create({
      data: {
        requestId,
        uploadedById,
        url,
      },
    });

    res.status(201).json(photo);
  })
);

export default router;
