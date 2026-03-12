/**
 * Unit tests for maintenance request CRUD API routes.
 *
 * Uses vi.mock to mock Prisma so no database is needed.
 * Tests cover: list with filters, detail, create, update (with status workflow),
 * add comment, add photo, and auth/authorization checks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import { errorHandler } from '../../server/middleware/errorHandler.js';

// Mock Prisma module before importing routes
vi.mock('../../server/db.js', () => ({
  default: {
    maintenanceRequest: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    maintenanceComment: {
      create: vi.fn(),
    },
    maintenancePhoto: {
      create: vi.fn(),
    },
  },
}));

import prisma from '../../server/db.js';
import maintenanceRouter from '../../server/routes/platform/maintenance.js';

// Type helpers for mocked functions
const mockPrisma = prisma as {
  maintenanceRequest: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  maintenanceComment: {
    create: ReturnType<typeof vi.fn>;
  };
  maintenancePhoto: {
    create: ReturnType<typeof vi.fn>;
  };
};

/** Build a minimal Express app for testing. Sets a session user based on role. */
function buildApp(role: 'ADMIN' | 'EDITOR' | 'VIEWER' | null = 'ADMIN') {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: 'test-secret',
      resave: false,
      saveUninitialized: true,
    })
  );

  // Inject a session user for testing
  if (role !== null) {
    app.use((_req, res, next) => {
      (_req as any).session.user = { id: 1, username: 'testuser', role };
      next();
    });
  }

  app.use('/api/maintenance', maintenanceRouter);
  app.use(errorHandler);
  return app;
}

/** Example maintenance request returned by Prisma */
const exampleRequest = {
  id: 1,
  title: 'Leaky faucet',
  description: 'Bathroom faucet drips constantly',
  status: 'OPEN',
  category: 'PLUMBING',
  unitNumber: '4B',
  assigneeId: null,
  createdById: 1,
  createdAt: new Date('2024-01-01').toISOString(),
  updatedAt: new Date('2024-01-01').toISOString(),
  comments: [],
  photos: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── GET / ───────────────────────────────────────────────────────────────────

describe('GET /api/maintenance', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).get('/api/maintenance');
    expect(res.status).toBe(401);
  });

  it('returns list of maintenance requests', async () => {
    mockPrisma.maintenanceRequest.findMany.mockResolvedValue([exampleRequest]);
    const app = buildApp('VIEWER');
    const res = await request(app).get('/api/maintenance');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('Leaky faucet');
  });

  it('filters by status query param', async () => {
    mockPrisma.maintenanceRequest.findMany.mockResolvedValue([]);
    const app = buildApp('EDITOR');
    await request(app).get('/api/maintenance?status=OPEN');
    expect(mockPrisma.maintenanceRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'OPEN' }),
      })
    );
  });

  it('filters by category query param', async () => {
    mockPrisma.maintenanceRequest.findMany.mockResolvedValue([]);
    const app = buildApp('EDITOR');
    await request(app).get('/api/maintenance?category=PLUMBING');
    expect(mockPrisma.maintenanceRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ category: 'PLUMBING' }),
      })
    );
  });

  it('filters by assignee query param', async () => {
    mockPrisma.maintenanceRequest.findMany.mockResolvedValue([]);
    const app = buildApp('EDITOR');
    await request(app).get('/api/maintenance?assigneeId=2');
    expect(mockPrisma.maintenanceRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ assigneeId: 2 }),
      })
    );
  });

  it('returns empty array when no requests exist', async () => {
    mockPrisma.maintenanceRequest.findMany.mockResolvedValue([]);
    const app = buildApp('VIEWER');
    const res = await request(app).get('/api/maintenance');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────

describe('GET /api/maintenance/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).get('/api/maintenance/1');
    expect(res.status).toBe(401);
  });

  it('returns request detail with comments and photos', async () => {
    const detail = {
      ...exampleRequest,
      comments: [{ id: 1, body: 'On it', authorId: 1 }],
      photos: [{ id: 1, url: '/uploads/photo.jpg', uploadedById: 1 }],
    };
    mockPrisma.maintenanceRequest.findUnique.mockResolvedValue(detail);
    const app = buildApp('VIEWER');
    const res = await request(app).get('/api/maintenance/1');
    expect(res.status).toBe(200);
    expect(res.body.comments).toHaveLength(1);
    expect(res.body.photos).toHaveLength(1);
  });

  it('returns 404 when request not found', async () => {
    mockPrisma.maintenanceRequest.findUnique.mockResolvedValue(null);
    const app = buildApp('VIEWER');
    const res = await request(app).get('/api/maintenance/999');
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid id', async () => {
    const app = buildApp('VIEWER');
    const res = await request(app).get('/api/maintenance/abc');
    expect(res.status).toBe(400);
  });

  it('includes comments and photos in the Prisma query', async () => {
    mockPrisma.maintenanceRequest.findUnique.mockResolvedValue(exampleRequest);
    const app = buildApp('VIEWER');
    await request(app).get('/api/maintenance/1');
    expect(mockPrisma.maintenanceRequest.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          comments: expect.anything(),
          photos: expect.anything(),
        }),
      })
    );
  });
});

// ─── POST / ──────────────────────────────────────────────────────────────────

describe('POST /api/maintenance', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).post('/api/maintenance').send({ title: 'Test', description: 'Desc' });
    expect(res.status).toBe(401);
  });

  it('creates a maintenance request as any authenticated user (VIEWER)', async () => {
    mockPrisma.maintenanceRequest.create.mockResolvedValue({ ...exampleRequest, id: 2 });
    const app = buildApp('VIEWER');
    const res = await request(app)
      .post('/api/maintenance')
      .send({ title: 'New request', description: 'Description here', unitNumber: '3A' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
  });

  it('returns 400 when title is missing', async () => {
    const app = buildApp('VIEWER');
    const res = await request(app).post('/api/maintenance').send({ description: 'No title' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when description is missing', async () => {
    const app = buildApp('VIEWER');
    const res = await request(app).post('/api/maintenance').send({ title: 'No description' });
    expect(res.status).toBe(400);
  });

  it('associates createdById with the session user', async () => {
    mockPrisma.maintenanceRequest.create.mockResolvedValue({ ...exampleRequest });
    const app = buildApp('EDITOR');
    await request(app).post('/api/maintenance').send({ title: 'Test', description: 'Desc' });
    expect(mockPrisma.maintenanceRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ createdById: 1 }),
      })
    );
  });
});

// ─── PUT /:id ─────────────────────────────────────────────────────────────────

describe('PUT /api/maintenance/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).put('/api/maintenance/1').send({ status: 'IN_PROGRESS' });
    expect(res.status).toBe(401);
  });

  it('returns 403 when VIEWER tries to update', async () => {
    const app = buildApp('VIEWER');
    const res = await request(app).put('/api/maintenance/1').send({ status: 'IN_PROGRESS' });
    expect(res.status).toBe(403);
  });

  it('allows EDITOR to update status', async () => {
    mockPrisma.maintenanceRequest.findUnique.mockResolvedValue(exampleRequest);
    mockPrisma.maintenanceRequest.update.mockResolvedValue({ ...exampleRequest, status: 'IN_PROGRESS' });
    const app = buildApp('EDITOR');
    const res = await request(app).put('/api/maintenance/1').send({ status: 'IN_PROGRESS' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('IN_PROGRESS');
  });

  it('allows ADMIN to assign a request', async () => {
    mockPrisma.maintenanceRequest.findUnique.mockResolvedValue(exampleRequest);
    mockPrisma.maintenanceRequest.update.mockResolvedValue({ ...exampleRequest, assigneeId: 2 });
    const app = buildApp('ADMIN');
    const res = await request(app).put('/api/maintenance/1').send({ assigneeId: 2 });
    expect(res.status).toBe(200);
    expect(res.body.assigneeId).toBe(2);
  });

  it('returns 404 when request not found', async () => {
    mockPrisma.maintenanceRequest.findUnique.mockResolvedValue(null);
    const app = buildApp('EDITOR');
    const res = await request(app).put('/api/maintenance/999').send({ status: 'IN_PROGRESS' });
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid status transition (CLOSED → OPEN)', async () => {
    mockPrisma.maintenanceRequest.findUnique.mockResolvedValue({ ...exampleRequest, status: 'CLOSED' });
    const app = buildApp('EDITOR');
    const res = await request(app).put('/api/maintenance/1').send({ status: 'OPEN' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid status transition (RESOLVED → OPEN)', async () => {
    mockPrisma.maintenanceRequest.findUnique.mockResolvedValue({ ...exampleRequest, status: 'RESOLVED' });
    const app = buildApp('EDITOR');
    const res = await request(app).put('/api/maintenance/1').send({ status: 'OPEN' });
    expect(res.status).toBe(400);
  });

  it('allows valid status transition: OPEN → IN_PROGRESS', async () => {
    mockPrisma.maintenanceRequest.findUnique.mockResolvedValue({ ...exampleRequest, status: 'OPEN' });
    mockPrisma.maintenanceRequest.update.mockResolvedValue({ ...exampleRequest, status: 'IN_PROGRESS' });
    const app = buildApp('EDITOR');
    const res = await request(app).put('/api/maintenance/1').send({ status: 'IN_PROGRESS' });
    expect(res.status).toBe(200);
  });

  it('allows valid status transition: IN_PROGRESS → RESOLVED', async () => {
    mockPrisma.maintenanceRequest.findUnique.mockResolvedValue({ ...exampleRequest, status: 'IN_PROGRESS' });
    mockPrisma.maintenanceRequest.update.mockResolvedValue({ ...exampleRequest, status: 'RESOLVED' });
    const app = buildApp('EDITOR');
    const res = await request(app).put('/api/maintenance/1').send({ status: 'RESOLVED' });
    expect(res.status).toBe(200);
  });

  it('allows valid status transition: RESOLVED → CLOSED', async () => {
    mockPrisma.maintenanceRequest.findUnique.mockResolvedValue({ ...exampleRequest, status: 'RESOLVED' });
    mockPrisma.maintenanceRequest.update.mockResolvedValue({ ...exampleRequest, status: 'CLOSED' });
    const app = buildApp('EDITOR');
    const res = await request(app).put('/api/maintenance/1').send({ status: 'CLOSED' });
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid id', async () => {
    const app = buildApp('EDITOR');
    const res = await request(app).put('/api/maintenance/xyz').send({ status: 'IN_PROGRESS' });
    expect(res.status).toBe(400);
  });
});

// ─── POST /:id/comments ────────────────────────────────────────────────────

describe('POST /api/maintenance/:id/comments', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).post('/api/maintenance/1/comments').send({ body: 'Fix in progress' });
    expect(res.status).toBe(401);
  });

  it('allows any authenticated user (VIEWER) to add a comment', async () => {
    mockPrisma.maintenanceRequest.findUnique.mockResolvedValue(exampleRequest);
    mockPrisma.maintenanceComment.create.mockResolvedValue({
      id: 1,
      requestId: 1,
      authorId: 1,
      body: 'Fix in progress',
      createdAt: new Date().toISOString(),
    });
    const app = buildApp('VIEWER');
    const res = await request(app).post('/api/maintenance/1/comments').send({ body: 'Fix in progress' });
    expect(res.status).toBe(201);
    expect(res.body.body).toBe('Fix in progress');
  });

  it('returns 400 when body is missing', async () => {
    mockPrisma.maintenanceRequest.findUnique.mockResolvedValue(exampleRequest);
    const app = buildApp('VIEWER');
    const res = await request(app).post('/api/maintenance/1/comments').send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 when request not found', async () => {
    mockPrisma.maintenanceRequest.findUnique.mockResolvedValue(null);
    const app = buildApp('VIEWER');
    const res = await request(app).post('/api/maintenance/999/comments').send({ body: 'Test' });
    expect(res.status).toBe(404);
  });

  it('associates comment with session user as authorId', async () => {
    mockPrisma.maintenanceRequest.findUnique.mockResolvedValue(exampleRequest);
    mockPrisma.maintenanceComment.create.mockResolvedValue({
      id: 1,
      requestId: 1,
      authorId: 1,
      body: 'Test',
      createdAt: new Date().toISOString(),
    });
    const app = buildApp('VIEWER');
    await request(app).post('/api/maintenance/1/comments').send({ body: 'Test' });
    expect(mockPrisma.maintenanceComment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ authorId: 1, requestId: 1 }),
      })
    );
  });
});

// ─── POST /:id/photos ──────────────────────────────────────────────────────

describe('POST /api/maintenance/:id/photos', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).post('/api/maintenance/1/photos').send({ url: '/uploads/img.jpg' });
    expect(res.status).toBe(401);
  });

  it('allows any authenticated user (VIEWER) to add a photo', async () => {
    mockPrisma.maintenanceRequest.findUnique.mockResolvedValue(exampleRequest);
    mockPrisma.maintenancePhoto.create.mockResolvedValue({
      id: 1,
      requestId: 1,
      uploadedById: 1,
      url: '/uploads/img.jpg',
      createdAt: new Date().toISOString(),
    });
    const app = buildApp('VIEWER');
    const res = await request(app)
      .post('/api/maintenance/1/photos')
      .send({ url: '/uploads/img.jpg' });
    expect(res.status).toBe(201);
    expect(res.body.url).toBe('/uploads/img.jpg');
  });

  it('returns 400 when url is missing', async () => {
    mockPrisma.maintenanceRequest.findUnique.mockResolvedValue(exampleRequest);
    const app = buildApp('VIEWER');
    const res = await request(app).post('/api/maintenance/1/photos').send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 when request not found', async () => {
    mockPrisma.maintenanceRequest.findUnique.mockResolvedValue(null);
    const app = buildApp('VIEWER');
    const res = await request(app).post('/api/maintenance/999/photos').send({ url: '/img.jpg' });
    expect(res.status).toBe(404);
  });

  it('associates photo with session user as uploadedById', async () => {
    mockPrisma.maintenanceRequest.findUnique.mockResolvedValue(exampleRequest);
    mockPrisma.maintenancePhoto.create.mockResolvedValue({
      id: 1,
      requestId: 1,
      uploadedById: 1,
      url: '/uploads/img.jpg',
      createdAt: new Date().toISOString(),
    });
    const app = buildApp('EDITOR');
    await request(app).post('/api/maintenance/1/photos').send({ url: '/uploads/img.jpg' });
    expect(mockPrisma.maintenancePhoto.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ uploadedById: 1, requestId: 1 }),
      })
    );
  });
});
