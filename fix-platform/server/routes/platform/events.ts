/**
 * Platform Event CRUD API Routes
 *
 * ROUTES:
 * - GET /api/platform/events              - List upcoming active events ordered by startTime
 * - GET /api/platform/events/:id          - Event detail with RSVP count
 * - POST /api/platform/events             - Create event (EDITOR+ required)
 * - PUT /api/platform/events/:id          - Update event (EDITOR+ required)
 * - DELETE /api/platform/events/:id       - Soft delete (set active=false, EDITOR+ required)
 * - POST /api/platform/events/:id/rsvp    - Submit/update RSVP (any auth user, upsert)
 * - GET /api/platform/events/:id/rsvps    - List RSVPs for event (EDITOR+ required)
 *
 * AUTH MODEL:
 * - GETs require authentication (any role: VIEWER, EDITOR, ADMIN)
 * - Mutations (POST/PUT/DELETE) require EDITOR+ (mapped from "MANAGER+" in ticket)
 * - POST /:id/rsvp requires any authenticated user (VIEWER, EDITOR, ADMIN)
 * - GET /:id/rsvps requires EDITOR+ (managers need to see who is attending)
 *
 * GOTCHAS:
 * - PlatformEvent uses UUID strings as IDs, NOT integer ids
 * - Soft delete uses active=false, NOT markedForDeletion (PlatformEvent doesn't have markedForDeletion)
 * - RSVP uses upsert on unique constraint [eventId, userId]
 * - Every async handler wrapped in asyncHandler()
 *
 * RELATED FILES:
 * - server/middleware/auth.ts  - requireAuth, requireMinRole
 * - server/middleware/errorHandler.ts - asyncHandler, NotFoundError, ValidationError
 * - prisma/schema.prisma - PlatformEvent, EventRSVP, RSVPStatus models
 */
import { Router } from 'express';
import prisma from '../../db.js';
import { asyncHandler, NotFoundError, ValidationError } from '../../middleware/errorHandler.js';
import { requireAuth, requireMinRole } from '../../middleware/auth.js';
import { platformProtectStrict } from '../../middleware/platformAuth.js';

const router = Router();

// Apply platformProtectStrict to all event routes so req.platformUser is available.
// This ensures createdBy and RSVP userId use PlatformUser.id (UUID) not session user.id (integer).
router.use(platformProtectStrict);

const VALID_RSVP_STATUSES = ['GOING', 'MAYBE', 'NOT_GOING'] as const;

// ---------------------------------------------------------------------------
// GET / - List upcoming active events ordered by startTime
// ---------------------------------------------------------------------------
router.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const events = await prisma.platformEvent.findMany({
      where: { active: true },
      orderBy: { startTime: 'asc' },
      include: {
        _count: { select: { rsvps: true } },
      },
    });
    res.json(events);
  })
);

// ---------------------------------------------------------------------------
// GET /:id/rsvps - List RSVPs for event (EDITOR+ required)
// Must appear before /:id to avoid route conflict
// ---------------------------------------------------------------------------
router.get(
  '/:id/rsvps',
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const event = await prisma.platformEvent.findUnique({ where: { id } });
    if (!event) {
      throw new NotFoundError(`Event ${id} not found`);
    }

    const rsvps = await prisma.eventRSVP.findMany({
      where: { eventId: id },
      include: {
        user: {
          select: { id: true, role: true, unitNumber: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json(rsvps);
  })
);

// ---------------------------------------------------------------------------
// GET /:id - Event detail with RSVP count
// ---------------------------------------------------------------------------
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const event = await prisma.platformEvent.findUnique({
      where: { id },
      include: {
        _count: { select: { rsvps: true } },
      },
    });

    if (!event) {
      throw new NotFoundError(`Event ${id} not found`);
    }

    res.json(event);
  })
);

// ---------------------------------------------------------------------------
// POST / - Create event (EDITOR+ required)
// ---------------------------------------------------------------------------
router.post(
  '/',
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const {
      title,
      description,
      location,
      startTime,
      endTime,
      isRecurring = false,
      recurrenceRule,
      capacity,
      imageId,
    } = req.body;

    if (!title || !description || !startTime) {
      throw new ValidationError('title, description, and startTime are required');
    }

    const createdBy = req.platformUser!.id;

    const event = await prisma.platformEvent.create({
      data: {
        title,
        description,
        location,
        startTime: new Date(startTime),
        endTime: endTime ? new Date(endTime) : undefined,
        isRecurring,
        recurrenceRule,
        capacity,
        imageId,
        createdBy,
        active: true,
      },
      include: {
        _count: { select: { rsvps: true } },
      },
    });

    res.status(201).json(event);
  })
);

// ---------------------------------------------------------------------------
// PUT /:id - Update event (EDITOR+ required)
// ---------------------------------------------------------------------------
router.put(
  '/:id',
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
      title,
      description,
      location,
      startTime,
      endTime,
      isRecurring,
      recurrenceRule,
      capacity,
      imageId,
      active,
    } = req.body;

    const data: Record<string, unknown> = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (location !== undefined) data.location = location;
    if (startTime !== undefined) data.startTime = new Date(startTime);
    if (endTime !== undefined) data.endTime = new Date(endTime);
    if (isRecurring !== undefined) data.isRecurring = isRecurring;
    if (recurrenceRule !== undefined) data.recurrenceRule = recurrenceRule;
    if (capacity !== undefined) data.capacity = capacity;
    if (imageId !== undefined) data.imageId = imageId;
    if (active !== undefined) data.active = active;

    const event = await prisma.platformEvent.update({
      where: { id },
      data,
      include: {
        _count: { select: { rsvps: true } },
      },
    });

    res.json(event);
  })
);

// ---------------------------------------------------------------------------
// DELETE /:id - Soft delete by setting active=false (EDITOR+ required)
// ---------------------------------------------------------------------------
router.delete(
  '/:id',
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    await prisma.platformEvent.update({
      where: { id },
      data: { active: false },
    });

    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// POST /:id/rsvp - Submit/update RSVP (any authenticated user, upsert)
// ---------------------------------------------------------------------------
router.post(
  '/:id/rsvp',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    // Validate status
    if (!status) {
      throw new ValidationError('status is required');
    }
    if (!VALID_RSVP_STATUSES.includes(status as (typeof VALID_RSVP_STATUSES)[number])) {
      throw new ValidationError(`status must be one of: ${VALID_RSVP_STATUSES.join(', ')}`);
    }

    // Check event exists
    const event = await prisma.platformEvent.findUnique({ where: { id } });
    if (!event) {
      throw new NotFoundError(`Event ${id} not found`);
    }

    const userId = req.platformUser!.id;

    const rsvp = await prisma.eventRSVP.upsert({
      where: { eventId_userId: { eventId: id, userId } },
      create: { eventId: id, userId, status },
      update: { status },
    });

    res.json(rsvp);
  })
);

export default router;
