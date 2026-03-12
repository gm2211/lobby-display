/**
 * Unit tests for Visitor CRUD API routes.
 *
 * Uses vi.mock to mock Prisma so no database is needed.
 * Tests cover: list (own vs all), expected visitors by date, detail with logs,
 * create (auto-generates accessCode), update/cancel, check-in, check-out.
 *
 * Auth mapping (no PlatformRole in current schema):
 *   - Any authenticated user can register visitors and view their own
 *   - EDITOR+ can see all visitors and manage check-in/check-out
 *   - VIEWER sees only their own visitors
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import { errorHandler } from '../../server/middleware/errorHandler.js';

// Mock Prisma before importing routes
vi.mock('../../server/db.js', () => ({
  default: {
    visitor: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    visitorLog: {
      create: vi.fn(),
    },
    platformUser: {
      findUnique: vi.fn(),
    },
  },
}));

import prisma from '../../server/db.js';
import visitorsRouter from '../../server/routes/platform/visitors.js';

// Type helpers for mocked functions
const mockPrisma = prisma as {
  visitor: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  visitorLog: {
    create: ReturnType<typeof vi.fn>;
  };
  platformUser: {
    findUnique: ReturnType<typeof vi.fn>;
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
    // Ensure platformUser mock returns a user with matching userId
    mockPrisma.platformUser.findUnique.mockResolvedValue({
      ...examplePlatformUser,
      userId,
      id: `platform-user-${userId}`,
    });
  } else {
    // Unauthenticated — platformProtectStrict will reject before querying
    mockPrisma.platformUser.findUnique.mockResolvedValue(null);
  }

  app.use('/api/visitors', visitorsRouter);
  app.use(errorHandler);
  return app;
}

/** Example platform user for middleware */
const examplePlatformUser = {
  id: 'platform-user-uuid',
  userId: 1,
  unitNumber: '101',
  role: 'RESIDENT',
  active: true,
  createdAt: new Date('2025-01-01').toISOString(),
  updatedAt: new Date('2025-01-01').toISOString(),
};

/** Example visitor returned by Prisma — hostId matches buildApp(*, 1) platformUser */
const exampleVisitor = {
  id: 1,
  hostId: 'platform-user-1',
  guestName: 'John Doe',
  guestEmail: 'john@example.com',
  guestPhone: null,
  purpose: 'Visit',
  expectedDate: new Date('2025-01-15T10:00:00.000Z').toISOString(),
  accessCode: 'ABC123',
  status: 'EXPECTED',
  notes: null,
  createdAt: new Date('2025-01-01').toISOString(),
  updatedAt: new Date('2025-01-01').toISOString(),
  logs: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: platformProtectStrict will find the platform user
  mockPrisma.platformUser.findUnique.mockResolvedValue(examplePlatformUser);
});

// ─── GET / ────────────────────────────────────────────────────────────────────

describe('GET /api/visitors', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).get('/api/visitors');
    expect(res.status).toBe(401);
  });

  it('returns only own visitors for VIEWER', async () => {
    const app = buildApp('VIEWER', 2);
    mockPrisma.visitor.findMany.mockResolvedValue([exampleVisitor]);
    const res = await request(app).get('/api/visitors');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Viewer gets filtered by hostId (platformUser.id is a UUID string)
    const callArgs = mockPrisma.visitor.findMany.mock.calls[0][0];
    expect(callArgs.where).toMatchObject({ hostId: 'platform-user-2' });
  });

  it('returns all visitors for EDITOR+', async () => {
    const app = buildApp('EDITOR', 1);
    mockPrisma.visitor.findMany.mockResolvedValue([exampleVisitor]);
    const res = await request(app).get('/api/visitors');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Editor gets all (no hostId filter)
    const callArgs = mockPrisma.visitor.findMany.mock.calls[0][0];
    expect(callArgs.where).not.toHaveProperty('hostId');
  });

  it('returns all visitors for ADMIN', async () => {
    const app = buildApp('ADMIN', 1);
    mockPrisma.visitor.findMany.mockResolvedValue([exampleVisitor]);
    const res = await request(app).get('/api/visitors');
    expect(res.status).toBe(200);
    const callArgs = mockPrisma.visitor.findMany.mock.calls[0][0];
    expect(callArgs.where).not.toHaveProperty('hostId');
  });
});

// ─── GET /expected ─────────────────────────────────────────────────────────────

describe('GET /api/visitors/expected', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).get('/api/visitors/expected?date=2025-01-15');
    expect(res.status).toBe(401);
  });

  it('returns 403 for VIEWER role', async () => {
    const app = buildApp('VIEWER');
    const res = await request(app).get('/api/visitors/expected?date=2025-01-15');
    expect(res.status).toBe(403);
  });

  it('returns 400 when date param is missing', async () => {
    const app = buildApp('EDITOR');
    const res = await request(app).get('/api/visitors/expected');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/date/i);
  });

  it('returns 400 when date param has invalid format', async () => {
    const app = buildApp('EDITOR');
    const res = await request(app).get('/api/visitors/expected?date=not-a-date');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/date/i);
  });

  it('returns expected visitors for a given date for EDITOR+', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.visitor.findMany.mockResolvedValue([exampleVisitor]);
    const res = await request(app).get('/api/visitors/expected?date=2025-01-15');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Should query for status EXPECTED on that date range
    const callArgs = mockPrisma.visitor.findMany.mock.calls[0][0];
    expect(callArgs.where.status).toBe('EXPECTED');
  });

  it('returns expected visitors for ADMIN', async () => {
    const app = buildApp('ADMIN');
    mockPrisma.visitor.findMany.mockResolvedValue([exampleVisitor]);
    const res = await request(app).get('/api/visitors/expected?date=2025-01-15');
    expect(res.status).toBe(200);
  });
});

// ─── GET /:id ────────────────────────────────────────────────────────────────

describe('GET /api/visitors/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).get('/api/visitors/1');
    expect(res.status).toBe(401);
  });

  it('returns 404 for non-existent id (UUIDs are strings, no format validation)', async () => {
    const app = buildApp('ADMIN');
    mockPrisma.visitor.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/visitors/abc');
    expect(res.status).toBe(404);
  });

  it('returns 404 when visitor not found', async () => {
    const app = buildApp('ADMIN');
    mockPrisma.visitor.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/visitors/99');
    expect(res.status).toBe(404);
  });

  it('returns 403 when VIEWER accesses another user\'s visitor', async () => {
    const app = buildApp('VIEWER', 99); // different user
    mockPrisma.visitor.findUnique.mockResolvedValue(exampleVisitor); // hostId: 1
    const res = await request(app).get('/api/visitors/1');
    expect(res.status).toBe(403);
  });

  it('returns visitor with logs for owner', async () => {
    const app = buildApp('VIEWER', 1); // same user as hostId
    mockPrisma.visitor.findUnique.mockResolvedValue({ ...exampleVisitor, logs: [] });
    const res = await request(app).get('/api/visitors/1');
    expect(res.status).toBe(200);
    expect(res.body.guestName).toBe('John Doe');
  });

  it('returns visitor with logs for EDITOR+', async () => {
    const app = buildApp('EDITOR', 5); // different user but EDITOR
    mockPrisma.visitor.findUnique.mockResolvedValue({ ...exampleVisitor, logs: [] });
    const res = await request(app).get('/api/visitors/1');
    expect(res.status).toBe(200);
    expect(res.body.guestName).toBe('John Doe');
  });
});

// ─── POST / ──────────────────────────────────────────────────────────────────

describe('POST /api/visitors', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app)
      .post('/api/visitors')
      .send({ guestName: 'Jane', expectedDate: '2025-01-20' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when guestName is missing', async () => {
    const app = buildApp('VIEWER');
    const res = await request(app)
      .post('/api/visitors')
      .send({ expectedDate: '2025-01-20' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/guestName/i);
  });

  it('returns 400 when expectedDate is missing', async () => {
    const app = buildApp('VIEWER');
    const res = await request(app)
      .post('/api/visitors')
      .send({ guestName: 'Jane' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/expectedDate/i);
  });

  it('auto-generates a 6-character accessCode on creation', async () => {
    const app = buildApp('VIEWER', 1);
    mockPrisma.visitor.create.mockResolvedValue({
      ...exampleVisitor,
      accessCode: 'XYZ789',
    });
    const res = await request(app)
      .post('/api/visitors')
      .send({ guestName: 'Jane Doe', expectedDate: '2025-01-20T10:00:00Z' });
    expect(res.status).toBe(201);
    // The create call should include an accessCode
    const createArgs = mockPrisma.visitor.create.mock.calls[0][0];
    expect(createArgs.data.accessCode).toBeDefined();
    expect(typeof createArgs.data.accessCode).toBe('string');
    expect(createArgs.data.accessCode.length).toBeGreaterThanOrEqual(6);
  });

  it('sets hostId from platformUser.id on creation', async () => {
    const app = buildApp('VIEWER', 42);
    mockPrisma.visitor.create.mockResolvedValue({ ...exampleVisitor, hostId: 'platform-user-42' });
    const res = await request(app)
      .post('/api/visitors')
      .send({ guestName: 'Jane Doe', expectedDate: '2025-01-20T10:00:00Z' });
    expect(res.status).toBe(201);
    const createArgs = mockPrisma.visitor.create.mock.calls[0][0];
    expect(createArgs.data.hostId).toBe('platform-user-42');
  });

  it('creates visitor with optional fields', async () => {
    const app = buildApp('VIEWER', 1);
    mockPrisma.visitor.create.mockResolvedValue(exampleVisitor);
    const res = await request(app)
      .post('/api/visitors')
      .send({
        guestName: 'Jane Doe',
        guestEmail: 'jane@example.com',
        guestPhone: '555-1234',
        purpose: 'Delivery',
        expectedDate: '2025-01-20T10:00:00Z',
        notes: 'Ring doorbell',
      });
    expect(res.status).toBe(201);
    const createArgs = mockPrisma.visitor.create.mock.calls[0][0];
    expect(createArgs.data.guestEmail).toBe('jane@example.com');
    expect(createArgs.data.guestPhone).toBe('555-1234');
    expect(createArgs.data.purpose).toBe('Delivery');
    expect(createArgs.data.notes).toBe('Ring doorbell');
  });
});

// ─── PUT /:id ────────────────────────────────────────────────────────────────

describe('PUT /api/visitors/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).put('/api/visitors/1').send({ notes: 'update' });
    expect(res.status).toBe(401);
  });

  it('returns 404 for non-existent id (UUIDs are strings, no format validation)', async () => {
    const app = buildApp('ADMIN');
    mockPrisma.visitor.findUnique.mockResolvedValue(null);
    const res = await request(app).put('/api/visitors/abc').send({ notes: 'x' });
    expect(res.status).toBe(404);
  });

  it('returns 404 when visitor not found', async () => {
    const app = buildApp('ADMIN');
    mockPrisma.visitor.findUnique.mockResolvedValue(null);
    const res = await request(app).put('/api/visitors/99').send({ notes: 'update' });
    expect(res.status).toBe(404);
  });

  it('returns 403 when VIEWER tries to update another user\'s visitor', async () => {
    const app = buildApp('VIEWER', 99);
    mockPrisma.visitor.findUnique.mockResolvedValue(exampleVisitor); // hostId: 1
    const res = await request(app).put('/api/visitors/1').send({ notes: 'hack' });
    expect(res.status).toBe(403);
  });

  it('allows VIEWER to update their own visitor', async () => {
    const app = buildApp('VIEWER', 1);
    mockPrisma.visitor.findUnique.mockResolvedValue(exampleVisitor);
    mockPrisma.visitor.update.mockResolvedValue({ ...exampleVisitor, notes: 'updated' });
    const res = await request(app).put('/api/visitors/1').send({ notes: 'updated' });
    expect(res.status).toBe(200);
    expect(res.body.notes).toBe('updated');
  });

  it('allows EDITOR to update any visitor', async () => {
    const app = buildApp('EDITOR', 99);
    mockPrisma.visitor.findUnique.mockResolvedValue(exampleVisitor); // different host
    mockPrisma.visitor.update.mockResolvedValue({ ...exampleVisitor, notes: 'editor update' });
    const res = await request(app).put('/api/visitors/1').send({ notes: 'editor update' });
    expect(res.status).toBe(200);
  });

  it('can cancel a visitor by setting status to CANCELLED', async () => {
    const app = buildApp('VIEWER', 1);
    mockPrisma.visitor.findUnique.mockResolvedValue(exampleVisitor);
    mockPrisma.visitor.update.mockResolvedValue({ ...exampleVisitor, status: 'CANCELLED' });
    const res = await request(app).put('/api/visitors/1').send({ status: 'CANCELLED' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');
  });

  it('returns 400 when trying to set invalid status', async () => {
    const app = buildApp('VIEWER', 1);
    mockPrisma.visitor.findUnique.mockResolvedValue(exampleVisitor);
    const res = await request(app).put('/api/visitors/1').send({ status: 'BOGUS' });
    expect(res.status).toBe(400);
  });
});

// ─── POST /:id/checkin ────────────────────────────────────────────────────────

describe('POST /api/visitors/:id/checkin', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).post('/api/visitors/1/checkin').send({});
    expect(res.status).toBe(401);
  });

  it('returns 403 for VIEWER role', async () => {
    const app = buildApp('VIEWER');
    const res = await request(app).post('/api/visitors/1/checkin').send({});
    expect(res.status).toBe(403);
  });

  it('returns 404 for non-existent id (UUIDs are strings, no format validation)', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.visitor.findUnique.mockResolvedValue(null);
    const res = await request(app).post('/api/visitors/abc/checkin').send({});
    expect(res.status).toBe(404);
  });

  it('returns 404 when visitor not found', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.visitor.findUnique.mockResolvedValue(null);
    const res = await request(app).post('/api/visitors/99/checkin').send({});
    expect(res.status).toBe(404);
  });

  it('returns 400 when visitor is already checked in', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.visitor.findUnique.mockResolvedValue({
      ...exampleVisitor,
      status: 'CHECKED_IN',
    });
    const res = await request(app).post('/api/visitors/1/checkin').send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already|checked in/i);
  });

  it('returns 400 when visitor is cancelled', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.visitor.findUnique.mockResolvedValue({
      ...exampleVisitor,
      status: 'CANCELLED',
    });
    const res = await request(app).post('/api/visitors/1/checkin').send({});
    expect(res.status).toBe(400);
  });

  it('checks in visitor and creates a log entry for EDITOR+', async () => {
    const app = buildApp('EDITOR', 5);
    mockPrisma.visitor.findUnique.mockResolvedValue({
      ...exampleVisitor,
      status: 'EXPECTED',
    });
    mockPrisma.visitor.update.mockResolvedValue({
      ...exampleVisitor,
      status: 'CHECKED_IN',
    });
    mockPrisma.visitorLog.create.mockResolvedValue({
      id: 1,
      visitorId: 1,
      action: 'CHECK_IN',
      performedBy: 5,
      timestamp: new Date().toISOString(),
      notes: null,
    });
    const res = await request(app).post('/api/visitors/1/checkin').send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CHECKED_IN');
    // Should create a log entry
    expect(mockPrisma.visitorLog.create).toHaveBeenCalledOnce();
    const logArgs = mockPrisma.visitorLog.create.mock.calls[0][0];
    expect(logArgs.data.action).toBe('CHECK_IN');
    expect(logArgs.data.performedBy).toBe('platform-user-5');
  });
});

// ─── POST /:id/checkout ───────────────────────────────────────────────────────

describe('POST /api/visitors/:id/checkout', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).post('/api/visitors/1/checkout').send({});
    expect(res.status).toBe(401);
  });

  it('returns 403 for VIEWER role', async () => {
    const app = buildApp('VIEWER');
    const res = await request(app).post('/api/visitors/1/checkout').send({});
    expect(res.status).toBe(403);
  });

  it('returns 404 when visitor not found', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.visitor.findUnique.mockResolvedValue(null);
    const res = await request(app).post('/api/visitors/99/checkout').send({});
    expect(res.status).toBe(404);
  });

  it('returns 400 when visitor is not checked in', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.visitor.findUnique.mockResolvedValue({
      ...exampleVisitor,
      status: 'EXPECTED',
    });
    const res = await request(app).post('/api/visitors/1/checkout').send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not checked in|must be/i);
  });

  it('checks out visitor and creates a log entry for EDITOR+', async () => {
    const app = buildApp('EDITOR', 5);
    mockPrisma.visitor.findUnique.mockResolvedValue({
      ...exampleVisitor,
      status: 'CHECKED_IN',
    });
    mockPrisma.visitor.update.mockResolvedValue({
      ...exampleVisitor,
      status: 'CHECKED_OUT',
    });
    mockPrisma.visitorLog.create.mockResolvedValue({
      id: 2,
      visitorId: 1,
      action: 'CHECK_OUT',
      performedBy: 5,
      timestamp: new Date().toISOString(),
      notes: null,
    });
    const res = await request(app).post('/api/visitors/1/checkout').send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CHECKED_OUT');
    expect(mockPrisma.visitorLog.create).toHaveBeenCalledOnce();
    const logArgs = mockPrisma.visitorLog.create.mock.calls[0][0];
    expect(logArgs.data.action).toBe('CHECK_OUT');
    expect(logArgs.data.performedBy).toBe('platform-user-5');
  });
});
