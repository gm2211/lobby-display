/**
 * Forum API Routes - Community discussion forum management.
 *
 * ROUTES:
 * - GET /api/platform/forum/categories                          - List all categories sorted by sortOrder
 * - GET /api/platform/forum/categories/:categoryId/threads      - Paginated thread list for category (with post count)
 * - GET /api/platform/forum/threads/:id                         - Thread detail with paginated posts
 * - POST /api/platform/forum/threads                            - Create new thread (any authenticated user)
 * - PUT /api/platform/forum/threads/:id                         - Update own thread title, or EDITOR+ can pin/lock
 * - POST /api/platform/forum/threads/:threadId/posts            - Create post in thread (if not locked, or EDITOR+)
 * - PUT /api/platform/forum/posts/:id                           - Update own post body (author only)
 * - DELETE /api/platform/forum/posts/:id                        - Delete own post, or EDITOR+ can moderate
 *
 * AUTH MODEL:
 * - All GETs require authentication (any role)
 * - POST /threads: any authenticated user
 * - PUT /threads/:id: author can update title; EDITOR+ can pin/lock
 * - POST /threads/:threadId/posts: any auth user if thread is not locked; EDITOR+ can bypass lock
 * - PUT /posts/:id: author only (own post)
 * - DELETE /posts/:id: author can delete own post; EDITOR+ can moderate (delete any)
 *
 * GOTCHAS:
 * - ForumCategory, ForumThread, ForumPost use UUID strings as IDs
 * - authorId is stored as a string (String() cast of session user's numeric id)
 * - Pagination via ?page=1&pageSize=20 query params
 * - Locked threads reject posts from non-EDITOR+ users (403)
 * - Only the thread author can update title; pin/lock requires EDITOR+
 * - Only the post author can update body; EDITOR+ can delete any post
 *
 * RELATED FILES:
 * - server/middleware/auth.ts          - requireAuth, requireMinRole
 * - server/middleware/errorHandler.ts  - asyncHandler, NotFoundError, ValidationError
 * - server/middleware/platformAuth.ts  - platformProtect (applied at router level in index.ts)
 * - prisma/schema.prisma               - ForumCategory, ForumThread, ForumPost models
 * - tests/unit/forum-routes.test.ts   - unit tests (Prisma mocked)
 */
import { Router } from 'express';
import prisma from '../../db.js';
import {
  asyncHandler,
  NotFoundError,
  ValidationError,
} from '../../middleware/errorHandler.js';
import { requireAuth, requireMinRole, ROLE_LEVEL, AuthorizationError } from '../../middleware/auth.js';
import { platformProtectStrict } from '../../middleware/platformAuth.js';

const router = Router();

// ─── GET /categories ──────────────────────────────────────────────────────────
// List all forum categories sorted by sortOrder ascending.

router.get(
  '/categories',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const categories = await prisma.forumCategory.findMany({
      orderBy: { sortOrder: 'asc' },
    });

    res.json(categories);
  })
);

// ─── GET /categories/:categoryId/threads ──────────────────────────────────────
// Paginated thread list for a category. Includes post count per thread.

router.get(
  '/categories/:categoryId/threads',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { categoryId } = req.params;
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const pageSize = Math.max(1, parseInt(String(req.query.pageSize ?? '20'), 10) || 20);
    const skip = (page - 1) * pageSize;

    const category = await prisma.forumCategory.findUnique({ where: { id: categoryId } });
    if (!category) {
      throw new NotFoundError(`ForumCategory ${categoryId} not found`);
    }

    const [total, threads] = await Promise.all([
      prisma.forumThread.count({ where: { categoryId } }),
      prisma.forumThread.findMany({
        where: { categoryId },
        include: {
          _count: { select: { posts: true } },
        },
        orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: pageSize,
      }),
    ]);

    res.json({ threads, total, page, pageSize });
  })
);

// ─── GET /threads ────────────────────────────────────────────────────────────────
// List all threads, optionally filtered by categoryId. Paginated.
// NOTE: Must be defined BEFORE /threads/:id to avoid route shadowing.

router.get(
  '/threads',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { categoryId } = req.query;
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const pageSize = Math.max(1, parseInt(String(req.query.pageSize ?? '20'), 10) || 20);
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};
    if (categoryId && typeof categoryId === 'string') {
      where.categoryId = categoryId;
    }

    const [total, threads] = await Promise.all([
      prisma.forumThread.count({ where }),
      prisma.forumThread.findMany({
        where,
        include: {
          _count: { select: { posts: true } },
        },
        orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: pageSize,
      }),
    ]);

    res.json(threads);
  })
);

// ─── GET /threads/:id ─────────────────────────────────────────────────────────
// Thread detail with paginated posts.

router.get(
  '/threads/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const pageSize = Math.max(1, parseInt(String(req.query.pageSize ?? '20'), 10) || 20);
    const skip = (page - 1) * pageSize;

    const thread = await prisma.forumThread.findUnique({ where: { id } });
    if (!thread) {
      throw new NotFoundError(`ForumThread ${id} not found`);
    }

    const [total, posts] = await Promise.all([
      prisma.forumPost.count({ where: { threadId: id } }),
      prisma.forumPost.findMany({
        where: { threadId: id },
        orderBy: { createdAt: 'asc' },
        skip,
        take: pageSize,
      }),
    ]);

    res.json({ thread, posts, total, page, pageSize });
  })
);

// ─── POST /threads ────────────────────────────────────────────────────────────
// Create a new thread (any authenticated user with a platform user record).

router.post(
  '/threads',
  requireAuth,
  platformProtectStrict,
  asyncHandler(async (req, res) => {
    const { title, categoryId } = req.body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      throw new ValidationError('title is required');
    }
    if (!categoryId || typeof categoryId !== 'string' || !categoryId.trim()) {
      throw new ValidationError('categoryId is required');
    }

    const category = await prisma.forumCategory.findUnique({ where: { id: categoryId } });
    if (!category) {
      throw new NotFoundError(`ForumCategory ${categoryId} not found`);
    }

    const authorId = req.platformUser!.id;

    const thread = await prisma.forumThread.create({
      data: {
        title: title.trim(),
        categoryId,
        authorId,
        pinned: false,
        locked: false,
      },
      include: {
        _count: { select: { posts: true } },
      },
    });

    res.status(201).json(thread);
  })
);

// ─── PUT /threads/:id ─────────────────────────────────────────────────────────
// Update thread. Author can update title. EDITOR+ can update pinned/locked.

router.put(
  '/threads/:id',
  requireAuth,
  platformProtectStrict,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { title, pinned, locked } = req.body;

    const thread = await prisma.forumThread.findUnique({ where: { id } });
    if (!thread) {
      throw new NotFoundError(`ForumThread ${id} not found`);
    }

    const userId = req.platformUser!.id;
    const userRole = req.session.user!.role;
    const isManager = (ROLE_LEVEL[userRole] ?? 0) >= (ROLE_LEVEL['EDITOR'] ?? 0);
    const isAuthor = thread.authorId === userId;

    const data: Record<string, unknown> = {};

    // Title can only be updated by the author
    if (title !== undefined) {
      if (!isAuthor && !isManager) {
        throw new AuthorizationError('Only the thread author can update the title');
      }
      data.title = typeof title === 'string' ? title.trim() : title;
    }

    // pinned and locked can only be updated by EDITOR+
    if (pinned !== undefined || locked !== undefined) {
      if (!isManager) {
        throw new AuthorizationError('Only moderators can pin or lock threads');
      }
      if (pinned !== undefined) data.pinned = Boolean(pinned);
      if (locked !== undefined) data.locked = Boolean(locked);
    }

    // If only title was passed and user is not owner, it's already blocked above.
    // If nothing was sent, just return the existing thread.
    if (Object.keys(data).length === 0) {
      res.json(thread);
      return;
    }

    const updated = await prisma.forumThread.update({
      where: { id },
      data,
      include: {
        _count: { select: { posts: true } },
      },
    });

    res.json(updated);
  })
);

// ─── POST /threads/:threadId/posts ────────────────────────────────────────────
// Create a post in a thread. Thread must not be locked (unless EDITOR+).

router.post(
  '/threads/:threadId/posts',
  requireAuth,
  platformProtectStrict,
  asyncHandler(async (req, res) => {
    const { threadId } = req.params;
    const { body } = req.body;

    const thread = await prisma.forumThread.findUnique({ where: { id: threadId } });
    if (!thread) {
      throw new NotFoundError(`ForumThread ${threadId} not found`);
    }

    if (!body || typeof body !== 'string' || !body.trim()) {
      throw new ValidationError('body is required');
    }

    const userRole = req.session.user!.role;
    const isManager = (ROLE_LEVEL[userRole] ?? 0) >= (ROLE_LEVEL['EDITOR'] ?? 0);

    if (thread.locked && !isManager) {
      throw new AuthorizationError('This thread is locked');
    }

    const authorId = req.platformUser!.id;

    const post = await prisma.forumPost.create({
      data: {
        threadId,
        authorId,
        body: body.trim(),
      },
    });

    res.status(201).json(post);
  })
);

// ─── PUT /posts/:id ───────────────────────────────────────────────────────────
// Update a post body. Author only.

router.put(
  '/posts/:id',
  requireAuth,
  platformProtectStrict,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { body } = req.body;

    const post = await prisma.forumPost.findUnique({ where: { id } });
    if (!post) {
      throw new NotFoundError(`ForumPost ${id} not found`);
    }

    if (!body || typeof body !== 'string' || !body.trim()) {
      throw new ValidationError('body is required');
    }

    const userId = req.platformUser!.id;
    if (post.authorId !== userId) {
      throw new AuthorizationError('Only the post author can edit this post');
    }

    const updated = await prisma.forumPost.update({
      where: { id },
      data: { body: body.trim() },
    });

    res.json(updated);
  })
);

// ─── DELETE /posts/:id ────────────────────────────────────────────────────────
// Delete a post. Author can delete their own; EDITOR+ can moderate (delete any).

router.delete(
  '/posts/:id',
  requireAuth,
  platformProtectStrict,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const post = await prisma.forumPost.findUnique({ where: { id } });
    if (!post) {
      throw new NotFoundError(`ForumPost ${id} not found`);
    }

    const userId = req.platformUser!.id;
    const userRole = req.session.user!.role;
    const isManager = (ROLE_LEVEL[userRole] ?? 0) >= (ROLE_LEVEL['EDITOR'] ?? 0);
    const isAuthor = post.authorId === userId;

    if (!isAuthor && !isManager) {
      throw new AuthorizationError('Only the post author or a moderator can delete this post');
    }

    await prisma.forumPost.delete({ where: { id } });

    res.status(204).send();
  })
);

// ─── POST /threads/:threadId/follow ──────────────────────────────────────────
// Follow a thread (any authenticated user with platform user record). (REQ-4.19-3)

router.post(
  '/threads/:threadId/follow',
  requireAuth,
  platformProtectStrict,
  asyncHandler(async (req, res) => {
    const { threadId } = req.params;

    const thread = await prisma.forumThread.findUnique({ where: { id: threadId } });
    if (!thread) {
      throw new NotFoundError(`ForumThread ${threadId} not found`);
    }

    const userId = req.platformUser!.id;

    // Upsert — idempotent
    const follow = await prisma.threadFollow.upsert({
      where: { threadId_userId: { threadId, userId } },
      create: { threadId, userId },
      update: {},
    });

    res.status(201).json(follow);
  })
);

// ─── DELETE /threads/:threadId/follow ────────────────────────────────────────
// Unfollow a thread (any authenticated user). (REQ-4.19-3)

router.delete(
  '/threads/:threadId/follow',
  requireAuth,
  platformProtectStrict,
  asyncHandler(async (req, res) => {
    const { threadId } = req.params;
    const userId = req.platformUser!.id;

    const existing = await prisma.threadFollow.findUnique({
      where: { threadId_userId: { threadId, userId } },
    });

    if (!existing) {
      throw new NotFoundError('You are not following this thread');
    }

    await prisma.threadFollow.delete({
      where: { threadId_userId: { threadId, userId } },
    });

    res.status(204).send();
  })
);

// ─── GET /threads/:threadId/follow ──────────────────────────────────────────
// Check if current user follows a thread. (REQ-4.19-3)

router.get(
  '/threads/:threadId/follow',
  requireAuth,
  platformProtectStrict,
  asyncHandler(async (req, res) => {
    const { threadId } = req.params;
    const userId = req.platformUser!.id;

    const follow = await prisma.threadFollow.findUnique({
      where: { threadId_userId: { threadId, userId } },
    });

    res.json({ following: !!follow });
  })
);

export default router;
