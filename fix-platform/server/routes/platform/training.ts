/**
 * Training Resources API Routes - CRUD for training materials and completion tracking.
 *
 * ROUTES:
 * - GET /api/platform/training              - List training resources (any auth). Includes completions count.
 *                                            Supports ?active=true filter.
 * - GET /api/platform/training/:id          - Get training resource detail with completions list (any auth)
 * - POST /api/platform/training             - Create training resource (EDITOR+ required)
 * - PUT /api/platform/training/:id          - Update training resource (EDITOR+ required)
 * - DELETE /api/platform/training/:id       - Delete training resource (EDITOR+ required, cascades completions)
 * - POST /api/platform/training/:id/complete - Mark training as completed for current user (any auth)
 * - GET /api/platform/training/:id/completions - List completions for a resource (EDITOR+ required)
 *
 * AUTH MODEL:
 * - GET routes require any authenticated user (requireAuth)
 * - POST, PUT, DELETE require EDITOR or ADMIN (requireMinRole('EDITOR'))
 * - POST /:id/complete requires any authenticated user (creates TrainingCompletion for current user)
 * - GET /:id/completions requires EDITOR+ (sensitive — lists all users who completed)
 *
 * GOTCHAS:
 * - TrainingResource uses UUID strings as IDs, NOT integer ids
 * - TrainingCompletion has a unique constraint on [resourceId, userId]
 * - req.session.user!.id is an integer but PlatformUser.id is a string (UUID) — cast required
 * - DELETE uses Prisma cascade (completions are deleted automatically via schema)
 * - Every async handler is wrapped in asyncHandler()
 *
 * RELATED FILES:
 * - server/middleware/auth.ts        - requireAuth, requireMinRole
 * - server/middleware/errorHandler.ts - asyncHandler, NotFoundError, ValidationError
 * - prisma/schema.prisma             - TrainingResource, TrainingCompletion, ContentType, PlatformRole
 * - tests/unit/training-routes.test.ts - unit tests (Prisma mocked)
 */
import { Router } from 'express';
import prisma from '../../db.js';
import { asyncHandler, NotFoundError, ValidationError } from '../../middleware/errorHandler.js';
import { requireAuth, requireMinRole } from '../../middleware/auth.js';
import { platformProtectStrict } from '../../middleware/platformAuth.js';

const router = Router();

// Apply platformProtectStrict so req.platformUser is available for role-based filtering
router.use(platformProtectStrict);

const VALID_CONTENT_TYPES = ['VIDEO', 'DOCUMENT', 'LINK'] as const;
type ContentTypeValue = (typeof VALID_CONTENT_TYPES)[number];

// ---------------------------------------------------------------------------
// GET / - List training resources (any auth). Include completions count.
// Supports ?active=true filter.
// ---------------------------------------------------------------------------
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { active } = req.query;
    const platformUser = req.platformUser!;

    const where: Record<string, unknown> = {};
    if (active === 'true') {
      where.active = true;
    }

    const resources = await prisma.trainingResource.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        _count: { select: { completions: true } },
      },
    });

    // Filter: show resources that either have no role requirement
    // or include the current user's platform role
    const filtered = resources.filter((r) => {
      if (!r.requiredForRoles || r.requiredForRoles.length === 0) return true;
      return r.requiredForRoles.includes(platformUser.role);
    });

    res.json(filtered);
  })
);

// ---------------------------------------------------------------------------
// GET /:id/completions - List completions for a resource (EDITOR+ required)
// Must appear BEFORE /:id to avoid route conflict with static segments
// ---------------------------------------------------------------------------
router.get(
  '/:id/completions',
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const resource = await prisma.trainingResource.findUnique({ where: { id } });
    if (!resource) {
      throw new NotFoundError(`TrainingResource ${id} not found`);
    }

    const completions = await prisma.trainingCompletion.findMany({
      where: { resourceId: id },
      include: {
        user: {
          select: { id: true, unitNumber: true, role: true },
        },
      },
      orderBy: { completedAt: 'asc' },
    });

    res.json(completions);
  })
);

// ---------------------------------------------------------------------------
// GET /:id - Get training resource detail with completions list (any auth)
// ---------------------------------------------------------------------------
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const resource = await prisma.trainingResource.findUnique({
      where: { id },
      include: {
        completions: {
          orderBy: { completedAt: 'asc' },
        },
        _count: { select: { completions: true } },
      },
    });

    if (!resource) {
      throw new NotFoundError(`TrainingResource ${id} not found`);
    }

    res.json(resource);
  })
);

// ---------------------------------------------------------------------------
// POST / - Create training resource (EDITOR+ required)
// ---------------------------------------------------------------------------
router.post(
  '/',
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const {
      title,
      description,
      contentType,
      contentUrl,
      uploadId,
      requiredForRoles,
      dueDate,
      sortOrder,
      active,
    } = req.body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      throw new ValidationError('title is required');
    }
    if (!description || typeof description !== 'string' || !description.trim()) {
      throw new ValidationError('description is required');
    }
    if (!contentType) {
      throw new ValidationError('contentType is required');
    }
    if (!VALID_CONTENT_TYPES.includes(contentType as ContentTypeValue)) {
      throw new ValidationError(
        `contentType must be one of: ${VALID_CONTENT_TYPES.join(', ')}`
      );
    }

    const resource = await prisma.trainingResource.create({
      data: {
        title: title.trim(),
        description: description.trim(),
        contentType: contentType as ContentTypeValue,
        contentUrl: contentUrl ?? null,
        uploadId: uploadId ?? null,
        requiredForRoles: requiredForRoles ?? [],
        dueDate: dueDate ? new Date(dueDate) : null,
        sortOrder: sortOrder ?? 0,
        active: active ?? true,
      },
      include: {
        _count: { select: { completions: true } },
      },
    });

    res.status(201).json(resource);
  })
);

// ---------------------------------------------------------------------------
// PUT /:id - Update training resource (EDITOR+ required)
// ---------------------------------------------------------------------------
router.put(
  '/:id',
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const existing = await prisma.trainingResource.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError(`TrainingResource ${id} not found`);
    }

    const {
      title,
      description,
      contentType,
      contentUrl,
      uploadId,
      requiredForRoles,
      dueDate,
      sortOrder,
      active,
    } = req.body;

    if (
      contentType !== undefined &&
      !VALID_CONTENT_TYPES.includes(contentType as ContentTypeValue)
    ) {
      throw new ValidationError(
        `contentType must be one of: ${VALID_CONTENT_TYPES.join(', ')}`
      );
    }

    const data: Record<string, unknown> = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (contentType !== undefined) data.contentType = contentType;
    if (contentUrl !== undefined) data.contentUrl = contentUrl;
    if (uploadId !== undefined) data.uploadId = uploadId;
    if (requiredForRoles !== undefined) data.requiredForRoles = requiredForRoles;
    if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
    if (sortOrder !== undefined) data.sortOrder = sortOrder;
    if (active !== undefined) data.active = active;

    const updated = await prisma.trainingResource.update({
      where: { id },
      data,
      include: {
        _count: { select: { completions: true } },
      },
    });

    res.json(updated);
  })
);

// ---------------------------------------------------------------------------
// DELETE /:id - Delete training resource (EDITOR+ required, cascades completions)
// ---------------------------------------------------------------------------
router.delete(
  '/:id',
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const existing = await prisma.trainingResource.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError(`TrainingResource ${id} not found`);
    }

    await prisma.trainingResource.delete({ where: { id } });

    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// POST /:id/complete - Mark training as completed for current user (any auth)
// Creates TrainingCompletion for current user (upsert-style via unique constraint)
// ---------------------------------------------------------------------------
router.post(
  '/:id/complete',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const resource = await prisma.trainingResource.findUnique({ where: { id } });
    if (!resource) {
      throw new NotFoundError(`TrainingResource ${id} not found`);
    }

    // session.user.id is an integer (User.id), but PlatformUser.id is a UUID string.
    // Platform routes store the string form as session user id for consistency.
    const userId = req.session.user!.id as unknown as string;

    const completion = await prisma.trainingCompletion.upsert({
      where: { resourceId_userId: { resourceId: id, userId } },
      create: { resourceId: id, userId },
      update: {},
    });

    res.status(201).json(completion);
  })
);

export default router;
