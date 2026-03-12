/**
 * Unit tests for Consent Forms API routes.
 *
 * Uses vi.mock to mock Prisma so no database is needed.
 * Tests cover:
 *  - GET /  - list forms with optional ?active filter and signature count
 *  - GET /my-signatures - list current user's signatures
 *  - GET /:id - form detail with signatures
 *  - POST /  - create form (EDITOR+)
 *  - PUT /:id - update form (EDITOR+)
 *  - DELETE /:id - delete form with cascade (EDITOR+)
 *  - POST /:id/sign - sign form (any auth), rejects duplicates
 *  - GET /:id/signatures - list signatures (EDITOR+)
 *
 * Auth model:
 *  - All routes require authentication
 *  - EDITOR+ for mutations (create/update/delete) and listing signatures
 *  - Any authenticated user can read, sign, and view their own signatures
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { errorHandler } from '../../server/middleware/errorHandler.js';

// Mock Prisma before importing routes
vi.mock('../../server/db.js', () => ({
  default: {
    consentForm: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    consentSignature: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    platformUser: {
      findFirst: vi.fn(),
    },
  },
}));

import prisma from '../../server/db.js';
import consentRouter from '../../server/routes/platform/consent.js';

// Type helpers for mocked Prisma functions
const mockPrisma = prisma as {
  consentForm: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  consentSignature: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
  platformUser: {
    findFirst: ReturnType<typeof vi.fn>;
  };
};

/** Build a minimal Express app with a session user. */
function buildApp(
  role: 'ADMIN' | 'EDITOR' | 'VIEWER' | null = 'ADMIN',
  userId: string = 'user-uuid-1'
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

  app.use('/api/platform/consent', consentRouter);
  app.use(errorHandler);
  return app;
}

const sampleForm = {
  id: 'form-uuid-1',
  title: 'Resident Agreement',
  body: 'I agree to the terms...',
  version: 1,
  requiredForRoles: [],
  active: true,
  createdBy: 'user-uuid-1',
  createdAt: new Date('2025-01-01').toISOString(),
  updatedAt: new Date('2025-01-01').toISOString(),
  _count: { signatures: 3 },
};

const sampleSignature = {
  id: 'sig-uuid-1',
  formId: 'form-uuid-1',
  userId: 'user-uuid-1',
  signedAt: new Date('2025-01-15').toISOString(),
  ipAddress: '127.0.0.1',
  userAgent: 'Mozilla/5.0',
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: platformUser.findFirst maps session user.id → PlatformUser.id
  // Convention: user id N → platform user id 'platform-user-N'
  // This matches the test helpers: buildApp(role, userId) where userId can be a string like 'user-uuid-1'
  mockPrisma.platformUser.findFirst.mockImplementation(async (args: any) => {
    const sessionUserId = args?.where?.userId;
    if (sessionUserId === undefined || sessionUserId === null) return null;
    return { id: String(sessionUserId), userId: sessionUserId, role: 'RESIDENT' };
  });
});

// ─── GET / ────────────────────────────────────────────────────────────────────

describe('GET /api/platform/consent', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).get('/api/platform/consent');
    expect(res.status).toBe(401);
  });

  it('returns all forms for authenticated user', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.consentForm.findMany.mockResolvedValue([sampleForm]);
    const res = await request(app).get('/api/platform/consent');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
    expect(res.body[0].id).toBe('form-uuid-1');
  });

  it('filters by active=true when query param is set', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.consentForm.findMany.mockResolvedValue([sampleForm]);
    const res = await request(app).get('/api/platform/consent?active=true');
    expect(res.status).toBe(200);
    const callArgs = mockPrisma.consentForm.findMany.mock.calls[0][0];
    expect(callArgs.where).toMatchObject({ active: true });
  });

  it('filters by active=false when query param is set', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.consentForm.findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/platform/consent?active=false');
    expect(res.status).toBe(200);
    const callArgs = mockPrisma.consentForm.findMany.mock.calls[0][0];
    expect(callArgs.where).toMatchObject({ active: false });
  });

  it('returns forms without active filter when param is not set', async () => {
    const app = buildApp('ADMIN');
    mockPrisma.consentForm.findMany.mockResolvedValue([sampleForm]);
    const res = await request(app).get('/api/platform/consent');
    expect(res.status).toBe(200);
    const callArgs = mockPrisma.consentForm.findMany.mock.calls[0][0];
    expect(callArgs.where).not.toHaveProperty('active');
  });

  it('includes signature count in response', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.consentForm.findMany.mockResolvedValue([sampleForm]);
    const res = await request(app).get('/api/platform/consent');
    expect(res.status).toBe(200);
    const callArgs = mockPrisma.consentForm.findMany.mock.calls[0][0];
    expect(callArgs.include._count.select).toHaveProperty('signatures');
  });
});

// ─── GET /my-signatures ───────────────────────────────────────────────────────

describe('GET /api/platform/consent/my-signatures', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).get('/api/platform/consent/my-signatures');
    expect(res.status).toBe(401);
  });

  it('returns current user\'s signatures', async () => {
    const app = buildApp('VIEWER', 'viewer-uuid-99');
    mockPrisma.consentSignature.findMany.mockResolvedValue([sampleSignature]);
    const res = await request(app).get('/api/platform/consent/my-signatures');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Should filter by the current user's ID
    const callArgs = mockPrisma.consentSignature.findMany.mock.calls[0][0];
    expect(callArgs.where).toMatchObject({ userId: 'viewer-uuid-99' });
  });

  it('includes form info in signature response', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.consentSignature.findMany.mockResolvedValue([sampleSignature]);
    const res = await request(app).get('/api/platform/consent/my-signatures');
    expect(res.status).toBe(200);
    const callArgs = mockPrisma.consentSignature.findMany.mock.calls[0][0];
    expect(callArgs.include).toHaveProperty('form');
  });

  it('returns signatures for ADMIN too', async () => {
    const app = buildApp('ADMIN', 'admin-uuid-1');
    mockPrisma.consentSignature.findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/platform/consent/my-signatures');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────

describe('GET /api/platform/consent/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).get('/api/platform/consent/form-uuid-1');
    expect(res.status).toBe(401);
  });

  it('returns 404 when form not found', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.consentForm.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/platform/consent/nonexistent-id');
    expect(res.status).toBe(404);
  });

  it('returns form with signatures for authenticated user', async () => {
    const app = buildApp('VIEWER');
    const formWithSigs = { ...sampleForm, signatures: [sampleSignature] };
    mockPrisma.consentForm.findUnique.mockResolvedValue(formWithSigs);
    const res = await request(app).get('/api/platform/consent/form-uuid-1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('form-uuid-1');
    expect(res.body.title).toBe('Resident Agreement');
  });

  it('queries by id correctly', async () => {
    const app = buildApp('ADMIN');
    mockPrisma.consentForm.findUnique.mockResolvedValue(sampleForm);
    await request(app).get('/api/platform/consent/form-uuid-1');
    const callArgs = mockPrisma.consentForm.findUnique.mock.calls[0][0];
    expect(callArgs.where).toMatchObject({ id: 'form-uuid-1' });
  });
});

// ─── POST / ───────────────────────────────────────────────────────────────────

describe('POST /api/platform/consent', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app)
      .post('/api/platform/consent')
      .send({ title: 'Test', body: 'Body', version: 1 });
    expect(res.status).toBe(401);
  });

  it('returns 403 for VIEWER role', async () => {
    const app = buildApp('VIEWER');
    const res = await request(app)
      .post('/api/platform/consent')
      .send({ title: 'Test', body: 'Body', version: 1 });
    expect(res.status).toBe(403);
  });

  it('returns 400 when title is missing', async () => {
    const app = buildApp('EDITOR');
    const res = await request(app)
      .post('/api/platform/consent')
      .send({ body: 'Body', version: 1 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/title/i);
  });

  it('returns 400 when body is missing', async () => {
    const app = buildApp('EDITOR');
    const res = await request(app)
      .post('/api/platform/consent')
      .send({ title: 'Test', version: 1 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/body/i);
  });

  it('returns 400 when version is missing', async () => {
    const app = buildApp('EDITOR');
    const res = await request(app)
      .post('/api/platform/consent')
      .send({ title: 'Test', body: 'Body' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/version/i);
  });

  it('returns 400 when version is not a positive integer', async () => {
    const app = buildApp('EDITOR');
    const res = await request(app)
      .post('/api/platform/consent')
      .send({ title: 'Test', body: 'Body', version: 0 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/version/i);
  });

  it('creates form for EDITOR', async () => {
    const app = buildApp('EDITOR', 'editor-uuid-2');
    mockPrisma.consentForm.create.mockResolvedValue(sampleForm);
    const res = await request(app)
      .post('/api/platform/consent')
      .send({ title: 'Test Form', body: 'I agree to terms', version: 1 });
    expect(res.status).toBe(201);
    const createArgs = mockPrisma.consentForm.create.mock.calls[0][0];
    expect(createArgs.data.title).toBe('Test Form');
    expect(createArgs.data.version).toBe(1);
    expect(createArgs.data.createdBy).toBe('editor-uuid-2');
  });

  it('defaults active to true when not specified', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.consentForm.create.mockResolvedValue(sampleForm);
    await request(app)
      .post('/api/platform/consent')
      .send({ title: 'Test', body: 'Body', version: 1 });
    const createArgs = mockPrisma.consentForm.create.mock.calls[0][0];
    expect(createArgs.data.active).toBe(true);
  });

  it('accepts optional active and requiredForRoles fields', async () => {
    const app = buildApp('ADMIN');
    mockPrisma.consentForm.create.mockResolvedValue(sampleForm);
    await request(app)
      .post('/api/platform/consent')
      .send({
        title: 'Test',
        body: 'Body',
        version: 2,
        active: false,
        requiredForRoles: ['RESIDENT'],
      });
    const createArgs = mockPrisma.consentForm.create.mock.calls[0][0];
    expect(createArgs.data.active).toBe(false);
    expect(createArgs.data.requiredForRoles).toEqual(['RESIDENT']);
  });

  it('creates form for ADMIN too', async () => {
    const app = buildApp('ADMIN');
    mockPrisma.consentForm.create.mockResolvedValue(sampleForm);
    const res = await request(app)
      .post('/api/platform/consent')
      .send({ title: 'Test', body: 'Body', version: 1 });
    expect(res.status).toBe(201);
  });
});

// ─── PUT /:id ─────────────────────────────────────────────────────────────────

describe('PUT /api/platform/consent/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app)
      .put('/api/platform/consent/form-uuid-1')
      .send({ title: 'Updated' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for VIEWER role', async () => {
    const app = buildApp('VIEWER');
    const res = await request(app)
      .put('/api/platform/consent/form-uuid-1')
      .send({ title: 'Updated' });
    expect(res.status).toBe(403);
  });

  it('returns 404 when form not found', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.consentForm.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .put('/api/platform/consent/nonexistent')
      .send({ title: 'Updated' });
    expect(res.status).toBe(404);
  });

  it('returns 400 when version is invalid', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.consentForm.findUnique.mockResolvedValue(sampleForm);
    const res = await request(app)
      .put('/api/platform/consent/form-uuid-1')
      .send({ version: -1 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/version/i);
  });

  it('updates the form for EDITOR+', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.consentForm.findUnique.mockResolvedValue(sampleForm);
    const updatedForm = { ...sampleForm, title: 'Updated Title' };
    mockPrisma.consentForm.update.mockResolvedValue(updatedForm);
    const res = await request(app)
      .put('/api/platform/consent/form-uuid-1')
      .send({ title: 'Updated Title' });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated Title');
  });

  it('only updates provided fields', async () => {
    const app = buildApp('ADMIN');
    mockPrisma.consentForm.findUnique.mockResolvedValue(sampleForm);
    mockPrisma.consentForm.update.mockResolvedValue({ ...sampleForm, active: false });
    await request(app)
      .put('/api/platform/consent/form-uuid-1')
      .send({ active: false });
    const updateArgs = mockPrisma.consentForm.update.mock.calls[0][0];
    expect(updateArgs.data).toHaveProperty('active', false);
    expect(updateArgs.data).not.toHaveProperty('title');
    expect(updateArgs.data).not.toHaveProperty('body');
  });
});

// ─── DELETE /:id ──────────────────────────────────────────────────────────────

describe('DELETE /api/platform/consent/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).delete('/api/platform/consent/form-uuid-1');
    expect(res.status).toBe(401);
  });

  it('returns 403 for VIEWER role', async () => {
    const app = buildApp('VIEWER');
    const res = await request(app).delete('/api/platform/consent/form-uuid-1');
    expect(res.status).toBe(403);
  });

  it('returns 404 when form not found', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.consentForm.findUnique.mockResolvedValue(null);
    const res = await request(app).delete('/api/platform/consent/nonexistent');
    expect(res.status).toBe(404);
  });

  it('deletes signatures then the form (cascade)', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.consentForm.findUnique.mockResolvedValue(sampleForm);
    mockPrisma.consentSignature.deleteMany.mockResolvedValue({ count: 2 });
    mockPrisma.consentForm.delete.mockResolvedValue(sampleForm);
    const res = await request(app).delete('/api/platform/consent/form-uuid-1');
    expect(res.status).toBe(204);
    // Cascade delete: signatures deleted first
    expect(mockPrisma.consentSignature.deleteMany).toHaveBeenCalledOnce();
    const deleteManyArgs = mockPrisma.consentSignature.deleteMany.mock.calls[0][0];
    expect(deleteManyArgs.where).toMatchObject({ formId: 'form-uuid-1' });
    // Then the form itself
    expect(mockPrisma.consentForm.delete).toHaveBeenCalledOnce();
    const deleteArgs = mockPrisma.consentForm.delete.mock.calls[0][0];
    expect(deleteArgs.where).toMatchObject({ id: 'form-uuid-1' });
  });

  it('allows ADMIN to delete forms', async () => {
    const app = buildApp('ADMIN');
    mockPrisma.consentForm.findUnique.mockResolvedValue(sampleForm);
    mockPrisma.consentSignature.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.consentForm.delete.mockResolvedValue(sampleForm);
    const res = await request(app).delete('/api/platform/consent/form-uuid-1');
    expect(res.status).toBe(204);
  });
});

// ─── POST /:id/sign ───────────────────────────────────────────────────────────

describe('POST /api/platform/consent/:id/sign', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).post('/api/platform/consent/form-uuid-1/sign');
    expect(res.status).toBe(401);
  });

  it('returns 404 when form not found', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.consentForm.findUnique.mockResolvedValue(null);
    const res = await request(app).post('/api/platform/consent/nonexistent/sign');
    expect(res.status).toBe(404);
  });

  it('returns 400 when already signed', async () => {
    const app = buildApp('VIEWER', 'user-uuid-1');
    mockPrisma.consentForm.findUnique.mockResolvedValue(sampleForm);
    mockPrisma.consentSignature.findUnique.mockResolvedValue(sampleSignature);
    const res = await request(app).post('/api/platform/consent/form-uuid-1/sign');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already signed/i);
  });

  it('creates a signature for authenticated user', async () => {
    const app = buildApp('VIEWER', 'user-uuid-1');
    mockPrisma.consentForm.findUnique.mockResolvedValue(sampleForm);
    mockPrisma.consentSignature.findUnique.mockResolvedValue(null);
    mockPrisma.consentSignature.create.mockResolvedValue(sampleSignature);
    const res = await request(app).post('/api/platform/consent/form-uuid-1/sign');
    expect(res.status).toBe(201);
    const createArgs = mockPrisma.consentSignature.create.mock.calls[0][0];
    expect(createArgs.data.formId).toBe('form-uuid-1');
    expect(createArgs.data.userId).toBe('user-uuid-1');
  });

  it('captures ipAddress and userAgent', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.consentForm.findUnique.mockResolvedValue(sampleForm);
    mockPrisma.consentSignature.findUnique.mockResolvedValue(null);
    mockPrisma.consentSignature.create.mockResolvedValue(sampleSignature);
    await request(app)
      .post('/api/platform/consent/form-uuid-1/sign')
      .set('User-Agent', 'TestBrowser/1.0');
    const createArgs = mockPrisma.consentSignature.create.mock.calls[0][0];
    expect(createArgs.data).toHaveProperty('ipAddress');
    expect(createArgs.data.userAgent).toBe('TestBrowser/1.0');
  });

  it('allows EDITOR to sign', async () => {
    const app = buildApp('EDITOR', 'editor-uuid-2');
    mockPrisma.consentForm.findUnique.mockResolvedValue(sampleForm);
    mockPrisma.consentSignature.findUnique.mockResolvedValue(null);
    mockPrisma.consentSignature.create.mockResolvedValue({
      ...sampleSignature,
      userId: 'editor-uuid-2',
    });
    const res = await request(app).post('/api/platform/consent/form-uuid-1/sign');
    expect(res.status).toBe(201);
  });
});

// ─── GET /:id/signatures ──────────────────────────────────────────────────────

describe('GET /api/platform/consent/:id/signatures', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).get('/api/platform/consent/form-uuid-1/signatures');
    expect(res.status).toBe(401);
  });

  it('returns 403 for VIEWER role', async () => {
    const app = buildApp('VIEWER');
    const res = await request(app).get('/api/platform/consent/form-uuid-1/signatures');
    expect(res.status).toBe(403);
  });

  it('returns 404 when form not found', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.consentForm.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/platform/consent/nonexistent/signatures');
    expect(res.status).toBe(404);
  });

  it('returns signatures for EDITOR+', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.consentForm.findUnique.mockResolvedValue(sampleForm);
    mockPrisma.consentSignature.findMany.mockResolvedValue([sampleSignature]);
    const res = await request(app).get('/api/platform/consent/form-uuid-1/signatures');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
  });

  it('filters signatures by formId', async () => {
    const app = buildApp('ADMIN');
    mockPrisma.consentForm.findUnique.mockResolvedValue(sampleForm);
    mockPrisma.consentSignature.findMany.mockResolvedValue([sampleSignature]);
    await request(app).get('/api/platform/consent/form-uuid-1/signatures');
    const callArgs = mockPrisma.consentSignature.findMany.mock.calls[0][0];
    expect(callArgs.where).toMatchObject({ formId: 'form-uuid-1' });
  });

  it('includes user info in signature response', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.consentForm.findUnique.mockResolvedValue(sampleForm);
    mockPrisma.consentSignature.findMany.mockResolvedValue([sampleSignature]);
    await request(app).get('/api/platform/consent/form-uuid-1/signatures');
    const callArgs = mockPrisma.consentSignature.findMany.mock.calls[0][0];
    expect(callArgs.include).toHaveProperty('user');
  });

  it('returns signatures for ADMIN too', async () => {
    const app = buildApp('ADMIN');
    mockPrisma.consentForm.findUnique.mockResolvedValue(sampleForm);
    mockPrisma.consentSignature.findMany.mockResolvedValue([sampleSignature]);
    const res = await request(app).get('/api/platform/consent/form-uuid-1/signatures');
    expect(res.status).toBe(200);
  });
});
