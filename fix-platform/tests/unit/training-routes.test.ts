/**
 * Unit tests for Training Resources API routes.
 *
 * Uses vi.mock to mock Prisma so no database is needed.
 * Tests cover all routes:
 *  - GET /  - list resources with completions count (any auth), ?active=true filter
 *  - GET /:id/completions - list completions (EDITOR+ required)
 *  - GET /:id - detail with completions (any auth)
 *  - POST / - create resource (EDITOR+ required)
 *  - PUT /:id - update resource (EDITOR+ required)
 *  - DELETE /:id - delete resource (EDITOR+ required, cascade)
 *  - POST /:id/complete - mark as complete for current user (any auth, upsert)
 *
 * Auth model:
 *  - GET routes require auth (any role: VIEWER, EDITOR, ADMIN)
 *  - Mutations (POST/PUT/DELETE) require EDITOR+
 *  - POST /:id/complete requires any authenticated user
 *  - GET /:id/completions requires EDITOR+
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { errorHandler } from '../../server/middleware/errorHandler.js';

// Mock Prisma before importing routes
vi.mock('../../server/db.js', () => ({
  default: {
    trainingResource: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    trainingCompletion: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    platformUser: {
      findUnique: vi.fn(),
    },
  },
}));

import prisma from '../../server/db.js';
import trainingRouter from '../../server/routes/platform/training.js';

/** Build a minimal Express app for testing. Injects session user based on role. */
function buildApp(sessionUser?: { id: string | number; username: string; role: string }) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.session = { user: sessionUser };
    next();
  });

  // Mock platformUser lookup for platformProtectStrict
  const mockPlatformUser = (prisma as any).platformUser.findUnique;
  if (sessionUser) {
    mockPlatformUser.mockResolvedValue({
      id: `platform-${sessionUser.id}`,
      userId: sessionUser.id,
      role: 'RESIDENT',
      active: true,
    });
  } else {
    mockPlatformUser.mockResolvedValue(null);
  }

  app.use('/api/platform/training', trainingRouter);
  app.use(errorHandler);
  return app;
}

const adminUser = { id: 'admin-uuid-1', username: 'admin', role: 'ADMIN' as const };
const editorUser = { id: 'editor-uuid-2', username: 'editor', role: 'EDITOR' as const };
const viewerUser = { id: 'viewer-uuid-3', username: 'viewer', role: 'VIEWER' as const };

const sampleResource = {
  id: 'resource-uuid-1',
  title: 'Fire Safety Training',
  description: 'Learn fire safety procedures',
  contentType: 'VIDEO',
  contentUrl: 'https://example.com/video',
  uploadId: null,
  requiredForRoles: ['RESIDENT'],
  dueDate: null,
  sortOrder: 0,
  active: true,
  createdAt: new Date('2025-01-01').toISOString(),
  updatedAt: new Date('2025-01-01').toISOString(),
  _count: { completions: 0 },
};

const sampleResourceWithCompletions = {
  ...sampleResource,
  completions: [],
  _count: { completions: 0 },
};

const sampleCompletion = {
  id: 'completion-uuid-1',
  resourceId: 'resource-uuid-1',
  userId: 'viewer-uuid-3',
  completedAt: new Date('2025-06-01').toISOString(),
  user: { id: 'viewer-uuid-3', unitNumber: '4B', role: 'RESIDENT' },
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// GET /api/platform/training
// ---------------------------------------------------------------------------

describe('GET /api/platform/training', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(undefined);
    const res = await request(app).get('/api/platform/training');
    expect(res.status).toBe(401);
  });

  it('returns list of training resources for VIEWER', async () => {
    const mockFindMany = vi.mocked(prisma.trainingResource.findMany);
    mockFindMany.mockResolvedValue([sampleResource] as any);

    const app = buildApp(viewerUser);
    const res = await request(app).get('/api/platform/training');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('Fire Safety Training');
  });

  it('returns list for EDITOR', async () => {
    const mockFindMany = vi.mocked(prisma.trainingResource.findMany);
    mockFindMany.mockResolvedValue([sampleResource] as any);

    const app = buildApp(editorUser);
    const res = await request(app).get('/api/platform/training');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns list for ADMIN', async () => {
    const mockFindMany = vi.mocked(prisma.trainingResource.findMany);
    mockFindMany.mockResolvedValue([sampleResource] as any);

    const app = buildApp(adminUser);
    const res = await request(app).get('/api/platform/training');
    expect(res.status).toBe(200);
  });

  it('filters by active=true when ?active=true is passed', async () => {
    const mockFindMany = vi.mocked(prisma.trainingResource.findMany);
    mockFindMany.mockResolvedValue([sampleResource] as any);

    const app = buildApp(viewerUser);
    const res = await request(app).get('/api/platform/training?active=true');

    expect(res.status).toBe(200);
    const callArgs = mockFindMany.mock.calls[0][0] as any;
    expect(callArgs.where).toMatchObject({ active: true });
  });

  it('does not filter by active when ?active is not passed', async () => {
    const mockFindMany = vi.mocked(prisma.trainingResource.findMany);
    mockFindMany.mockResolvedValue([sampleResource] as any);

    const app = buildApp(viewerUser);
    const res = await request(app).get('/api/platform/training');

    expect(res.status).toBe(200);
    const callArgs = mockFindMany.mock.calls[0][0] as any;
    expect(callArgs.where).not.toHaveProperty('active');
  });

  it('includes completions count in response', async () => {
    const mockFindMany = vi.mocked(prisma.trainingResource.findMany);
    const resourceWithCount = { ...sampleResource, _count: { completions: 5 } };
    mockFindMany.mockResolvedValue([resourceWithCount] as any);

    const app = buildApp(viewerUser);
    const res = await request(app).get('/api/platform/training');

    expect(res.status).toBe(200);
    const callArgs = mockFindMany.mock.calls[0][0] as any;
    expect(callArgs.include?._count?.select?.completions).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /api/platform/training/:id
// ---------------------------------------------------------------------------

describe('GET /api/platform/training/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(undefined);
    const res = await request(app).get('/api/platform/training/resource-uuid-1');
    expect(res.status).toBe(401);
  });

  it('returns resource detail with completions for VIEWER', async () => {
    const mockFindUnique = vi.mocked(prisma.trainingResource.findUnique);
    mockFindUnique.mockResolvedValue(sampleResourceWithCompletions as any);

    const app = buildApp(viewerUser);
    const res = await request(app).get('/api/platform/training/resource-uuid-1');

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Fire Safety Training');
    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'resource-uuid-1' },
        include: expect.objectContaining({ completions: expect.anything() }),
      })
    );
  });

  it('returns 404 when resource does not exist', async () => {
    const mockFindUnique = vi.mocked(prisma.trainingResource.findUnique);
    mockFindUnique.mockResolvedValue(null);

    const app = buildApp(viewerUser);
    const res = await request(app).get('/api/platform/training/nonexistent-uuid');
    expect(res.status).toBe(404);
  });

  it('returns resource detail for EDITOR', async () => {
    const mockFindUnique = vi.mocked(prisma.trainingResource.findUnique);
    mockFindUnique.mockResolvedValue(sampleResourceWithCompletions as any);

    const app = buildApp(editorUser);
    const res = await request(app).get('/api/platform/training/resource-uuid-1');
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// POST /api/platform/training
// ---------------------------------------------------------------------------

describe('POST /api/platform/training', () => {
  const newResourcePayload = {
    title: 'CPR Certification',
    description: 'Hands-on CPR training for all staff',
    contentType: 'DOCUMENT',
    contentUrl: 'https://example.com/cpr-doc',
  };

  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(undefined);
    const res = await request(app).post('/api/platform/training').send(newResourcePayload);
    expect(res.status).toBe(401);
  });

  it('returns 403 when VIEWER tries to create', async () => {
    const app = buildApp(viewerUser);
    const res = await request(app).post('/api/platform/training').send(newResourcePayload);
    expect(res.status).toBe(403);
  });

  it('returns 400 when title is missing', async () => {
    const app = buildApp(editorUser);
    const res = await request(app)
      .post('/api/platform/training')
      .send({ description: 'Test', contentType: 'DOCUMENT' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/title/i);
  });

  it('returns 400 when description is missing', async () => {
    const app = buildApp(editorUser);
    const res = await request(app)
      .post('/api/platform/training')
      .send({ title: 'Test', contentType: 'DOCUMENT' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/description/i);
  });

  it('returns 400 when contentType is missing', async () => {
    const app = buildApp(editorUser);
    const res = await request(app)
      .post('/api/platform/training')
      .send({ title: 'Test', description: 'Test desc' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/contentType/i);
  });

  it('returns 400 when contentType is invalid', async () => {
    const app = buildApp(editorUser);
    const res = await request(app)
      .post('/api/platform/training')
      .send({ title: 'Test', description: 'Test desc', contentType: 'INVALID' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/contentType/i);
  });

  it('creates resource when EDITOR', async () => {
    const mockCreate = vi.mocked(prisma.trainingResource.create);
    const created = { ...sampleResource, id: 'new-uuid', title: 'CPR Certification' };
    mockCreate.mockResolvedValue(created as any);

    const app = buildApp(editorUser);
    const res = await request(app).post('/api/platform/training').send(newResourcePayload);

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('CPR Certification');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'CPR Certification',
          contentType: 'DOCUMENT',
        }),
      })
    );
  });

  it('creates resource when ADMIN', async () => {
    const mockCreate = vi.mocked(prisma.trainingResource.create);
    const created = { ...sampleResource, id: 'admin-uuid', title: 'Admin Training' };
    mockCreate.mockResolvedValue(created as any);

    const app = buildApp(adminUser);
    const res = await request(app)
      .post('/api/platform/training')
      .send({ ...newResourcePayload, title: 'Admin Training' });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Admin Training');
  });

  it('accepts all valid contentType values', async () => {
    const mockCreate = vi.mocked(prisma.trainingResource.create);
    mockCreate.mockResolvedValue(sampleResource as any);
    const app = buildApp(editorUser);

    for (const contentType of ['VIDEO', 'DOCUMENT', 'LINK']) {
      vi.clearAllMocks();
      mockCreate.mockResolvedValue({ ...sampleResource, contentType } as any);
      const res = await request(app)
        .post('/api/platform/training')
        .send({ title: 'Test', description: 'Test desc', contentType });
      expect(res.status).toBe(201);
    }
  });

  it('defaults active to true and sortOrder to 0 when not provided', async () => {
    const mockCreate = vi.mocked(prisma.trainingResource.create);
    mockCreate.mockResolvedValue(sampleResource as any);

    const app = buildApp(editorUser);
    await request(app).post('/api/platform/training').send(newResourcePayload);

    const createArgs = mockCreate.mock.calls[0][0] as any;
    expect(createArgs.data.active).toBe(true);
    expect(createArgs.data.sortOrder).toBe(0);
    expect(createArgs.data.requiredForRoles).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/platform/training/:id
// ---------------------------------------------------------------------------

describe('PUT /api/platform/training/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(undefined);
    const res = await request(app)
      .put('/api/platform/training/resource-uuid-1')
      .send({ title: 'Updated' });
    expect(res.status).toBe(401);
  });

  it('returns 403 when VIEWER tries to update', async () => {
    const app = buildApp(viewerUser);
    const res = await request(app)
      .put('/api/platform/training/resource-uuid-1')
      .send({ title: 'Updated' });
    expect(res.status).toBe(403);
  });

  it('returns 404 when resource does not exist', async () => {
    const mockFindUnique = vi.mocked(prisma.trainingResource.findUnique);
    mockFindUnique.mockResolvedValue(null);

    const app = buildApp(editorUser);
    const res = await request(app)
      .put('/api/platform/training/nonexistent-uuid')
      .send({ title: 'Updated' });
    expect(res.status).toBe(404);
  });

  it('returns 400 when contentType is invalid', async () => {
    const mockFindUnique = vi.mocked(prisma.trainingResource.findUnique);
    mockFindUnique.mockResolvedValue(sampleResource as any);

    const app = buildApp(editorUser);
    const res = await request(app)
      .put('/api/platform/training/resource-uuid-1')
      .send({ contentType: 'INVALID' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/contentType/i);
  });

  it('updates resource title when EDITOR', async () => {
    const mockFindUnique = vi.mocked(prisma.trainingResource.findUnique);
    mockFindUnique.mockResolvedValue(sampleResource as any);

    const mockUpdate = vi.mocked(prisma.trainingResource.update);
    const updated = { ...sampleResource, title: 'Updated Title' };
    mockUpdate.mockResolvedValue(updated as any);

    const app = buildApp(editorUser);
    const res = await request(app)
      .put('/api/platform/training/resource-uuid-1')
      .send({ title: 'Updated Title' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated Title');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'resource-uuid-1' },
        data: expect.objectContaining({ title: 'Updated Title' }),
      })
    );
  });

  it('updates resource when ADMIN', async () => {
    const mockFindUnique = vi.mocked(prisma.trainingResource.findUnique);
    mockFindUnique.mockResolvedValue(sampleResource as any);

    const mockUpdate = vi.mocked(prisma.trainingResource.update);
    mockUpdate.mockResolvedValue({ ...sampleResource, active: false } as any);

    const app = buildApp(adminUser);
    const res = await request(app)
      .put('/api/platform/training/resource-uuid-1')
      .send({ active: false });
    expect(res.status).toBe(200);
  });

  it('only updates provided fields (partial update)', async () => {
    const mockFindUnique = vi.mocked(prisma.trainingResource.findUnique);
    mockFindUnique.mockResolvedValue(sampleResource as any);

    const mockUpdate = vi.mocked(prisma.trainingResource.update);
    mockUpdate.mockResolvedValue({ ...sampleResource, sortOrder: 5 } as any);

    const app = buildApp(editorUser);
    await request(app)
      .put('/api/platform/training/resource-uuid-1')
      .send({ sortOrder: 5 });

    const updateArgs = mockUpdate.mock.calls[0][0] as any;
    expect(updateArgs.data).toMatchObject({ sortOrder: 5 });
    expect(updateArgs.data.title).toBeUndefined();
    expect(updateArgs.data.description).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/platform/training/:id
// ---------------------------------------------------------------------------

describe('DELETE /api/platform/training/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(undefined);
    const res = await request(app).delete('/api/platform/training/resource-uuid-1');
    expect(res.status).toBe(401);
  });

  it('returns 403 when VIEWER tries to delete', async () => {
    const app = buildApp(viewerUser);
    const res = await request(app).delete('/api/platform/training/resource-uuid-1');
    expect(res.status).toBe(403);
  });

  it('returns 404 when resource does not exist', async () => {
    const mockFindUnique = vi.mocked(prisma.trainingResource.findUnique);
    mockFindUnique.mockResolvedValue(null);

    const app = buildApp(editorUser);
    const res = await request(app).delete('/api/platform/training/nonexistent-uuid');
    expect(res.status).toBe(404);
  });

  it('deletes resource and returns ok when EDITOR', async () => {
    const mockFindUnique = vi.mocked(prisma.trainingResource.findUnique);
    mockFindUnique.mockResolvedValue(sampleResource as any);

    const mockDelete = vi.mocked(prisma.trainingResource.delete);
    mockDelete.mockResolvedValue(sampleResource as any);

    const app = buildApp(editorUser);
    const res = await request(app).delete('/api/platform/training/resource-uuid-1');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockDelete).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'resource-uuid-1' },
      })
    );
  });

  it('deletes resource when ADMIN', async () => {
    const mockFindUnique = vi.mocked(prisma.trainingResource.findUnique);
    mockFindUnique.mockResolvedValue(sampleResource as any);

    const mockDelete = vi.mocked(prisma.trainingResource.delete);
    mockDelete.mockResolvedValue(sampleResource as any);

    const app = buildApp(adminUser);
    const res = await request(app).delete('/api/platform/training/resource-uuid-1');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// POST /api/platform/training/:id/complete
// ---------------------------------------------------------------------------

describe('POST /api/platform/training/:id/complete', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(undefined);
    const res = await request(app).post('/api/platform/training/resource-uuid-1/complete');
    expect(res.status).toBe(401);
  });

  it('returns 404 when resource does not exist', async () => {
    const mockFindUnique = vi.mocked(prisma.trainingResource.findUnique);
    mockFindUnique.mockResolvedValue(null);

    const app = buildApp(viewerUser);
    const res = await request(app).post('/api/platform/training/nonexistent-uuid/complete');
    expect(res.status).toBe(404);
  });

  it('creates completion for VIEWER (any authenticated user)', async () => {
    const mockFindUnique = vi.mocked(prisma.trainingResource.findUnique);
    mockFindUnique.mockResolvedValue(sampleResource as any);

    const mockUpsert = vi.mocked(prisma.trainingCompletion.upsert);
    mockUpsert.mockResolvedValue(sampleCompletion as any);

    const app = buildApp(viewerUser);
    const res = await request(app).post('/api/platform/training/resource-uuid-1/complete');

    expect(res.status).toBe(201);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          resourceId_userId: {
            resourceId: 'resource-uuid-1',
            userId: viewerUser.id,
          },
        },
        create: expect.objectContaining({
          resourceId: 'resource-uuid-1',
          userId: viewerUser.id,
        }),
        update: {},
      })
    );
  });

  it('creates completion for EDITOR', async () => {
    const mockFindUnique = vi.mocked(prisma.trainingResource.findUnique);
    mockFindUnique.mockResolvedValue(sampleResource as any);

    const mockUpsert = vi.mocked(prisma.trainingCompletion.upsert);
    mockUpsert.mockResolvedValue({ ...sampleCompletion, userId: editorUser.id } as any);

    const app = buildApp(editorUser);
    const res = await request(app).post('/api/platform/training/resource-uuid-1/complete');

    expect(res.status).toBe(201);
    expect(mockUpsert).toHaveBeenCalledOnce();
  });

  it('is idempotent (upsert on duplicate completion)', async () => {
    const mockFindUnique = vi.mocked(prisma.trainingResource.findUnique);
    mockFindUnique.mockResolvedValue(sampleResource as any);

    const mockUpsert = vi.mocked(prisma.trainingCompletion.upsert);
    mockUpsert.mockResolvedValue(sampleCompletion as any);

    const app = buildApp(viewerUser);

    // Call twice — should not throw
    const res1 = await request(app).post('/api/platform/training/resource-uuid-1/complete');
    const res2 = await request(app).post('/api/platform/training/resource-uuid-1/complete');

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    expect(mockUpsert).toHaveBeenCalledTimes(2);
    // update clause should be empty (idempotent)
    const upsertArgs = mockUpsert.mock.calls[0][0] as any;
    expect(upsertArgs.update).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// GET /api/platform/training/:id/completions
// ---------------------------------------------------------------------------

describe('GET /api/platform/training/:id/completions', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(undefined);
    const res = await request(app).get('/api/platform/training/resource-uuid-1/completions');
    expect(res.status).toBe(401);
  });

  it('returns 403 when VIEWER tries to list completions', async () => {
    const app = buildApp(viewerUser);
    const res = await request(app).get('/api/platform/training/resource-uuid-1/completions');
    expect(res.status).toBe(403);
  });

  it('returns 404 when resource does not exist', async () => {
    const mockFindUnique = vi.mocked(prisma.trainingResource.findUnique);
    mockFindUnique.mockResolvedValue(null);

    const app = buildApp(editorUser);
    const res = await request(app).get('/api/platform/training/nonexistent-uuid/completions');
    expect(res.status).toBe(404);
  });

  it('returns all completions for EDITOR', async () => {
    const mockFindUnique = vi.mocked(prisma.trainingResource.findUnique);
    mockFindUnique.mockResolvedValue(sampleResource as any);

    const mockFindMany = vi.mocked(prisma.trainingCompletion.findMany);
    mockFindMany.mockResolvedValue([sampleCompletion] as any);

    const app = buildApp(editorUser);
    const res = await request(app).get('/api/platform/training/resource-uuid-1/completions');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { resourceId: 'resource-uuid-1' },
        include: expect.objectContaining({ user: expect.anything() }),
      })
    );
  });

  it('returns all completions for ADMIN', async () => {
    const mockFindUnique = vi.mocked(prisma.trainingResource.findUnique);
    mockFindUnique.mockResolvedValue(sampleResource as any);

    const mockFindMany = vi.mocked(prisma.trainingCompletion.findMany);
    mockFindMany.mockResolvedValue([sampleCompletion] as any);

    const app = buildApp(adminUser);
    const res = await request(app).get('/api/platform/training/resource-uuid-1/completions');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('includes user details in completions', async () => {
    const mockFindUnique = vi.mocked(prisma.trainingResource.findUnique);
    mockFindUnique.mockResolvedValue(sampleResource as any);

    const mockFindMany = vi.mocked(prisma.trainingCompletion.findMany);
    mockFindMany.mockResolvedValue([sampleCompletion] as any);

    const app = buildApp(editorUser);
    const res = await request(app).get('/api/platform/training/resource-uuid-1/completions');

    expect(res.status).toBe(200);
    // Verify include user was passed to Prisma
    const callArgs = mockFindMany.mock.calls[0][0] as any;
    expect(callArgs.include.user).toBeDefined();
  });
});
