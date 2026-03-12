/**
 * Forum Upvotes Service Unit Tests
 *
 * Tests the forumUpvotes service functions in isolation using a mock Prisma client.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma before importing the service
const mockPrisma = {
  postUpvote: {
    findUnique: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  forumPost: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
};

vi.mock('../../server/db.js', () => ({ default: mockPrisma }));

// Import after mocking
const { toggleUpvote, getUpvoteCount, hasUserUpvoted, getTopPosts } = await import(
  '../../server/services/forumUpvotes.js'
);

describe('Forum Upvotes Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('toggleUpvote', () => {
    it('creates an upvote when none exists', async () => {
      mockPrisma.postUpvote.findUnique.mockResolvedValue(null);
      mockPrisma.postUpvote.create.mockResolvedValue({ id: 'upvote-1', postId: 'post-1', userId: 'user-1' });
      mockPrisma.postUpvote.count.mockResolvedValue(1);

      const result = await toggleUpvote('post-1', 'user-1');

      expect(mockPrisma.postUpvote.findUnique).toHaveBeenCalledWith({
        where: { postId_userId: { postId: 'post-1', userId: 'user-1' } },
      });
      expect(mockPrisma.postUpvote.create).toHaveBeenCalledWith({
        data: { postId: 'post-1', userId: 'user-1' },
      });
      expect(result).toEqual({ upvoted: true, count: 1 });
    });

    it('removes an upvote when one already exists', async () => {
      const existingUpvote = { id: 'upvote-1', postId: 'post-1', userId: 'user-1' };
      mockPrisma.postUpvote.findUnique.mockResolvedValue(existingUpvote);
      mockPrisma.postUpvote.delete.mockResolvedValue(existingUpvote);
      mockPrisma.postUpvote.count.mockResolvedValue(0);

      const result = await toggleUpvote('post-1', 'user-1');

      expect(mockPrisma.postUpvote.delete).toHaveBeenCalledWith({
        where: { postId_userId: { postId: 'post-1', userId: 'user-1' } },
      });
      expect(result).toEqual({ upvoted: false, count: 0 });
    });
  });

  describe('getUpvoteCount', () => {
    it('returns the count of upvotes for a post', async () => {
      mockPrisma.postUpvote.count.mockResolvedValue(5);

      const count = await getUpvoteCount('post-1');

      expect(mockPrisma.postUpvote.count).toHaveBeenCalledWith({
        where: { postId: 'post-1' },
      });
      expect(count).toBe(5);
    });

    it('returns 0 when no upvotes exist', async () => {
      mockPrisma.postUpvote.count.mockResolvedValue(0);

      const count = await getUpvoteCount('post-2');
      expect(count).toBe(0);
    });
  });

  describe('hasUserUpvoted', () => {
    it('returns true when user has upvoted the post', async () => {
      mockPrisma.postUpvote.findUnique.mockResolvedValue({ id: 'upvote-1' });

      const result = await hasUserUpvoted('post-1', 'user-1');

      expect(mockPrisma.postUpvote.findUnique).toHaveBeenCalledWith({
        where: { postId_userId: { postId: 'post-1', userId: 'user-1' } },
      });
      expect(result).toBe(true);
    });

    it('returns false when user has not upvoted the post', async () => {
      mockPrisma.postUpvote.findUnique.mockResolvedValue(null);

      const result = await hasUserUpvoted('post-1', 'user-2');
      expect(result).toBe(false);
    });
  });

  describe('getTopPosts', () => {
    it('returns posts sorted by upvote count descending', async () => {
      const mockPosts = [
        { id: 'post-1', body: 'First', upvotes: [1, 2, 3] },
        { id: 'post-2', body: 'Second', upvotes: [1] },
      ];
      mockPrisma.forumPost.findMany.mockResolvedValue(mockPosts);

      const posts = await getTopPosts(undefined, 10);

      expect(mockPrisma.forumPost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { upvotes: { _count: 'desc' } },
          take: 10,
        })
      );
      expect(posts).toEqual(mockPosts);
    });

    it('filters by categoryId when provided', async () => {
      mockPrisma.forumPost.findMany.mockResolvedValue([]);

      await getTopPosts('category-1', 5);

      expect(mockPrisma.forumPost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { thread: { categoryId: 'category-1' } },
          take: 5,
        })
      );
    });

    it('does not filter by categoryId when not provided', async () => {
      mockPrisma.forumPost.findMany.mockResolvedValue([]);

      await getTopPosts(undefined, 10);

      const callArgs = mockPrisma.forumPost.findMany.mock.calls[0][0];
      expect(callArgs.where).toBeUndefined();
    });
  });
});
