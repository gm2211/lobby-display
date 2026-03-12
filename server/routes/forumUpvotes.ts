/**
 * Forum Upvotes Routes
 *
 * Handles upvote toggling and querying for forum posts.
 * Users must have a linked PlatformUser record to upvote.
 *
 * ROUTES:
 * - POST /api/forum/posts/:id/upvote  — Toggle upvote on/off
 * - GET  /api/forum/posts/:id/upvotes — Get upvote count + user's upvote status
 *
 * AUTHENTICATION:
 * - All routes require a logged-in session (requireAuth via dashboardProtect in app.ts)
 * - The session user must have a linked PlatformUser record for write operations
 *
 * RELATED FILES:
 * - server/services/forumUpvotes.ts — Business logic
 * - server/app.ts — Route registration
 * - prisma/schema.prisma — PostUpvote, ForumPost models
 */
import { Router } from 'express';
import prisma from '../db.js';
import { asyncHandler, NotFoundError } from '../middleware/errorHandler.js';
import { toggleUpvote, getUpvoteCount, hasUserUpvoted } from '../services/forumUpvotes.js';
import { getOrCreatePlatformUser } from '../middleware/platformAuth.js';

const router = Router();

/**
 * GET /api/forum/posts/:id/upvotes
 * Returns upvote count and whether the current user has upvoted.
 */
router.get(
  '/posts/:id/upvotes',
  asyncHandler(async (req, res) => {
    const postId = req.params.id;

    // Verify post exists
    const post = await prisma.forumPost.findUnique({ where: { id: postId } });
    if (!post) {
      throw new NotFoundError(`Forum post not found: ${postId}`);
    }

    const userId = req.session.user?.id;
    let upvoted = false;

    if (userId) {
      // Look up the platform user for the session user
      const platformUser = await prisma.platformUser.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (platformUser) {
        upvoted = await hasUserUpvoted(postId, platformUser.id);
      }
    }

    const count = await getUpvoteCount(postId);
    res.json({ count, upvoted });
  })
);

/**
 * POST /api/forum/posts/:id/upvote
 * Toggles the upvote for the current user on a post.
 * Creates upvote if none exists; deletes if it already exists.
 */
router.post(
  '/posts/:id/upvote',
  asyncHandler(async (req, res) => {
    const postId = req.params.id;

    // Verify post exists
    const post = await prisma.forumPost.findUnique({ where: { id: postId } });
    if (!post) {
      throw new NotFoundError(`Forum post not found: ${postId}`);
    }

    const userId = req.session.user?.id;
    const userRole = req.session.user?.role;

    // Find or auto-provision the platform user linked to the session user
    const platformUser = userId && userRole
      ? await getOrCreatePlatformUser(userId, userRole)
      : null;

    if (!platformUser) {
      throw new NotFoundError('No platform user profile found for current user');
    }

    const result = await toggleUpvote(postId, platformUser.id);
    res.json(result);
  })
);

export default router;
