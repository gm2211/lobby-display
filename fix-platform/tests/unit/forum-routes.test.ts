/**
 * Unit tests for Forum API routes.
 *
 * Uses vi.mock to mock Prisma so no database is needed.
 * Tests cover:
 *  - GET /categories - list all categories sorted by sortOrder
 *  - GET /categories/:categoryId/threads - paginated thread list with post count
 *  - GET /threads/:id - thread detail with paginated posts
 *  - POST /threads - create new thread (any authenticated user)
 *  - PUT /threads/:id - update own thread, or MANAGER+ can pin/lock
 *  - POST /threads/:threadId/posts - create post (if not locked, or MANAGER+)
 *  - PUT /posts/:id - update own post body
 *  - DELETE /posts/:id - delete own post, or MANAGER+ can moderate
 *
 * Auth model:
 *  - All routes require authentication (admin/dashboard session)
 *  - Thread creation: any authenticated user
 *  - Thread update: own thread title, or MANAGER+ can pin/lock
 *  - Post creation: any auth user if thread is not locked, MANAGER+ can post to locked
 *  - Post update: own post only
 *  - Post delete: own post, or MANAGER+ can moderate
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { errorHandler } from '../../server/middleware/errorHandler.js';

// Mock Prisma before importing routes
vi.mock('../../server/db.js', () => ({
  default: {
    platformUser: {
      findUnique: vi.fn(),
    },
    forumCategory: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    forumThread: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    forumPost: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import prisma from '../../server/db.js';
import forumRouter from '../../server/routes/platform/forum.js';

// Type helpers for mocked Prisma functions
const mockPrisma = prisma as {
  platformUser: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  forumCategory: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
  forumThread: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  forumPost: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
};

/** Build a minimal Express app with a session user. */
function buildApp(
  role: 'ADMIN' | 'EDITOR' | 'VIEWER' | null = 'ADMIN',
  userId: number = 1,
  platformUserId: string = 'platform-user-uuid-1'
) {
  const app = express();
  app.use(express.json());

  // Inject mock session
  app.use((req: any, _res, next) => {
    if (role !== null) {
      req.session = { user: { id: userId, username: 'testuser', role } };
    } else {
      req.session = {};
    }
    next();
  });

  // Configure mock platformUser.findUnique so platformProtectStrict can run
  if (role !== null) {
    mockPrisma.platformUser.findUnique.mockResolvedValue({
      id: platformUserId,
      userId,
      role: 'RESIDENT',
    });
  }

  app.use('/api/platform/forum', forumRouter);
  app.use(errorHandler);
  return app;
}

const sampleCategory = {
  id: 'cat-uuid-1',
  name: 'General Discussion',
  description: 'Talk about anything',
  sortOrder: 1,
};

const sampleCategory2 = {
  id: 'cat-uuid-2',
  name: 'Announcements',
  description: null,
  sortOrder: 0,
};

const sampleThread = {
  id: 'thread-uuid-1',
  categoryId: 'cat-uuid-1',
  title: 'Welcome to the forum',
  authorId: '1',
  pinned: false,
  locked: false,
  createdAt: new Date('2025-01-01').toISOString(),
  updatedAt: new Date('2025-01-01').toISOString(),
  _count: { posts: 5 },
};

const samplePost = {
  id: 'post-uuid-1',
  threadId: 'thread-uuid-1',
  authorId: '1',
  body: 'Hello world!',
  createdAt: new Date('2025-01-01').toISOString(),
  updatedAt: new Date('2025-01-01').toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── GET /categories ──────────────────────────────────────────────────────────

describe('GET /api/platform/forum/categories', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).get('/api/platform/forum/categories');
    expect(res.status).toBe(401);
  });

  it('returns categories sorted by sortOrder for authenticated user', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.forumCategory.findMany.mockResolvedValue([sampleCategory2, sampleCategory]);
    const res = await request(app).get('/api/platform/forum/categories');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);
  });

  it('orders categories by sortOrder ascending', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.forumCategory.findMany.mockResolvedValue([sampleCategory2, sampleCategory]);
    await request(app).get('/api/platform/forum/categories');
    const callArgs = mockPrisma.forumCategory.findMany.mock.calls[0][0];
    expect(callArgs.orderBy).toMatchObject({ sortOrder: 'asc' });
  });

  it('returns categories for ADMIN too', async () => {
    const app = buildApp('ADMIN');
    mockPrisma.forumCategory.findMany.mockResolvedValue([sampleCategory]);
    const res = await request(app).get('/api/platform/forum/categories');
    expect(res.status).toBe(200);
  });

  it('returns categories for EDITOR too', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.forumCategory.findMany.mockResolvedValue([sampleCategory]);
    const res = await request(app).get('/api/platform/forum/categories');
    expect(res.status).toBe(200);
  });
});

// ─── GET /categories/:categoryId/threads ──────────────────────────────────────

describe('GET /api/platform/forum/categories/:categoryId/threads', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).get('/api/platform/forum/categories/cat-uuid-1/threads');
    expect(res.status).toBe(401);
  });

  it('returns 404 when category not found', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.forumCategory.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/platform/forum/categories/nonexistent/threads');
    expect(res.status).toBe(404);
  });

  it('returns paginated threads for a category', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.forumCategory.findUnique.mockResolvedValue(sampleCategory);
    mockPrisma.forumThread.count.mockResolvedValue(1);
    mockPrisma.forumThread.findMany.mockResolvedValue([sampleThread]);
    const res = await request(app).get('/api/platform/forum/categories/cat-uuid-1/threads');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('threads');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page');
    expect(res.body).toHaveProperty('pageSize');
    expect(Array.isArray(res.body.threads)).toBe(true);
  });

  it('filters threads by categoryId', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.forumCategory.findUnique.mockResolvedValue(sampleCategory);
    mockPrisma.forumThread.count.mockResolvedValue(1);
    mockPrisma.forumThread.findMany.mockResolvedValue([sampleThread]);
    await request(app).get('/api/platform/forum/categories/cat-uuid-1/threads');
    const callArgs = mockPrisma.forumThread.findMany.mock.calls[0][0];
    expect(callArgs.where).toMatchObject({ categoryId: 'cat-uuid-1' });
  });

  it('includes post count in thread list', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.forumCategory.findUnique.mockResolvedValue(sampleCategory);
    mockPrisma.forumThread.count.mockResolvedValue(1);
    mockPrisma.forumThread.findMany.mockResolvedValue([sampleThread]);
    await request(app).get('/api/platform/forum/categories/cat-uuid-1/threads');
    const callArgs = mockPrisma.forumThread.findMany.mock.calls[0][0];
    expect(callArgs.include._count.select).toHaveProperty('posts');
  });

  it('supports page and pageSize query params', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.forumCategory.findUnique.mockResolvedValue(sampleCategory);
    mockPrisma.forumThread.count.mockResolvedValue(10);
    mockPrisma.forumThread.findMany.mockResolvedValue([sampleThread]);
    const res = await request(app).get('/api/platform/forum/categories/cat-uuid-1/threads?page=2&pageSize=5');
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(2);
    expect(res.body.pageSize).toBe(5);
    const callArgs = mockPrisma.forumThread.findMany.mock.calls[0][0];
    expect(callArgs.skip).toBe(5); // (page-1) * pageSize = (2-1)*5 = 5
    expect(callArgs.take).toBe(5);
  });

  it('defaults to page 1 when not specified', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.forumCategory.findUnique.mockResolvedValue(sampleCategory);
    mockPrisma.forumThread.count.mockResolvedValue(1);
    mockPrisma.forumThread.findMany.mockResolvedValue([sampleThread]);
    const res = await request(app).get('/api/platform/forum/categories/cat-uuid-1/threads');
    expect(res.body.page).toBe(1);
  });
});

// ─── GET /threads/:id ─────────────────────────────────────────────────────────

describe('GET /api/platform/forum/threads/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).get('/api/platform/forum/threads/thread-uuid-1');
    expect(res.status).toBe(401);
  });

  it('returns 404 when thread not found', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.forumThread.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/platform/forum/threads/nonexistent');
    expect(res.status).toBe(404);
  });

  it('returns thread detail with paginated posts', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.forumThread.findUnique.mockResolvedValue(sampleThread);
    mockPrisma.forumPost.count.mockResolvedValue(1);
    mockPrisma.forumPost.findMany.mockResolvedValue([samplePost]);
    const res = await request(app).get('/api/platform/forum/threads/thread-uuid-1');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('thread');
    expect(res.body).toHaveProperty('posts');
    expect(res.body).toHaveProperty('total');
    expect(res.body.thread.id).toBe('thread-uuid-1');
  });

  it('supports pagination for posts', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.forumThread.findUnique.mockResolvedValue(sampleThread);
    mockPrisma.forumPost.count.mockResolvedValue(20);
    mockPrisma.forumPost.findMany.mockResolvedValue([samplePost]);
    const res = await request(app).get('/api/platform/forum/threads/thread-uuid-1?page=2&pageSize=10');
    expect(res.status).toBe(200);
    const callArgs = mockPrisma.forumPost.findMany.mock.calls[0][0];
    expect(callArgs.skip).toBe(10);
    expect(callArgs.take).toBe(10);
  });

  it('queries by thread id correctly', async () => {
    const app = buildApp('ADMIN');
    mockPrisma.forumThread.findUnique.mockResolvedValue(sampleThread);
    mockPrisma.forumPost.count.mockResolvedValue(0);
    mockPrisma.forumPost.findMany.mockResolvedValue([]);
    await request(app).get('/api/platform/forum/threads/thread-uuid-1');
    const callArgs = mockPrisma.forumThread.findUnique.mock.calls[0][0];
    expect(callArgs.where).toMatchObject({ id: 'thread-uuid-1' });
  });
});

// ─── POST /threads ────────────────────────────────────────────────────────────

describe('POST /api/platform/forum/threads', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app)
      .post('/api/platform/forum/threads')
      .send({ title: 'Test Thread', categoryId: 'cat-uuid-1' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when title is missing', async () => {
    const app = buildApp('VIEWER');
    const res = await request(app)
      .post('/api/platform/forum/threads')
      .send({ categoryId: 'cat-uuid-1' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/title/i);
  });

  it('returns 400 when categoryId is missing', async () => {
    const app = buildApp('VIEWER');
    const res = await request(app)
      .post('/api/platform/forum/threads')
      .send({ title: 'Test Thread' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/categoryId/i);
  });

  it('returns 404 when category not found', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.forumCategory.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/platform/forum/threads')
      .send({ title: 'Test Thread', categoryId: 'nonexistent' });
    expect(res.status).toBe(404);
  });

  it('creates a thread for VIEWER (any authenticated user)', async () => {
    const app = buildApp('VIEWER', 42);
    mockPrisma.forumCategory.findUnique.mockResolvedValue(sampleCategory);
    mockPrisma.forumThread.create.mockResolvedValue(sampleThread);
    const res = await request(app)
      .post('/api/platform/forum/threads')
      .send({ title: 'Test Thread', categoryId: 'cat-uuid-1' });
    expect(res.status).toBe(201);
    const createArgs = mockPrisma.forumThread.create.mock.calls[0][0];
    expect(createArgs.data.title).toBe('Test Thread');
    expect(createArgs.data.categoryId).toBe('cat-uuid-1');
  });

  it('sets the authorId from the platform user id', async () => {
    const app = buildApp('VIEWER', 99, 'platform-user-uuid-99');
    mockPrisma.forumCategory.findUnique.mockResolvedValue(sampleCategory);
    mockPrisma.forumThread.create.mockResolvedValue(sampleThread);
    await request(app)
      .post('/api/platform/forum/threads')
      .send({ title: 'Test', categoryId: 'cat-uuid-1' });
    const createArgs = mockPrisma.forumThread.create.mock.calls[0][0];
    expect(createArgs.data.authorId).toBe('platform-user-uuid-99');
  });

  it('creates thread for EDITOR too', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.forumCategory.findUnique.mockResolvedValue(sampleCategory);
    mockPrisma.forumThread.create.mockResolvedValue(sampleThread);
    const res = await request(app)
      .post('/api/platform/forum/threads')
      .send({ title: 'Test Thread', categoryId: 'cat-uuid-1' });
    expect(res.status).toBe(201);
  });

  it('creates thread for ADMIN too', async () => {
    const app = buildApp('ADMIN');
    mockPrisma.forumCategory.findUnique.mockResolvedValue(sampleCategory);
    mockPrisma.forumThread.create.mockResolvedValue(sampleThread);
    const res = await request(app)
      .post('/api/platform/forum/threads')
      .send({ title: 'Test Thread', categoryId: 'cat-uuid-1' });
    expect(res.status).toBe(201);
  });
});

// ─── PUT /threads/:id ─────────────────────────────────────────────────────────

describe('PUT /api/platform/forum/threads/:id', () => {
  const ownUserId = 1;
  const otherUserId = 99;
  const ownPlatformUserId = 'platform-user-uuid-1';
  const otherPlatformUserId = 'platform-user-uuid-99';

  const ownThread = { ...sampleThread, authorId: ownPlatformUserId };
  const otherThread = { ...sampleThread, id: 'thread-uuid-2', authorId: otherPlatformUserId };

  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app)
      .put('/api/platform/forum/threads/thread-uuid-1')
      .send({ title: 'Updated' });
    expect(res.status).toBe(401);
  });

  it('returns 404 when thread not found', async () => {
    const app = buildApp('VIEWER', ownUserId);
    mockPrisma.forumThread.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .put('/api/platform/forum/threads/nonexistent')
      .send({ title: 'Updated' });
    expect(res.status).toBe(404);
  });

  it('allows author to update their own thread title', async () => {
    const app = buildApp('VIEWER', ownUserId);
    mockPrisma.forumThread.findUnique.mockResolvedValue(ownThread);
    mockPrisma.forumThread.update.mockResolvedValue({ ...ownThread, title: 'Updated Title' });
    const res = await request(app)
      .put('/api/platform/forum/threads/thread-uuid-1')
      .send({ title: 'Updated Title' });
    expect(res.status).toBe(200);
    const updateArgs = mockPrisma.forumThread.update.mock.calls[0][0];
    expect(updateArgs.data).toHaveProperty('title', 'Updated Title');
  });

  it('returns 403 when non-owner tries to update thread title', async () => {
    const app = buildApp('VIEWER', ownUserId);
    mockPrisma.forumThread.findUnique.mockResolvedValue(otherThread);
    const res = await request(app)
      .put('/api/platform/forum/threads/thread-uuid-2')
      .send({ title: 'Sneaky update' });
    expect(res.status).toBe(403);
  });

  it('allows ADMIN to update pinned/locked fields', async () => {
    const app = buildApp('ADMIN', otherUserId);
    mockPrisma.forumThread.findUnique.mockResolvedValue(ownThread);
    mockPrisma.forumThread.update.mockResolvedValue({ ...ownThread, pinned: true });
    const res = await request(app)
      .put('/api/platform/forum/threads/thread-uuid-1')
      .send({ pinned: true });
    expect(res.status).toBe(200);
    const updateArgs = mockPrisma.forumThread.update.mock.calls[0][0];
    expect(updateArgs.data).toHaveProperty('pinned', true);
  });

  it('returns 403 when non-manager tries to update pinned', async () => {
    const app = buildApp('VIEWER', ownUserId);
    mockPrisma.forumThread.findUnique.mockResolvedValue(ownThread);
    const res = await request(app)
      .put('/api/platform/forum/threads/thread-uuid-1')
      .send({ pinned: true });
    expect(res.status).toBe(403);
  });

  it('allows EDITOR to pin/lock as manager-equivalent', async () => {
    const app = buildApp('EDITOR', otherUserId);
    mockPrisma.forumThread.findUnique.mockResolvedValue(ownThread);
    mockPrisma.forumThread.update.mockResolvedValue({ ...ownThread, locked: true });
    const res = await request(app)
      .put('/api/platform/forum/threads/thread-uuid-1')
      .send({ locked: true });
    expect(res.status).toBe(200);
  });
});

// ─── POST /threads/:threadId/posts ────────────────────────────────────────────

describe('POST /api/platform/forum/threads/:threadId/posts', () => {
  const lockedThread = { ...sampleThread, locked: true };
  const unlockedThread = { ...sampleThread, locked: false };

  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app)
      .post('/api/platform/forum/threads/thread-uuid-1/posts')
      .send({ body: 'Hello!' });
    expect(res.status).toBe(401);
  });

  it('returns 404 when thread not found', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.forumThread.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/platform/forum/threads/nonexistent/posts')
      .send({ body: 'Hello!' });
    expect(res.status).toBe(404);
  });

  it('returns 400 when body is missing', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.forumThread.findUnique.mockResolvedValue(unlockedThread);
    const res = await request(app)
      .post('/api/platform/forum/threads/thread-uuid-1/posts')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/body/i);
  });

  it('creates a post in an unlocked thread', async () => {
    const app = buildApp('VIEWER', 1);
    mockPrisma.forumThread.findUnique.mockResolvedValue(unlockedThread);
    mockPrisma.forumPost.create.mockResolvedValue(samplePost);
    const res = await request(app)
      .post('/api/platform/forum/threads/thread-uuid-1/posts')
      .send({ body: 'Hello world!' });
    expect(res.status).toBe(201);
    const createArgs = mockPrisma.forumPost.create.mock.calls[0][0];
    expect(createArgs.data.body).toBe('Hello world!');
    expect(createArgs.data.threadId).toBe('thread-uuid-1');
  });

  it('returns 403 when VIEWER tries to post in locked thread', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.forumThread.findUnique.mockResolvedValue(lockedThread);
    const res = await request(app)
      .post('/api/platform/forum/threads/thread-uuid-1/posts')
      .send({ body: 'Hello!' });
    expect(res.status).toBe(403);
  });

  it('allows EDITOR to post in locked thread', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.forumThread.findUnique.mockResolvedValue(lockedThread);
    mockPrisma.forumPost.create.mockResolvedValue(samplePost);
    const res = await request(app)
      .post('/api/platform/forum/threads/thread-uuid-1/posts')
      .send({ body: 'Moderator message' });
    expect(res.status).toBe(201);
  });

  it('allows ADMIN to post in locked thread', async () => {
    const app = buildApp('ADMIN');
    mockPrisma.forumThread.findUnique.mockResolvedValue(lockedThread);
    mockPrisma.forumPost.create.mockResolvedValue(samplePost);
    const res = await request(app)
      .post('/api/platform/forum/threads/thread-uuid-1/posts')
      .send({ body: 'Admin message' });
    expect(res.status).toBe(201);
  });

  it('sets authorId from platform user id', async () => {
    const app = buildApp('VIEWER', 55, 'platform-user-uuid-55');
    mockPrisma.forumThread.findUnique.mockResolvedValue(unlockedThread);
    mockPrisma.forumPost.create.mockResolvedValue(samplePost);
    await request(app)
      .post('/api/platform/forum/threads/thread-uuid-1/posts')
      .send({ body: 'Hello!' });
    const createArgs = mockPrisma.forumPost.create.mock.calls[0][0];
    expect(createArgs.data.authorId).toBe('platform-user-uuid-55');
  });
});

// ─── PUT /posts/:id ───────────────────────────────────────────────────────────

describe('PUT /api/platform/forum/posts/:id', () => {
  const ownUserId = 1;

  const ownPlatformUserId = 'platform-user-uuid-1';
  const otherPlatformUserId = 'platform-user-uuid-99';

  const ownPost = { ...samplePost, authorId: ownPlatformUserId };
  const otherPost = { ...samplePost, id: 'post-uuid-2', authorId: otherPlatformUserId };

  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app)
      .put('/api/platform/forum/posts/post-uuid-1')
      .send({ body: 'Updated body' });
    expect(res.status).toBe(401);
  });

  it('returns 404 when post not found', async () => {
    const app = buildApp('VIEWER', ownUserId);
    mockPrisma.forumPost.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .put('/api/platform/forum/posts/nonexistent')
      .send({ body: 'Updated body' });
    expect(res.status).toBe(404);
  });

  it('returns 400 when body is missing', async () => {
    const app = buildApp('VIEWER', ownUserId);
    mockPrisma.forumPost.findUnique.mockResolvedValue(ownPost);
    const res = await request(app)
      .put('/api/platform/forum/posts/post-uuid-1')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/body/i);
  });

  it('allows author to update their own post', async () => {
    const app = buildApp('VIEWER', ownUserId);
    mockPrisma.forumPost.findUnique.mockResolvedValue(ownPost);
    mockPrisma.forumPost.update.mockResolvedValue({ ...ownPost, body: 'Updated body' });
    const res = await request(app)
      .put('/api/platform/forum/posts/post-uuid-1')
      .send({ body: 'Updated body' });
    expect(res.status).toBe(200);
    const updateArgs = mockPrisma.forumPost.update.mock.calls[0][0];
    expect(updateArgs.data).toHaveProperty('body', 'Updated body');
  });

  it('returns 403 when non-owner tries to update post', async () => {
    const app = buildApp('VIEWER', ownUserId);
    mockPrisma.forumPost.findUnique.mockResolvedValue(otherPost);
    const res = await request(app)
      .put('/api/platform/forum/posts/post-uuid-2')
      .send({ body: 'Sneaky edit' });
    expect(res.status).toBe(403);
  });

  it('returns 403 even for EDITOR on non-owned post', async () => {
    const app = buildApp('EDITOR', ownUserId);
    mockPrisma.forumPost.findUnique.mockResolvedValue(otherPost);
    const res = await request(app)
      .put('/api/platform/forum/posts/post-uuid-2')
      .send({ body: 'Editor update' });
    expect(res.status).toBe(403);
  });
});

// ─── DELETE /posts/:id ────────────────────────────────────────────────────────

describe('DELETE /api/platform/forum/posts/:id', () => {
  const ownUserId = 1;

  const ownPlatformUserId = 'platform-user-uuid-1';
  const otherPlatformUserId = 'platform-user-uuid-99';

  const ownPost = { ...samplePost, authorId: ownPlatformUserId };
  const otherPost = { ...samplePost, id: 'post-uuid-2', authorId: otherPlatformUserId };

  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).delete('/api/platform/forum/posts/post-uuid-1');
    expect(res.status).toBe(401);
  });

  it('returns 404 when post not found', async () => {
    const app = buildApp('VIEWER', ownUserId);
    mockPrisma.forumPost.findUnique.mockResolvedValue(null);
    const res = await request(app).delete('/api/platform/forum/posts/nonexistent');
    expect(res.status).toBe(404);
  });

  it('allows author to delete their own post', async () => {
    const app = buildApp('VIEWER', ownUserId);
    mockPrisma.forumPost.findUnique.mockResolvedValue(ownPost);
    mockPrisma.forumPost.delete.mockResolvedValue(ownPost);
    const res = await request(app).delete('/api/platform/forum/posts/post-uuid-1');
    expect(res.status).toBe(204);
    expect(mockPrisma.forumPost.delete).toHaveBeenCalledOnce();
    const deleteArgs = mockPrisma.forumPost.delete.mock.calls[0][0];
    expect(deleteArgs.where).toMatchObject({ id: 'post-uuid-1' });
  });

  it('returns 403 when non-owner VIEWER tries to delete post', async () => {
    const app = buildApp('VIEWER', ownUserId);
    mockPrisma.forumPost.findUnique.mockResolvedValue(otherPost);
    const res = await request(app).delete('/api/platform/forum/posts/post-uuid-2');
    expect(res.status).toBe(403);
  });

  it('allows EDITOR to delete any post (moderator)', async () => {
    const app = buildApp('EDITOR', ownUserId);
    mockPrisma.forumPost.findUnique.mockResolvedValue(otherPost);
    mockPrisma.forumPost.delete.mockResolvedValue(otherPost);
    const res = await request(app).delete('/api/platform/forum/posts/post-uuid-2');
    expect(res.status).toBe(204);
  });

  it('allows ADMIN to delete any post', async () => {
    const app = buildApp('ADMIN', ownUserId);
    mockPrisma.forumPost.findUnique.mockResolvedValue(otherPost);
    mockPrisma.forumPost.delete.mockResolvedValue(otherPost);
    const res = await request(app).delete('/api/platform/forum/posts/post-uuid-2');
    expect(res.status).toBe(204);
  });
});
