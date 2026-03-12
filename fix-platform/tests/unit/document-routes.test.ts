/**
 * Unit tests for Document CRUD API routes.
 *
 * Uses vi.mock to mock Prisma so no database is needed.
 * Tests cover: category list/create, document list (with filters), document detail,
 * document create (with first version), update metadata, add new version, delete.
 *
 * Auth model:
 *   - All routes require authentication
 *   - GET routes are accessible to any authenticated user (VIEWER+)
 *   - POST/PUT/DELETE require EDITOR or ADMIN role
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import { errorHandler } from '../../server/middleware/errorHandler.js';

// Mock Prisma before importing routes
vi.mock('../../server/db.js', () => ({
  default: {
    documentCategory: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    document: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    documentVersion: {
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    platformUser: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import prisma from '../../server/db.js';
import documentsRouter from '../../server/routes/platform/documents.js';

// Type helpers for mocked functions
const mockPrisma = prisma as {
  documentCategory: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  document: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  documentVersion: {
    create: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
  platformUser: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
};

/** Build a minimal Express app for testing. Sets a session user based on role. */
function buildApp(role: 'ADMIN' | 'EDITOR' | 'VIEWER' | null = 'ADMIN', userId = 1) {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: 'test-secret',
      resave: false,
      saveUninitialized: true,
    })
  );

  if (role !== null) {
    app.use((_req, _res, next) => {
      (_req as any).session.user = { id: userId, username: 'testuser', role };
      next();
    });
  }

  app.use('/api/platform/documents', documentsRouter);
  app.use(errorHandler);
  return app;
}

/** Example category returned by Prisma */
const exampleCategory = {
  id: 'cat-uuid-1',
  name: 'Policies',
  description: 'Building policies',
  sortOrder: 0,
};

/** Example document version returned by Prisma */
const exampleVersion = {
  id: 'ver-uuid-1',
  documentId: 'doc-uuid-1',
  version: 1,
  filename: 'policy.pdf',
  mimeType: 'application/pdf',
  size: 1024,
  storagePath: '/storage/policy.pdf',
  uploadedBy: 'platform-user-1',
  createdAt: new Date('2025-01-01').toISOString(),
};

/** Example document returned by Prisma */
const exampleDocument = {
  id: 'doc-uuid-1',
  title: 'Building Policy',
  description: 'Main building policy document',
  categoryId: 'cat-uuid-1',
  category: exampleCategory,
  uploadedBy: 'platform-user-1',
  active: true,
  createdAt: new Date('2025-01-01').toISOString(),
  updatedAt: new Date('2025-01-01').toISOString(),
  versions: [exampleVersion],
};

/** Example platform user */
const examplePlatformUser = {
  id: 'platform-user-1',
  userId: 1,
  role: 'RESIDENT',
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── GET /categories ──────────────────────────────────────────────────────────

describe('GET /api/platform/documents/categories', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).get('/api/platform/documents/categories');
    expect(res.status).toBe(401);
  });

  it('returns list of categories for authenticated user', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.documentCategory.findMany.mockResolvedValue([exampleCategory]);
    const res = await request(app).get('/api/platform/documents/categories');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].name).toBe('Policies');
  });

  it('returns categories ordered by sortOrder then name', async () => {
    const app = buildApp('ADMIN');
    mockPrisma.documentCategory.findMany.mockResolvedValue([exampleCategory]);
    const res = await request(app).get('/api/platform/documents/categories');
    expect(res.status).toBe(200);
    const callArgs = mockPrisma.documentCategory.findMany.mock.calls[0][0];
    expect(callArgs.orderBy).toEqual([{ sortOrder: 'asc' }, { name: 'asc' }]);
  });
});

// ─── POST /categories ────────────────────────────────────────────────────────

describe('POST /api/platform/documents/categories', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app)
      .post('/api/platform/documents/categories')
      .send({ name: 'Policies' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for VIEWER role', async () => {
    const app = buildApp('VIEWER');
    const res = await request(app)
      .post('/api/platform/documents/categories')
      .send({ name: 'Policies' });
    expect(res.status).toBe(403);
  });

  it('returns 400 when name is missing', async () => {
    const app = buildApp('EDITOR');
    const res = await request(app)
      .post('/api/platform/documents/categories')
      .send({ description: 'No name given' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/name/i);
  });

  it('returns 400 when name is empty string', async () => {
    const app = buildApp('EDITOR');
    const res = await request(app)
      .post('/api/platform/documents/categories')
      .send({ name: '   ' });
    expect(res.status).toBe(400);
  });

  it('creates category with name for EDITOR', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.documentCategory.create.mockResolvedValue(exampleCategory);
    const res = await request(app)
      .post('/api/platform/documents/categories')
      .send({ name: 'Policies' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Policies');
    const createArgs = mockPrisma.documentCategory.create.mock.calls[0][0];
    expect(createArgs.data.name).toBe('Policies');
    expect(createArgs.data.sortOrder).toBe(0);
  });

  it('creates category with description and sortOrder', async () => {
    const app = buildApp('ADMIN');
    const categoryWithExtras = { ...exampleCategory, description: 'Building policies', sortOrder: 5 };
    mockPrisma.documentCategory.create.mockResolvedValue(categoryWithExtras);
    const res = await request(app)
      .post('/api/platform/documents/categories')
      .send({ name: 'Policies', description: 'Building policies', sortOrder: 5 });
    expect(res.status).toBe(201);
    const createArgs = mockPrisma.documentCategory.create.mock.calls[0][0];
    expect(createArgs.data.description).toBe('Building policies');
    expect(createArgs.data.sortOrder).toBe(5);
  });
});

// ─── GET / ───────────────────────────────────────────────────────────────────

describe('GET /api/platform/documents', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).get('/api/platform/documents');
    expect(res.status).toBe(401);
  });

  it('returns list of documents for authenticated user', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.document.findMany.mockResolvedValue([exampleDocument]);
    const res = await request(app).get('/api/platform/documents');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].title).toBe('Building Policy');
  });

  it('includes category and latest version in response', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.document.findMany.mockResolvedValue([exampleDocument]);
    const res = await request(app).get('/api/platform/documents');
    expect(res.status).toBe(200);
    const callArgs = mockPrisma.document.findMany.mock.calls[0][0];
    expect(callArgs.include.category).toBe(true);
    expect(callArgs.include.versions).toMatchObject({ orderBy: { version: 'desc' }, take: 1 });
  });

  it('filters by categoryId when provided', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.document.findMany.mockResolvedValue([exampleDocument]);
    const res = await request(app).get('/api/platform/documents?categoryId=cat-uuid-1');
    expect(res.status).toBe(200);
    const callArgs = mockPrisma.document.findMany.mock.calls[0][0];
    expect(callArgs.where.categoryId).toBe('cat-uuid-1');
  });

  it('filters by active=true when provided', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.document.findMany.mockResolvedValue([exampleDocument]);
    const res = await request(app).get('/api/platform/documents?active=true');
    expect(res.status).toBe(200);
    const callArgs = mockPrisma.document.findMany.mock.calls[0][0];
    expect(callArgs.where.active).toBe(true);
  });

  it('filters by active=false when provided', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.document.findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/platform/documents?active=false');
    expect(res.status).toBe(200);
    const callArgs = mockPrisma.document.findMany.mock.calls[0][0];
    expect(callArgs.where.active).toBe(false);
  });

  it('returns 400 for invalid active filter value', async () => {
    const app = buildApp('VIEWER');
    const res = await request(app).get('/api/platform/documents?active=maybe');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/active/i);
  });

  it('supports combining categoryId and active filters', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.document.findMany.mockResolvedValue([exampleDocument]);
    const res = await request(app).get('/api/platform/documents?categoryId=cat-uuid-1&active=true');
    expect(res.status).toBe(200);
    const callArgs = mockPrisma.document.findMany.mock.calls[0][0];
    expect(callArgs.where.categoryId).toBe('cat-uuid-1');
    expect(callArgs.where.active).toBe(true);
  });
});

// ─── GET /:id ────────────────────────────────────────────────────────────────

describe('GET /api/platform/documents/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).get('/api/platform/documents/doc-uuid-1');
    expect(res.status).toBe(401);
  });

  it('returns 404 when document not found', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.document.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/platform/documents/nonexistent');
    expect(res.status).toBe(404);
  });

  it('returns document detail with all versions', async () => {
    const app = buildApp('VIEWER');
    const docWithVersions = {
      ...exampleDocument,
      versions: [exampleVersion, { ...exampleVersion, version: 2, id: 'ver-uuid-2' }],
    };
    mockPrisma.document.findUnique.mockResolvedValue(docWithVersions);
    const res = await request(app).get('/api/platform/documents/doc-uuid-1');
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Building Policy');
    expect(res.body.versions).toHaveLength(2);
  });

  it('includes category in response', async () => {
    const app = buildApp('ADMIN');
    mockPrisma.document.findUnique.mockResolvedValue(exampleDocument);
    const res = await request(app).get('/api/platform/documents/doc-uuid-1');
    expect(res.status).toBe(200);
    const callArgs = mockPrisma.document.findUnique.mock.calls[0][0];
    expect(callArgs.include.category).toBe(true);
    expect(callArgs.include.versions).toBeDefined();
  });
});

// ─── POST / ──────────────────────────────────────────────────────────────────

describe('POST /api/platform/documents', () => {
  const validCreateBody = {
    title: 'Building Policy',
    description: 'Main policy',
    categoryId: 'cat-uuid-1',
    filename: 'policy.pdf',
    mimeType: 'application/pdf',
    size: 1024,
    storagePath: '/storage/policy.pdf',
  };

  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).post('/api/platform/documents').send(validCreateBody);
    expect(res.status).toBe(401);
  });

  it('returns 403 for VIEWER role', async () => {
    const app = buildApp('VIEWER');
    const res = await request(app).post('/api/platform/documents').send(validCreateBody);
    expect(res.status).toBe(403);
  });

  it('returns 400 when title is missing', async () => {
    const app = buildApp('EDITOR');
    const { title: _t, ...body } = validCreateBody;
    const res = await request(app).post('/api/platform/documents').send(body);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/title/i);
  });

  it('returns 400 when categoryId is missing', async () => {
    const app = buildApp('EDITOR');
    const { categoryId: _c, ...body } = validCreateBody;
    const res = await request(app).post('/api/platform/documents').send(body);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/categoryId/i);
  });

  it('returns 400 when filename is missing', async () => {
    const app = buildApp('EDITOR');
    const { filename: _f, ...body } = validCreateBody;
    const res = await request(app).post('/api/platform/documents').send(body);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/filename/i);
  });

  it('returns 400 when mimeType is missing', async () => {
    const app = buildApp('EDITOR');
    const { mimeType: _m, ...body } = validCreateBody;
    const res = await request(app).post('/api/platform/documents').send(body);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/mimeType/i);
  });

  it('returns 400 when size is missing', async () => {
    const app = buildApp('EDITOR');
    const { size: _s, ...body } = validCreateBody;
    const res = await request(app).post('/api/platform/documents').send(body);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/size/i);
  });

  it('returns 400 when storagePath is missing', async () => {
    const app = buildApp('EDITOR');
    const { storagePath: _sp, ...body } = validCreateBody;
    const res = await request(app).post('/api/platform/documents').send(body);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/storagePath/i);
  });

  it('returns 404 when categoryId does not exist', async () => {
    const app = buildApp('EDITOR', 1);
    mockPrisma.platformUser.findUnique.mockResolvedValue(examplePlatformUser);
    mockPrisma.documentCategory.findUnique.mockResolvedValue(null);
    const res = await request(app).post('/api/platform/documents').send(validCreateBody);
    expect(res.status).toBe(404);
  });

  it('auto-provisions PlatformUser for EDITOR and creates document', async () => {
    const app = buildApp('EDITOR', 1);
    mockPrisma.platformUser.findUnique.mockResolvedValue(null);
    const autoProvisionedUser = { id: 'auto-provisioned-1', userId: 1, role: 'MANAGER' };
    mockPrisma.platformUser.create.mockResolvedValue(autoProvisionedUser);
    mockPrisma.documentCategory.findUnique.mockResolvedValue(exampleCategory);
    mockPrisma.document.create.mockResolvedValue(exampleDocument);
    const res = await request(app).post('/api/platform/documents').send(validCreateBody);
    expect(res.status).toBe(201);
    expect(mockPrisma.platformUser.create).toHaveBeenCalledWith({
      data: { userId: 1, role: 'MANAGER' },
    });
  });

  it('creates document with first version for EDITOR', async () => {
    const app = buildApp('EDITOR', 1);
    mockPrisma.platformUser.findUnique.mockResolvedValue(examplePlatformUser);
    mockPrisma.documentCategory.findUnique.mockResolvedValue(exampleCategory);
    mockPrisma.document.create.mockResolvedValue(exampleDocument);
    const res = await request(app).post('/api/platform/documents').send(validCreateBody);
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Building Policy');
    const createArgs = mockPrisma.document.create.mock.calls[0][0];
    expect(createArgs.data.title).toBe('Building Policy');
    expect(createArgs.data.uploadedBy).toBe('platform-user-1');
    expect(createArgs.data.versions.create.version).toBe(1);
    expect(createArgs.data.versions.create.filename).toBe('policy.pdf');
  });

  it('creates document with active=true by default', async () => {
    const app = buildApp('EDITOR', 1);
    mockPrisma.platformUser.findUnique.mockResolvedValue(examplePlatformUser);
    mockPrisma.documentCategory.findUnique.mockResolvedValue(exampleCategory);
    mockPrisma.document.create.mockResolvedValue(exampleDocument);
    const res = await request(app).post('/api/platform/documents').send(validCreateBody);
    expect(res.status).toBe(201);
    const createArgs = mockPrisma.document.create.mock.calls[0][0];
    expect(createArgs.data.active).toBe(true);
  });
});

// ─── PUT /:id ────────────────────────────────────────────────────────────────

describe('PUT /api/platform/documents/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).put('/api/platform/documents/doc-uuid-1').send({ title: 'Updated' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for VIEWER role', async () => {
    const app = buildApp('VIEWER');
    const res = await request(app).put('/api/platform/documents/doc-uuid-1').send({ title: 'Updated' });
    expect(res.status).toBe(403);
  });

  it('returns 404 when document not found', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.document.findUnique.mockResolvedValue(null);
    const res = await request(app).put('/api/platform/documents/nonexistent').send({ title: 'Updated' });
    expect(res.status).toBe(404);
  });

  it('returns 400 when title is empty string', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.document.findUnique.mockResolvedValue(exampleDocument);
    const res = await request(app).put('/api/platform/documents/doc-uuid-1').send({ title: '' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/title/i);
  });

  it('returns 400 when active is not a boolean', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.document.findUnique.mockResolvedValue(exampleDocument);
    const res = await request(app).put('/api/platform/documents/doc-uuid-1').send({ active: 'yes' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/active/i);
  });

  it('returns 404 when new categoryId does not exist', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.document.findUnique.mockResolvedValue(exampleDocument);
    mockPrisma.documentCategory.findUnique.mockResolvedValue(null);
    const res = await request(app).put('/api/platform/documents/doc-uuid-1').send({ categoryId: 'nonexistent' });
    expect(res.status).toBe(404);
  });

  it('updates document title for EDITOR', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.document.findUnique.mockResolvedValue(exampleDocument);
    const updatedDoc = { ...exampleDocument, title: 'Updated Policy' };
    mockPrisma.document.update.mockResolvedValue(updatedDoc);
    const res = await request(app).put('/api/platform/documents/doc-uuid-1').send({ title: 'Updated Policy' });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated Policy');
    const updateArgs = mockPrisma.document.update.mock.calls[0][0];
    expect(updateArgs.data.title).toBe('Updated Policy');
  });

  it('updates document active status', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.document.findUnique.mockResolvedValue(exampleDocument);
    mockPrisma.document.update.mockResolvedValue({ ...exampleDocument, active: false });
    const res = await request(app).put('/api/platform/documents/doc-uuid-1').send({ active: false });
    expect(res.status).toBe(200);
    const updateArgs = mockPrisma.document.update.mock.calls[0][0];
    expect(updateArgs.data.active).toBe(false);
  });

  it('updates categoryId after validating it exists', async () => {
    const app = buildApp('ADMIN');
    mockPrisma.document.findUnique.mockResolvedValue(exampleDocument);
    mockPrisma.documentCategory.findUnique.mockResolvedValue(exampleCategory);
    mockPrisma.document.update.mockResolvedValue({ ...exampleDocument, categoryId: 'cat-uuid-2' });
    const res = await request(app).put('/api/platform/documents/doc-uuid-1').send({ categoryId: 'cat-uuid-2' });
    expect(res.status).toBe(200);
    const updateArgs = mockPrisma.document.update.mock.calls[0][0];
    expect(updateArgs.data.categoryId).toBe('cat-uuid-2');
  });
});

// ─── POST /:id/versions ───────────────────────────────────────────────────────

describe('POST /api/platform/documents/:id/versions', () => {
  const validVersionBody = {
    filename: 'policy-v2.pdf',
    mimeType: 'application/pdf',
    size: 2048,
    storagePath: '/storage/policy-v2.pdf',
  };

  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).post('/api/platform/documents/doc-uuid-1/versions').send(validVersionBody);
    expect(res.status).toBe(401);
  });

  it('returns 403 for VIEWER role', async () => {
    const app = buildApp('VIEWER');
    const res = await request(app).post('/api/platform/documents/doc-uuid-1/versions').send(validVersionBody);
    expect(res.status).toBe(403);
  });

  it('returns 404 when document not found', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.document.findUnique.mockResolvedValue(null);
    const res = await request(app).post('/api/platform/documents/nonexistent/versions').send(validVersionBody);
    expect(res.status).toBe(404);
  });

  it('returns 400 when filename is missing', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.document.findUnique.mockResolvedValue(exampleDocument);
    mockPrisma.platformUser.findUnique.mockResolvedValue(examplePlatformUser);
    const { filename: _f, ...body } = validVersionBody;
    const res = await request(app).post('/api/platform/documents/doc-uuid-1/versions').send(body);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/filename/i);
  });

  it('returns 400 when mimeType is missing', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.document.findUnique.mockResolvedValue(exampleDocument);
    mockPrisma.platformUser.findUnique.mockResolvedValue(examplePlatformUser);
    const { mimeType: _m, ...body } = validVersionBody;
    const res = await request(app).post('/api/platform/documents/doc-uuid-1/versions').send(body);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/mimeType/i);
  });

  it('returns 400 when size is missing', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.document.findUnique.mockResolvedValue(exampleDocument);
    mockPrisma.platformUser.findUnique.mockResolvedValue(examplePlatformUser);
    const { size: _s, ...body } = validVersionBody;
    const res = await request(app).post('/api/platform/documents/doc-uuid-1/versions').send(body);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/size/i);
  });

  it('returns 400 when storagePath is missing', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.document.findUnique.mockResolvedValue(exampleDocument);
    mockPrisma.platformUser.findUnique.mockResolvedValue(examplePlatformUser);
    const { storagePath: _sp, ...body } = validVersionBody;
    const res = await request(app).post('/api/platform/documents/doc-uuid-1/versions').send(body);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/storagePath/i);
  });

  it('auto-provisions PlatformUser for EDITOR and creates version', async () => {
    const app = buildApp('EDITOR', 1);
    mockPrisma.document.findUnique.mockResolvedValue(exampleDocument);
    mockPrisma.platformUser.findUnique.mockResolvedValue(null);
    const autoProvisionedUser = { id: 'auto-provisioned-1', userId: 1, role: 'MANAGER' };
    mockPrisma.platformUser.create.mockResolvedValue(autoProvisionedUser);
    mockPrisma.documentVersion.create.mockResolvedValue({ ...exampleVersion, version: 1 });
    const res = await request(app).post('/api/platform/documents/doc-uuid-1/versions').send(validVersionBody);
    expect(res.status).toBe(201);
    expect(mockPrisma.platformUser.create).toHaveBeenCalledWith({
      data: { userId: 1, role: 'MANAGER' },
    });
  });

  it('auto-increments version number from existing versions', async () => {
    const app = buildApp('EDITOR', 1);
    const docWithVersions = { ...exampleDocument, versions: [{ ...exampleVersion, version: 3 }] };
    mockPrisma.document.findUnique.mockResolvedValue(docWithVersions);
    mockPrisma.platformUser.findUnique.mockResolvedValue(examplePlatformUser);
    const newVersion = { ...exampleVersion, id: 'ver-uuid-4', version: 4, filename: 'policy-v4.pdf' };
    mockPrisma.documentVersion.create.mockResolvedValue(newVersion);
    const res = await request(app).post('/api/platform/documents/doc-uuid-1/versions').send(validVersionBody);
    expect(res.status).toBe(201);
    const createArgs = mockPrisma.documentVersion.create.mock.calls[0][0];
    expect(createArgs.data.version).toBe(4);
  });

  it('sets version to 1 when document has no existing versions', async () => {
    const app = buildApp('EDITOR', 1);
    const docNoVersions = { ...exampleDocument, versions: [] };
    mockPrisma.document.findUnique.mockResolvedValue(docNoVersions);
    mockPrisma.platformUser.findUnique.mockResolvedValue(examplePlatformUser);
    mockPrisma.documentVersion.create.mockResolvedValue({ ...exampleVersion, version: 1 });
    const res = await request(app).post('/api/platform/documents/doc-uuid-1/versions').send(validVersionBody);
    expect(res.status).toBe(201);
    const createArgs = mockPrisma.documentVersion.create.mock.calls[0][0];
    expect(createArgs.data.version).toBe(1);
  });

  it('creates new version with correct uploadedBy from platform user', async () => {
    const app = buildApp('EDITOR', 1);
    mockPrisma.document.findUnique.mockResolvedValue(exampleDocument);
    mockPrisma.platformUser.findUnique.mockResolvedValue(examplePlatformUser);
    mockPrisma.documentVersion.create.mockResolvedValue({ ...exampleVersion, version: 2 });
    const res = await request(app).post('/api/platform/documents/doc-uuid-1/versions').send(validVersionBody);
    expect(res.status).toBe(201);
    const createArgs = mockPrisma.documentVersion.create.mock.calls[0][0];
    expect(createArgs.data.uploadedBy).toBe('platform-user-1');
    expect(createArgs.data.documentId).toBe('doc-uuid-1');
  });
});

// ─── DELETE /:id ──────────────────────────────────────────────────────────────

describe('DELETE /api/platform/documents/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).delete('/api/platform/documents/doc-uuid-1');
    expect(res.status).toBe(401);
  });

  it('returns 403 for VIEWER role', async () => {
    const app = buildApp('VIEWER');
    const res = await request(app).delete('/api/platform/documents/doc-uuid-1');
    expect(res.status).toBe(403);
  });

  it('returns 404 when document not found', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.document.findUnique.mockResolvedValue(null);
    const res = await request(app).delete('/api/platform/documents/nonexistent');
    expect(res.status).toBe(404);
  });

  it('deletes document versions before deleting document for EDITOR', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.document.findUnique.mockResolvedValue(exampleDocument);
    mockPrisma.documentVersion.deleteMany.mockResolvedValue({ count: 1 });
    mockPrisma.document.delete.mockResolvedValue(exampleDocument);
    const res = await request(app).delete('/api/platform/documents/doc-uuid-1');
    expect(res.status).toBe(204);
    // Versions should be deleted first
    expect(mockPrisma.documentVersion.deleteMany).toHaveBeenCalledOnce();
    const deleteManyArgs = mockPrisma.documentVersion.deleteMany.mock.calls[0][0];
    expect(deleteManyArgs.where.documentId).toBe('doc-uuid-1');
    // Then document
    expect(mockPrisma.document.delete).toHaveBeenCalledOnce();
    const deleteArgs = mockPrisma.document.delete.mock.calls[0][0];
    expect(deleteArgs.where.id).toBe('doc-uuid-1');
  });

  it('deletes document for ADMIN role', async () => {
    const app = buildApp('ADMIN');
    mockPrisma.document.findUnique.mockResolvedValue(exampleDocument);
    mockPrisma.documentVersion.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.document.delete.mockResolvedValue(exampleDocument);
    const res = await request(app).delete('/api/platform/documents/doc-uuid-1');
    expect(res.status).toBe(204);
  });

  it('returns 204 no content on successful delete', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.document.findUnique.mockResolvedValue(exampleDocument);
    mockPrisma.documentVersion.deleteMany.mockResolvedValue({ count: 2 });
    mockPrisma.document.delete.mockResolvedValue(exampleDocument);
    const res = await request(app).delete('/api/platform/documents/doc-uuid-1');
    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });
});
