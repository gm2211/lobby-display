/**
 * Unit tests for createPlatformCrudRoutes factory.
 *
 * Tests cover:
 * - UUID primary keys (string IDs, not integer)
 * - Cursor-based pagination (?cursor=<uuid>&limit=N)
 * - Platform role authorization (configurable per-operation roles)
 * - Soft-delete via markedForDeletion
 * - Building/workspace scoping (?buildingId=<uuid>)
 * - GET / — list with cursor pagination + filters
 * - GET /:id — detail
 * - POST / — create
 * - PUT /:id — update
 * - DELETE /:id — soft delete
 *
 * Uses vi.mock to mock Prisma — no database needed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { errorHandler } from '../../server/middleware/errorHandler.js';

// Mock prisma before importing the factory
vi.mock('../../server/db.js', () => ({
  default: {
    announcement: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock express-session
vi.mock('express-session', () => ({
  default: () => (req: any, _res: any, next: any) => {
    req.session = (req as any).__mockSession || {};
    next();
  },
}));

import prisma from '../../server/db.js';
import { createPlatformCrudRoutes } from '../../server/utils/createPlatformCrudRoutes.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------
const adminUser = { id: 1, username: 'admin', role: 'ADMIN' as const };
const editorUser = { id: 2, username: 'editor', role: 'EDITOR' as const };
const viewerUser = { id: 3, username: 'viewer', role: 'VIEWER' as const };

const uuid1 = '11111111-1111-1111-1111-111111111111';
const uuid2 = '22222222-2222-2222-2222-222222222222';
const uuid3 = '33333333-3333-3333-3333-333333333333';
const buildingUuid = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const sampleAnnouncement = {
  id: uuid1,
  title: 'Hello World',
  body: 'Test announcement',
  buildingId: buildingUuid,
  markedForDeletion: false,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

// ---------------------------------------------------------------------------
// Helper to build test app
// ---------------------------------------------------------------------------
function buildApp(sessionUser?: { id: number; username: string; role: string }) {
  const app = express();
  app.use(express.json());

  // Inject mock session
  app.use((req: any, _res: any, next: any) => {
    req.session = { user: sessionUser };
    next();
  });

  const router = createPlatformCrudRoutes({
    model: 'announcement',
    orderBy: { createdAt: 'desc' },
  });

  app.use('/api/platform/announcements', router);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// GET / — list
// ---------------------------------------------------------------------------
describe('GET / — list', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(undefined);
    const res = await request(app).get('/api/platform/announcements');
    expect(res.status).toBe(401);
  });

  it('returns list for authenticated VIEWER', async () => {
    vi.mocked(prisma.announcement.findMany).mockResolvedValue([sampleAnnouncement] as any);

    const app = buildApp(viewerUser);
    const res = await request(app).get('/api/platform/announcements');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('items');
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].id).toBe(uuid1);
  });

  it('returns cursor-based pagination metadata', async () => {
    vi.mocked(prisma.announcement.findMany).mockResolvedValue([sampleAnnouncement] as any);

    const app = buildApp(viewerUser);
    const res = await request(app).get('/api/platform/announcements?limit=1');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('nextCursor');
    expect(res.body).toHaveProperty('items');
  });

  it('uses cursor when provided', async () => {
    vi.mocked(prisma.announcement.findMany).mockResolvedValue([sampleAnnouncement] as any);

    const app = buildApp(viewerUser);
    await request(app).get(`/api/platform/announcements?cursor=${uuid2}&limit=10`);

    expect(vi.mocked(prisma.announcement.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { id: uuid2 },
        skip: 1,
      })
    );
  });

  it('defaults limit to 20', async () => {
    vi.mocked(prisma.announcement.findMany).mockResolvedValue([] as any);

    const app = buildApp(viewerUser);
    await request(app).get('/api/platform/announcements');

    expect(vi.mocked(prisma.announcement.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({ take: 21 })  // fetch N+1 to determine hasMore
    );
  });

  it('filters by buildingId when provided', async () => {
    vi.mocked(prisma.announcement.findMany).mockResolvedValue([] as any);

    const app = buildApp(viewerUser);
    await request(app).get(`/api/platform/announcements?buildingId=${buildingUuid}`);

    expect(vi.mocked(prisma.announcement.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ buildingId: buildingUuid }),
      })
    );
  });

  it('sets nextCursor to null when no more pages', async () => {
    vi.mocked(prisma.announcement.findMany).mockResolvedValue([sampleAnnouncement] as any);

    const app = buildApp(viewerUser);
    const res = await request(app).get('/api/platform/announcements?limit=20');

    expect(res.status).toBe(200);
    // If fewer items returned than limit, nextCursor should be null
    expect(res.body.nextCursor).toBeNull();
  });

  it('sets nextCursor to last item id when more pages exist', async () => {
    // Return limit+1 items to signal more pages
    const items = Array.from({ length: 21 }, (_, i) => ({
      ...sampleAnnouncement,
      id: `${i.toString().padStart(8, '0')}-0000-0000-0000-000000000000`,
    }));
    vi.mocked(prisma.announcement.findMany).mockResolvedValue(items as any);

    const app = buildApp(viewerUser);
    const res = await request(app).get('/api/platform/announcements?limit=20');

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(20);  // only return limit items
    expect(res.body.nextCursor).toBeDefined();
    expect(res.body.nextCursor).not.toBeNull();
  });

  it('excludes markedForDeletion items by default', async () => {
    vi.mocked(prisma.announcement.findMany).mockResolvedValue([] as any);

    const app = buildApp(viewerUser);
    await request(app).get('/api/platform/announcements');

    expect(vi.mocked(prisma.announcement.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ markedForDeletion: false }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// GET /:id — detail
// ---------------------------------------------------------------------------
describe('GET /:id — detail', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(undefined);
    const res = await request(app).get(`/api/platform/announcements/${uuid1}`);
    expect(res.status).toBe(401);
  });

  it('returns item for VIEWER', async () => {
    vi.mocked(prisma.announcement.findUnique).mockResolvedValue(sampleAnnouncement as any);

    const app = buildApp(viewerUser);
    const res = await request(app).get(`/api/platform/announcements/${uuid1}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(uuid1);
    expect(res.body.title).toBe('Hello World');
  });

  it('returns 404 when item not found', async () => {
    vi.mocked(prisma.announcement.findUnique).mockResolvedValue(null);

    const app = buildApp(viewerUser);
    const res = await request(app).get(`/api/platform/announcements/${uuid1}`);

    expect(res.status).toBe(404);
  });

  it('accepts UUID string ids (not integer)', async () => {
    vi.mocked(prisma.announcement.findUnique).mockResolvedValue(sampleAnnouncement as any);

    const app = buildApp(viewerUser);
    await request(app).get(`/api/platform/announcements/${uuid1}`);

    expect(vi.mocked(prisma.announcement.findUnique)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: uuid1 },  // string UUID, not parsed integer
      })
    );
  });
});

// ---------------------------------------------------------------------------
// POST / — create
// ---------------------------------------------------------------------------
describe('POST / — create', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(undefined);
    const res = await request(app).post('/api/platform/announcements').send({ title: 'New' });
    expect(res.status).toBe(401);
  });

  it('returns 403 when VIEWER tries to create', async () => {
    const app = buildApp(viewerUser);
    const res = await request(app).post('/api/platform/announcements').send({ title: 'New' });
    expect(res.status).toBe(403);
  });

  it('creates item for EDITOR', async () => {
    const newItem = { ...sampleAnnouncement, id: uuid2, title: 'New Announcement' };
    vi.mocked(prisma.announcement.create).mockResolvedValue(newItem as any);

    const app = buildApp(editorUser);
    const res = await request(app)
      .post('/api/platform/announcements')
      .send({ title: 'New Announcement', body: 'Content' });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('New Announcement');
  });

  it('creates item for ADMIN', async () => {
    const newItem = { ...sampleAnnouncement, id: uuid3 };
    vi.mocked(prisma.announcement.create).mockResolvedValue(newItem as any);

    const app = buildApp(adminUser);
    const res = await request(app)
      .post('/api/platform/announcements')
      .send({ title: 'Admin Post', body: 'Content' });

    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// PUT /:id — update
// ---------------------------------------------------------------------------
describe('PUT /:id — update', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(undefined);
    const res = await request(app).put(`/api/platform/announcements/${uuid1}`).send({ title: 'Updated' });
    expect(res.status).toBe(401);
  });

  it('returns 403 when VIEWER tries to update', async () => {
    const app = buildApp(viewerUser);
    const res = await request(app).put(`/api/platform/announcements/${uuid1}`).send({ title: 'Updated' });
    expect(res.status).toBe(403);
  });

  it('updates item for EDITOR', async () => {
    const updated = { ...sampleAnnouncement, title: 'Updated Title' };
    vi.mocked(prisma.announcement.update).mockResolvedValue(updated as any);

    const app = buildApp(editorUser);
    const res = await request(app)
      .put(`/api/platform/announcements/${uuid1}`)
      .send({ title: 'Updated Title' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated Title');
    expect(vi.mocked(prisma.announcement.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: uuid1 },
      })
    );
  });

  it('uses UUID string id in where clause (not integer)', async () => {
    vi.mocked(prisma.announcement.update).mockResolvedValue(sampleAnnouncement as any);

    const app = buildApp(editorUser);
    await request(app)
      .put(`/api/platform/announcements/${uuid1}`)
      .send({ title: 'Updated' });

    expect(vi.mocked(prisma.announcement.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: uuid1 },  // string, not integer
      })
    );
  });
});

// ---------------------------------------------------------------------------
// DELETE /:id — soft delete
// ---------------------------------------------------------------------------
describe('DELETE /:id — soft delete', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(undefined);
    const res = await request(app).delete(`/api/platform/announcements/${uuid1}`);
    expect(res.status).toBe(401);
  });

  it('returns 403 when VIEWER tries to delete', async () => {
    const app = buildApp(viewerUser);
    const res = await request(app).delete(`/api/platform/announcements/${uuid1}`);
    expect(res.status).toBe(403);
  });

  it('soft-deletes item for EDITOR (sets markedForDeletion: true)', async () => {
    vi.mocked(prisma.announcement.update).mockResolvedValue({
      ...sampleAnnouncement,
      markedForDeletion: true,
    } as any);

    const app = buildApp(editorUser);
    const res = await request(app).delete(`/api/platform/announcements/${uuid1}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(vi.mocked(prisma.announcement.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: uuid1 },
        data: { markedForDeletion: true },
      })
    );
  });

  it('does NOT hard delete (update called, not delete)', async () => {
    vi.mocked(prisma.announcement.update).mockResolvedValue({
      ...sampleAnnouncement,
      markedForDeletion: true,
    } as any);

    const app = buildApp(editorUser);
    await request(app).delete(`/api/platform/announcements/${uuid1}`);

    // update must be called (soft delete), not a hard delete
    expect(vi.mocked(prisma.announcement.update)).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Custom write role configuration
// ---------------------------------------------------------------------------
describe('Custom write role configuration', () => {
  it('allows configuring writeRole to restrict mutations', async () => {
    const app = express();
    app.use(express.json());

    app.use((req: any, _res: any, next: any) => {
      req.session = { user: editorUser };
      next();
    });

    // Configure with writeRole: 'ADMIN' — editors cannot mutate
    const router = createPlatformCrudRoutes({
      model: 'announcement',
      writeRole: 'ADMIN',
    });

    app.use('/api/test', router);
    app.use(errorHandler);

    const res = await request(app)
      .post('/api/test')
      .send({ title: 'Test' });

    expect(res.status).toBe(403);  // EDITOR blocked when writeRole=ADMIN
  });

  it('allows ADMIN when writeRole is ADMIN', async () => {
    vi.mocked(prisma.announcement.create).mockResolvedValue(sampleAnnouncement as any);

    const app = express();
    app.use(express.json());

    app.use((req: any, _res: any, next: any) => {
      req.session = { user: adminUser };
      next();
    });

    const router = createPlatformCrudRoutes({
      model: 'announcement',
      writeRole: 'ADMIN',
    });

    app.use('/api/test', router);
    app.use(errorHandler);

    const res = await request(app)
      .post('/api/test')
      .send({ title: 'Admin Only Post' });

    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// Transform hooks
// ---------------------------------------------------------------------------
describe('Transform hooks', () => {
  it('applies transformCreate before saving', async () => {
    vi.mocked(prisma.announcement.create).mockResolvedValue(sampleAnnouncement as any);

    const app = express();
    app.use(express.json());
    app.use((req: any, _res: any, next: any) => {
      req.session = { user: editorUser };
      next();
    });

    const router = createPlatformCrudRoutes({
      model: 'announcement',
      transformCreate: (data) => ({ ...data, title: (data.title as string).toUpperCase() }),
    });

    app.use('/api/test', router);
    app.use(errorHandler);

    await request(app).post('/api/test').send({ title: 'hello' });

    expect(vi.mocked(prisma.announcement.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: 'HELLO' }),
      })
    );
  });

  it('applies transformGet after fetching', async () => {
    vi.mocked(prisma.announcement.findMany).mockResolvedValue([sampleAnnouncement] as any);

    const app = express();
    app.use(express.json());
    app.use((req: any, _res: any, next: any) => {
      req.session = { user: viewerUser };
      next();
    });

    const router = createPlatformCrudRoutes({
      model: 'announcement',
      transformGet: (item: any) => ({ ...item, _transformed: true }),
    });

    app.use('/api/test', router);
    app.use(errorHandler);

    const res = await request(app).get('/api/test');

    expect(res.status).toBe(200);
    expect(res.body.items[0]._transformed).toBe(true);
  });
});
