/**
 * Forum Upvotes API Tests
 *
 * Tests for the forum upvote system:
 * - POST /api/forum/posts/:id/upvote — toggle upvote
 * - GET /api/forum/posts/:id/upvotes — get count + user's upvote status
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../server/app.js';
import { testPrisma, authenticatedAgent } from '../setup.js';

// Helper to create a platform user linked to an existing User
async function createPlatformUser(userId: number, overrides: Record<string, unknown> = {}) {
  return testPrisma.platformUser.create({
    data: {
      userId,
      unitNumber: '1A',
      role: 'RESIDENT',
      ...overrides,
    },
  });
}

// Helper to create a forum category
async function createCategory() {
  return testPrisma.forumCategory.create({
    data: { name: `Category-${Date.now()}`, sortOrder: 0 },
  });
}

// Helper to create a forum thread
async function createThread(categoryId: string, authorId: string) {
  return testPrisma.forumThread.create({
    data: {
      categoryId,
      title: 'Test Thread',
      authorId,
    },
  });
}

// Helper to create a forum post
async function createPost(threadId: string, authorId: string, body = 'Test post body') {
  return testPrisma.forumPost.create({
    data: { threadId, authorId, body },
  });
}

describe('Forum Upvotes API', () => {
  describe('GET /api/forum/posts/:id/upvotes', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(app).get('/api/forum/posts/some-uuid/upvotes');
      expect(res.status).toBe(401);
    });

    it('returns count=0 and upvoted=false for a post with no upvotes', async () => {
      const agent = await authenticatedAgent();
      // Get the created user from test setup
      const user = await testPrisma.user.findFirst();
      const platformUser = await createPlatformUser(user!.id);
      const category = await createCategory();
      const thread = await createThread(category.id, platformUser.id);
      const post = await createPost(thread.id, platformUser.id);

      const res = await agent.get(`/api/forum/posts/${post.id}/upvotes`);
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(0);
      expect(res.body.upvoted).toBe(false);
    });

    it('returns 404 for non-existent post', async () => {
      const agent = await authenticatedAgent();
      const res = await agent.get('/api/forum/posts/00000000-0000-0000-0000-000000000000/upvotes');
      expect(res.status).toBe(404);
    });

    it('returns correct count and upvoted=true when user has upvoted', async () => {
      const agent = await authenticatedAgent();
      const user = await testPrisma.user.findFirst();
      const platformUser = await createPlatformUser(user!.id);
      const category = await createCategory();
      const thread = await createThread(category.id, platformUser.id);
      const post = await createPost(thread.id, platformUser.id);

      // Create upvote directly in DB
      await testPrisma.postUpvote.create({
        data: { postId: post.id, userId: platformUser.id },
      });

      const res = await agent.get(`/api/forum/posts/${post.id}/upvotes`);
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
      expect(res.body.upvoted).toBe(true);
    });
  });

  describe('POST /api/forum/posts/:id/upvote', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(app)
        .post('/api/forum/posts/some-uuid/upvote')
        .send({});
      expect(res.status).toBe(401);
    });

    it('creates an upvote and returns upvoted=true', async () => {
      const agent = await authenticatedAgent();
      const user = await testPrisma.user.findFirst();
      const platformUser = await createPlatformUser(user!.id);
      const category = await createCategory();
      const thread = await createThread(category.id, platformUser.id);
      const post = await createPost(thread.id, platformUser.id);

      const res = await agent.post(`/api/forum/posts/${post.id}/upvote`);
      expect(res.status).toBe(200);
      expect(res.body.upvoted).toBe(true);
      expect(res.body.count).toBe(1);

      // Verify in DB
      const upvotes = await testPrisma.postUpvote.findMany({ where: { postId: post.id } });
      expect(upvotes).toHaveLength(1);
    });

    it('removes an upvote (toggle off) and returns upvoted=false', async () => {
      const agent = await authenticatedAgent();
      const user = await testPrisma.user.findFirst();
      const platformUser = await createPlatformUser(user!.id);
      const category = await createCategory();
      const thread = await createThread(category.id, platformUser.id);
      const post = await createPost(thread.id, platformUser.id);

      // Pre-create upvote
      await testPrisma.postUpvote.create({
        data: { postId: post.id, userId: platformUser.id },
      });

      // Toggle off
      const res = await agent.post(`/api/forum/posts/${post.id}/upvote`);
      expect(res.status).toBe(200);
      expect(res.body.upvoted).toBe(false);
      expect(res.body.count).toBe(0);

      // Verify removed from DB
      const upvotes = await testPrisma.postUpvote.findMany({ where: { postId: post.id } });
      expect(upvotes).toHaveLength(0);
    });

    it('returns 404 for non-existent post', async () => {
      const agent = await authenticatedAgent();
      // Need platform user for the request to be valid
      const user = await testPrisma.user.findFirst();
      await createPlatformUser(user!.id);

      const res = await agent.post('/api/forum/posts/00000000-0000-0000-0000-000000000000/upvote');
      expect(res.status).toBe(404);
    });

    it('enforces unique constraint — double upvote is idempotent', async () => {
      const agent = await authenticatedAgent();
      const user = await testPrisma.user.findFirst();
      const platformUser = await createPlatformUser(user!.id);
      const category = await createCategory();
      const thread = await createThread(category.id, platformUser.id);
      const post = await createPost(thread.id, platformUser.id);

      // First upvote
      const res1 = await agent.post(`/api/forum/posts/${post.id}/upvote`);
      expect(res1.status).toBe(200);
      expect(res1.body.upvoted).toBe(true);
      expect(res1.body.count).toBe(1);

      // Second upvote (toggle off)
      const res2 = await agent.post(`/api/forum/posts/${post.id}/upvote`);
      expect(res2.status).toBe(200);
      expect(res2.body.upvoted).toBe(false);
      expect(res2.body.count).toBe(0);
    });
  });
});
