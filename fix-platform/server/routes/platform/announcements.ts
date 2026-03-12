/**
 * Platform Announcements API Routes - CRUD operations for platform announcements.
 *
 * Extends createPlatformCrudRoutes with SSE push notifications:
 * - POST /  (create): if publishedAt is set, broadcasts announcement:new to
 *   the 'platform:announcements' SSE channel via notifyNewAnnouncement().
 * - PUT /:id (update): if the update adds publishedAt to a previously unpublished
 *   announcement, broadcasts announcement:new to the same channel.
 *
 * All other behaviour (list, get, delete, read-receipt) is delegated to
 * createPlatformCrudRoutes unchanged.
 *
 * ROUTES:
 * - GET /api/platform/announcements           - List (cursor-paginated, auth required)
 * - GET /api/platform/announcements/:id       - Get single announcement (auth required)
 * - POST /api/platform/announcements          - Create new announcement (EDITOR+ required)
 * - PUT /api/platform/announcements/:id       - Update announcement (EDITOR+ required)
 * - DELETE /api/platform/announcements/:id    - Soft-delete announcement (EDITOR+ required)
 * - POST /api/platform/announcements/:id/read - Mark as read (any auth user)
 *
 * RELATED FILES:
 * - server/utils/createPlatformCrudRoutes.ts  - Factory that generates base routes
 * - server/services/announcementNotifier.ts   - SSE broadcast helper
 * - prisma/schema.prisma                      - Announcement and AnnouncementRead models
 */
import { Router } from 'express';
import prisma from '../../db.js';
import { asyncHandler, NotFoundError, ValidationError } from '../../middleware/errorHandler.js';
import { requireAuth, requireMinRole } from '../../middleware/auth.js';
import { notifyNewAnnouncement } from '../../services/announcementNotifier.js';

const router = Router();

/**
 * GET / - List announcements (pinned first, then priority desc, then newest)
 * Excludes soft-deleted and expired announcements.
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const items = await prisma.announcement.findMany({
      where: {
        markedForDeletion: false,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
      },
      orderBy: [{ pinned: 'desc' }, { priority: 'desc' }, { createdAt: 'desc' }],
    });
    res.json(items);
  })
);

/**
 * GET /:id - Get single announcement by UUID
 * Returns 404 if not found or soft-deleted.
 */
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const item = await prisma.announcement.findUnique({ where: { id } });
    if (!item || item.markedForDeletion) throw new NotFoundError('announcement not found');
    res.json(item);
  })
);

/**
 * POST / - Create new announcement (EDITOR+ required)
 * If publishedAt is provided, broadcasts announcement:new SSE event.
 */
router.post(
  '/',
  requireAuth,
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const { title, body, pinned, priority, publishedAt, expiresAt, buildingId } = req.body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      throw new ValidationError('title is required');
    }
    if (!body || typeof body !== 'string' || !body.trim()) {
      throw new ValidationError('body is required');
    }

    // createdBy should come from platformUser if available, fallback to session
    const createdBy = req.platformUser?.id ?? String(req.session.user!.id);

    const item = await prisma.announcement.create({
      data: {
        title: title.trim(),
        body: body.trim(),
        pinned: pinned ?? false,
        priority: typeof priority === 'number' ? priority : 0,
        publishedAt: publishedAt ? new Date(publishedAt) : null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        buildingId: buildingId ?? null,
        createdBy,
      },
    });
    res.status(201).json(item);

    if (item.publishedAt) {
      notifyNewAnnouncement(item);
    }
  })
);

/**
 * PUT /:id - Update announcement by UUID (EDITOR+ required)
 * If the update adds publishedAt to a previously unpublished announcement,
 * broadcasts announcement:new SSE event.
 */
router.put(
  '/:id',
  requireAuth,
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const before = await prisma.announcement.findUnique({ where: { id } });
    if (!before || before.markedForDeletion) throw new NotFoundError('announcement not found');

    const { title, body, pinned, priority, publishedAt, expiresAt, buildingId } = req.body;

    const data: Record<string, unknown> = {};
    if (title !== undefined) data.title = title;
    if (body !== undefined) data.body = body;
    if (pinned !== undefined) data.pinned = pinned;
    if (priority !== undefined) data.priority = priority;
    if (publishedAt !== undefined) data.publishedAt = publishedAt ? new Date(publishedAt) : null;
    if (expiresAt !== undefined) data.expiresAt = expiresAt ? new Date(expiresAt) : null;
    if (buildingId !== undefined) data.buildingId = buildingId;

    const item = await prisma.announcement.update({ where: { id }, data });
    res.json(item);

    // Notify only when publishedAt is newly added (was null before, now set).
    if (!before.publishedAt && item.publishedAt) {
      notifyNewAnnouncement(item);
    }
  })
);

/**
 * DELETE /:id - Soft-delete announcement (EDITOR+ required)
 */
router.delete(
  '/:id',
  requireAuth,
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const existing = await prisma.announcement.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('announcement not found');

    await prisma.announcement.update({
      where: { id },
      data: { markedForDeletion: true },
    });
    res.json({ ok: true });
  })
);

/**
 * POST /:id/read - Mark announcement as read for the current user
 */
router.post(
  '/:id/read',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const announcement = await prisma.announcement.findUnique({ where: { id } });
    if (!announcement) throw new NotFoundError('announcement not found');

    const userId = req.platformUser?.id ?? String(req.session.user!.id);

    await prisma.announcementRead.upsert({
      where: { announcementId_userId: { announcementId: id, userId } },
      create: { announcementId: id, userId },
      update: {},
    });

    res.json({ ok: true });
  })
);

export default router;
