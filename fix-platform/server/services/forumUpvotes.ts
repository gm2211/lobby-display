/**
 * Forum Upvotes Service
 *
 * Handles per-post per-user upvote tracking with toggle behavior.
 * Each user can upvote a post at most once (enforced by unique constraint).
 *
 * FUNCTIONS:
 * - toggleUpvote(postId, userId): Creates or removes an upvote record (toggle).
 * - getUpvoteCount(postId): Returns total upvote count for a post.
 * - hasUserUpvoted(postId, userId): Returns whether a user has upvoted a post.
 * - getTopPosts(categoryId?, limit?): Returns posts sorted by upvote count desc.
 *
 * RELATED FILES:
 * - server/routes/forumUpvotes.ts — API routes that use this service
 * - prisma/schema.prisma — PostUpvote model definition
 */
import prisma from '../db.js';

export interface UpvoteResult {
  upvoted: boolean;
  count: number;
}

/**
 * Toggle upvote for a post by a user.
 * Creates the upvote if it doesn't exist; deletes it if it does.
 *
 * @param postId - UUID of the ForumPost
 * @param userId - UUID of the PlatformUser
 * @returns Object with `upvoted` (current state) and `count` (new total)
 */
export async function toggleUpvote(postId: string, userId: string): Promise<UpvoteResult> {
  const existing = await prisma.postUpvote.findUnique({
    where: { postId_userId: { postId, userId } },
  });

  if (existing) {
    await prisma.postUpvote.delete({
      where: { postId_userId: { postId, userId } },
    });
    const count = await prisma.postUpvote.count({ where: { postId } });
    return { upvoted: false, count };
  } else {
    await prisma.postUpvote.create({ data: { postId, userId } });
    const count = await prisma.postUpvote.count({ where: { postId } });
    return { upvoted: true, count };
  }
}

/**
 * Get the total upvote count for a post.
 *
 * @param postId - UUID of the ForumPost
 * @returns Total number of upvotes
 */
export async function getUpvoteCount(postId: string): Promise<number> {
  return prisma.postUpvote.count({ where: { postId } });
}

/**
 * Check whether a specific user has upvoted a post.
 *
 * @param postId - UUID of the ForumPost
 * @param userId - UUID of the PlatformUser
 * @returns true if the user has upvoted, false otherwise
 */
export async function hasUserUpvoted(postId: string, userId: string): Promise<boolean> {
  const upvote = await prisma.postUpvote.findUnique({
    where: { postId_userId: { postId, userId } },
  });
  return upvote !== null;
}

/**
 * Get top-upvoted posts, optionally filtered by category.
 *
 * @param categoryId - Optional ForumCategory UUID to filter by
 * @param limit - Max number of posts to return (default 10)
 * @returns Posts sorted by upvote count descending, with upvote count included
 */
export async function getTopPosts(categoryId: string | undefined, limit = 10) {
  return prisma.forumPost.findMany({
    where: categoryId ? { thread: { categoryId } } : undefined,
    orderBy: { upvotes: { _count: 'desc' } },
    take: limit,
    include: {
      _count: { select: { upvotes: true } },
      author: { select: { id: true, unitNumber: true } },
      thread: { select: { id: true, title: true, categoryId: true } },
    },
  });
}
