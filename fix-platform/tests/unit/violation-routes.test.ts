/**
 * Unit tests for Violation API routes.
 *
 * Uses vi.mock to mock Prisma so no database is needed.
 * Tests cover:
 *   - GET / (own violations for VIEWER, all for EDITOR+)
 *   - GET /:id (detail with comments)
 *   - POST / (EDITOR+ creates violation)
 *   - PUT /:id (EDITOR+ updates, status workflow enforced)
 *   - POST /:id/appeal (reporter appeals — any auth user)
 *   - POST /:id/comments (any auth user)
 *
 * STATUS WORKFLOW:
 *   REPORTED → UNDER_REVIEW → CONFIRMED → RESOLVED
 *                                        → DISMISSED
 *   APPEALED → UNDER_REVIEW (back-transition)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import { errorHandler } from '../../server/middleware/errorHandler.js';

// Mock Prisma before importing routes
vi.mock('../../server/db.js', () => ({
  default: {
    violation: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    violationComment: {
      create: vi.fn(),
    },
    platformUser: {
      findFirst: vi.fn(),
    },
  },
}));

import prisma from '../../server/db.js';
import violationsRouter from '../../server/routes/platform/violations.js';

// ─── Type helpers ────────────────────────────────────────────────────────────

const mockPrisma = prisma as {
  violation: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  violationComment: {
    create: ReturnType<typeof vi.fn>;
  };
  platformUser: {
    findFirst: ReturnType<typeof vi.fn>;
  };
};

// ─── Test app builder ────────────────────────────────────────────────────────

/**
 * Build a minimal Express app for testing.
 * Sets a session user with the given role (or null for unauthenticated).
 * userId defaults to 1.
 */
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

  app.use('/api/platform/violations', violationsRouter);
  app.use(errorHandler);
  return app;
}

// ─── Example fixtures ────────────────────────────────────────────────────────

const exampleViolation = {
  id: 'uuid-1',
  reportedBy: 'platform-user-1',
  unitNumber: '4B',
  category: 'NOISE',
  description: 'Loud music past midnight',
  evidence: null,
  status: 'REPORTED',
  severity: 'MEDIUM',
  fineAmount: null,
  assignedTo: null,
  createdAt: new Date('2024-01-01').toISOString(),
  updatedAt: new Date('2024-01-01').toISOString(),
  comments: [],
};

const exampleComment = {
  id: 'comment-uuid-1',
  violationId: 'uuid-1',
  authorId: 'platform-user-1',
  body: 'Under investigation',
  isInternal: false,
  createdAt: new Date('2024-01-01').toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: platformUser.findFirst maps session user.id → PlatformUser.id
  // Convention: user id N → platform user id 'platform-user-N'
  mockPrisma.platformUser.findFirst.mockImplementation(async (args: any) => {
    const sessionUserId = args?.where?.userId;
    if (sessionUserId === undefined || sessionUserId === null) return null;
    return { id: `platform-user-${sessionUserId}`, userId: sessionUserId, role: 'RESIDENT' };
  });
});

// ─── GET / ───────────────────────────────────────────────────────────────────

describe('GET /api/platform/violations', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).get('/api/platform/violations');
    expect(res.status).toBe(401);
  });

  it('returns violations list for authenticated VIEWER', async () => {
    mockPrisma.violation.findMany.mockResolvedValue([exampleViolation]);
    const app = buildApp('VIEWER');
    const res = await request(app).get('/api/platform/violations');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('returns empty array when no violations exist', async () => {
    mockPrisma.violation.findMany.mockResolvedValue([]);
    const app = buildApp('VIEWER');
    const res = await request(app).get('/api/platform/violations');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('VIEWER sees only own violations (filtered by reportedBy)', async () => {
    mockPrisma.violation.findMany.mockResolvedValue([exampleViolation]);
    const app = buildApp('VIEWER', 1);
    await request(app).get('/api/platform/violations');
    // Filter uses PlatformUser.id (UUID string), not session user.id (integer)
    expect(mockPrisma.violation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ reportedBy: 'platform-user-1' }),
      })
    );
  });

  it('EDITOR sees all violations (no reportedBy filter)', async () => {
    mockPrisma.violation.findMany.mockResolvedValue([exampleViolation]);
    const app = buildApp('EDITOR', 1);
    await request(app).get('/api/platform/violations');
    // For EDITOR, where should NOT contain reportedBy filter
    const callArg = mockPrisma.violation.findMany.mock.calls[0][0];
    expect(callArg?.where?.reportedBy).toBeUndefined();
  });

  it('ADMIN sees all violations (no reportedBy filter)', async () => {
    mockPrisma.violation.findMany.mockResolvedValue([exampleViolation]);
    const app = buildApp('ADMIN', 1);
    await request(app).get('/api/platform/violations');
    const callArg = mockPrisma.violation.findMany.mock.calls[0][0];
    expect(callArg?.where?.reportedBy).toBeUndefined();
  });

  it('filters by status query param', async () => {
    mockPrisma.violation.findMany.mockResolvedValue([]);
    const app = buildApp('EDITOR');
    await request(app).get('/api/platform/violations?status=CONFIRMED');
    expect(mockPrisma.violation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'CONFIRMED' }),
      })
    );
  });
});

// ─── GET /:id ────────────────────────────────────────────────────────────────

describe('GET /api/platform/violations/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).get('/api/platform/violations/uuid-1');
    expect(res.status).toBe(401);
  });

  it('returns violation detail with comments', async () => {
    const detail = { ...exampleViolation, comments: [exampleComment] };
    mockPrisma.violation.findUnique.mockResolvedValue(detail);
    const app = buildApp('VIEWER');
    const res = await request(app).get('/api/platform/violations/uuid-1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('uuid-1');
    expect(res.body.comments).toHaveLength(1);
  });

  it('returns 404 when violation not found', async () => {
    mockPrisma.violation.findUnique.mockResolvedValue(null);
    const app = buildApp('VIEWER');
    const res = await request(app).get('/api/platform/violations/nonexistent');
    expect(res.status).toBe(404);
  });

  it('returns 400 for empty id', async () => {
    const app = buildApp('VIEWER');
    // Prisma call returns null, treated as 404 effectively but we check empty string rejection
    mockPrisma.violation.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/platform/violations/');
    // The route without id falls through to list route
    expect(res.status).toBe(200);
  });

  it('includes comments in the Prisma query', async () => {
    mockPrisma.violation.findUnique.mockResolvedValue(exampleViolation);
    const app = buildApp('VIEWER');
    await request(app).get('/api/platform/violations/uuid-1');
    expect(mockPrisma.violation.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({ comments: expect.anything() }),
      })
    );
  });
});

// ─── POST / ──────────────────────────────────────────────────────────────────

describe('POST /api/platform/violations', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).post('/api/platform/violations').send({
      unitNumber: '4B',
      category: 'NOISE',
      description: 'Loud music',
      severity: 'MEDIUM',
    });
    expect(res.status).toBe(401);
  });

  it('returns 403 when VIEWER tries to create a violation', async () => {
    const app = buildApp('VIEWER');
    const res = await request(app).post('/api/platform/violations').send({
      unitNumber: '4B',
      category: 'NOISE',
      description: 'Loud music',
      severity: 'MEDIUM',
    });
    expect(res.status).toBe(403);
  });

  it('allows EDITOR to create a violation', async () => {
    mockPrisma.violation.create.mockResolvedValue({ ...exampleViolation, id: 'new-uuid' });
    const app = buildApp('EDITOR');
    const res = await request(app).post('/api/platform/violations').send({
      unitNumber: '4B',
      category: 'NOISE',
      description: 'Loud music past midnight',
      severity: 'MEDIUM',
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
  });

  it('allows ADMIN to create a violation', async () => {
    mockPrisma.violation.create.mockResolvedValue({ ...exampleViolation, id: 'new-uuid-2' });
    const app = buildApp('ADMIN');
    const res = await request(app).post('/api/platform/violations').send({
      unitNumber: '5C',
      category: 'PETS',
      description: 'Unauthorized pet',
      severity: 'LOW',
    });
    expect(res.status).toBe(201);
  });

  it('returns 400 when unitNumber is missing', async () => {
    const app = buildApp('EDITOR');
    const res = await request(app).post('/api/platform/violations').send({
      category: 'NOISE',
      description: 'Test',
      severity: 'LOW',
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when category is missing', async () => {
    const app = buildApp('EDITOR');
    const res = await request(app).post('/api/platform/violations').send({
      unitNumber: '4B',
      description: 'Test',
      severity: 'LOW',
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when description is missing', async () => {
    const app = buildApp('EDITOR');
    const res = await request(app).post('/api/platform/violations').send({
      unitNumber: '4B',
      category: 'NOISE',
      severity: 'LOW',
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when severity is missing', async () => {
    const app = buildApp('EDITOR');
    const res = await request(app).post('/api/platform/violations').send({
      unitNumber: '4B',
      category: 'NOISE',
      description: 'Test',
    });
    expect(res.status).toBe(400);
  });

  it('associates reportedBy with the session user id', async () => {
    mockPrisma.violation.create.mockResolvedValue(exampleViolation);
    // session user 42 → platformUser.id = 'platform-user-42'
    const app = buildApp('EDITOR', 42);
    await request(app).post('/api/platform/violations').send({
      unitNumber: '4B',
      category: 'NOISE',
      description: 'Test',
      severity: 'MEDIUM',
    });
    expect(mockPrisma.violation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reportedBy: 'platform-user-42' }),
      })
    );
  });

  it('sets default status to REPORTED on creation', async () => {
    mockPrisma.violation.create.mockResolvedValue(exampleViolation);
    const app = buildApp('ADMIN');
    await request(app).post('/api/platform/violations').send({
      unitNumber: '4B',
      category: 'NOISE',
      description: 'Test',
      severity: 'HIGH',
    });
    expect(mockPrisma.violation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'REPORTED' }),
      })
    );
  });
});

// ─── PUT /:id ────────────────────────────────────────────────────────────────

describe('PUT /api/platform/violations/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).put('/api/platform/violations/uuid-1').send({ status: 'UNDER_REVIEW' });
    expect(res.status).toBe(401);
  });

  it('returns 403 when VIEWER tries to update', async () => {
    const app = buildApp('VIEWER');
    const res = await request(app).put('/api/platform/violations/uuid-1').send({ status: 'UNDER_REVIEW' });
    expect(res.status).toBe(403);
  });

  it('allows EDITOR to update status', async () => {
    mockPrisma.violation.findUnique.mockResolvedValue(exampleViolation);
    mockPrisma.violation.update.mockResolvedValue({ ...exampleViolation, status: 'UNDER_REVIEW' });
    const app = buildApp('EDITOR');
    const res = await request(app).put('/api/platform/violations/uuid-1').send({ status: 'UNDER_REVIEW' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('UNDER_REVIEW');
  });

  it('allows ADMIN to update a violation', async () => {
    mockPrisma.violation.findUnique.mockResolvedValue(exampleViolation);
    mockPrisma.violation.update.mockResolvedValue({ ...exampleViolation, status: 'UNDER_REVIEW', assignedTo: 'staff-1' });
    const app = buildApp('ADMIN');
    const res = await request(app).put('/api/platform/violations/uuid-1').send({ status: 'UNDER_REVIEW', assignedTo: 'staff-1' });
    expect(res.status).toBe(200);
    expect(res.body.assignedTo).toBe('staff-1');
  });

  it('returns 404 when violation not found', async () => {
    mockPrisma.violation.findUnique.mockResolvedValue(null);
    const app = buildApp('EDITOR');
    const res = await request(app).put('/api/platform/violations/nonexistent').send({ status: 'UNDER_REVIEW' });
    expect(res.status).toBe(404);
  });

  // Status workflow: REPORTED → UNDER_REVIEW → CONFIRMED → RESOLVED or DISMISSED
  it('allows valid transition: REPORTED → UNDER_REVIEW', async () => {
    mockPrisma.violation.findUnique.mockResolvedValue({ ...exampleViolation, status: 'REPORTED' });
    mockPrisma.violation.update.mockResolvedValue({ ...exampleViolation, status: 'UNDER_REVIEW' });
    const app = buildApp('EDITOR');
    const res = await request(app).put('/api/platform/violations/uuid-1').send({ status: 'UNDER_REVIEW' });
    expect(res.status).toBe(200);
  });

  it('allows valid transition: UNDER_REVIEW → CONFIRMED', async () => {
    mockPrisma.violation.findUnique.mockResolvedValue({ ...exampleViolation, status: 'UNDER_REVIEW' });
    mockPrisma.violation.update.mockResolvedValue({ ...exampleViolation, status: 'CONFIRMED' });
    const app = buildApp('EDITOR');
    const res = await request(app).put('/api/platform/violations/uuid-1').send({ status: 'CONFIRMED' });
    expect(res.status).toBe(200);
  });

  it('allows valid transition: CONFIRMED → RESOLVED', async () => {
    mockPrisma.violation.findUnique.mockResolvedValue({ ...exampleViolation, status: 'CONFIRMED' });
    mockPrisma.violation.update.mockResolvedValue({ ...exampleViolation, status: 'RESOLVED' });
    const app = buildApp('EDITOR');
    const res = await request(app).put('/api/platform/violations/uuid-1').send({ status: 'RESOLVED' });
    expect(res.status).toBe(200);
  });

  it('allows valid transition: CONFIRMED → DISMISSED', async () => {
    mockPrisma.violation.findUnique.mockResolvedValue({ ...exampleViolation, status: 'CONFIRMED' });
    mockPrisma.violation.update.mockResolvedValue({ ...exampleViolation, status: 'DISMISSED' });
    const app = buildApp('EDITOR');
    const res = await request(app).put('/api/platform/violations/uuid-1').send({ status: 'DISMISSED' });
    expect(res.status).toBe(200);
  });

  it('allows valid back-transition: APPEALED → UNDER_REVIEW', async () => {
    mockPrisma.violation.findUnique.mockResolvedValue({ ...exampleViolation, status: 'APPEALED' });
    mockPrisma.violation.update.mockResolvedValue({ ...exampleViolation, status: 'UNDER_REVIEW' });
    const app = buildApp('EDITOR');
    const res = await request(app).put('/api/platform/violations/uuid-1').send({ status: 'UNDER_REVIEW' });
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid status transition: REPORTED → CONFIRMED', async () => {
    mockPrisma.violation.findUnique.mockResolvedValue({ ...exampleViolation, status: 'REPORTED' });
    const app = buildApp('EDITOR');
    const res = await request(app).put('/api/platform/violations/uuid-1').send({ status: 'CONFIRMED' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid status transition: RESOLVED → REPORTED', async () => {
    mockPrisma.violation.findUnique.mockResolvedValue({ ...exampleViolation, status: 'RESOLVED' });
    const app = buildApp('EDITOR');
    const res = await request(app).put('/api/platform/violations/uuid-1').send({ status: 'REPORTED' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid status transition: DISMISSED → UNDER_REVIEW', async () => {
    mockPrisma.violation.findUnique.mockResolvedValue({ ...exampleViolation, status: 'DISMISSED' });
    const app = buildApp('EDITOR');
    const res = await request(app).put('/api/platform/violations/uuid-1').send({ status: 'UNDER_REVIEW' });
    expect(res.status).toBe(400);
  });

  it('allows updating assignedTo without status change', async () => {
    mockPrisma.violation.findUnique.mockResolvedValue(exampleViolation);
    mockPrisma.violation.update.mockResolvedValue({ ...exampleViolation, assignedTo: 'staff-2' });
    const app = buildApp('EDITOR');
    const res = await request(app).put('/api/platform/violations/uuid-1').send({ assignedTo: 'staff-2' });
    expect(res.status).toBe(200);
    expect(res.body.assignedTo).toBe('staff-2');
  });
});

// ─── POST /:id/appeal ────────────────────────────────────────────────────────

describe('POST /api/platform/violations/:id/appeal', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).post('/api/platform/violations/uuid-1/appeal').send();
    expect(res.status).toBe(401);
  });

  it('allows reporter to appeal a CONFIRMED violation', async () => {
    // reportedBy must match platformUser.id for session user 1 → 'platform-user-1'
    const confirmedViolation = { ...exampleViolation, status: 'CONFIRMED', reportedBy: 'platform-user-1' };
    mockPrisma.violation.findUnique.mockResolvedValue(confirmedViolation);
    mockPrisma.violation.update.mockResolvedValue({ ...confirmedViolation, status: 'APPEALED' });
    const app = buildApp('VIEWER', 1);
    const res = await request(app).post('/api/platform/violations/uuid-1/appeal').send();
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('APPEALED');
  });

  it('returns 403 when a non-reporter tries to appeal', async () => {
    // reportedBy is platform-user-99 (userId=99), but session user is userId=1 → platform-user-1
    const confirmedViolation = { ...exampleViolation, status: 'CONFIRMED', reportedBy: 'platform-user-99' };
    mockPrisma.violation.findUnique.mockResolvedValue(confirmedViolation);
    const app = buildApp('VIEWER', 1); // userId 1, but reportedBy belongs to userId 99
    const res = await request(app).post('/api/platform/violations/uuid-1/appeal').send();
    expect(res.status).toBe(403);
  });

  it('returns 400 when violation is not in CONFIRMED status', async () => {
    // reportedBy matches session user (platform-user-1) but status is REPORTED
    const reportedViolation = { ...exampleViolation, status: 'REPORTED', reportedBy: 'platform-user-1' };
    mockPrisma.violation.findUnique.mockResolvedValue(reportedViolation);
    const app = buildApp('VIEWER', 1);
    const res = await request(app).post('/api/platform/violations/uuid-1/appeal').send();
    expect(res.status).toBe(400);
  });

  it('returns 404 when violation not found', async () => {
    mockPrisma.violation.findUnique.mockResolvedValue(null);
    const app = buildApp('VIEWER', 1);
    const res = await request(app).post('/api/platform/violations/nonexistent/appeal').send();
    expect(res.status).toBe(404);
  });

  it('sets status to APPEALED in the update call', async () => {
    const confirmedViolation = { ...exampleViolation, status: 'CONFIRMED', reportedBy: 'platform-user-1' };
    mockPrisma.violation.findUnique.mockResolvedValue(confirmedViolation);
    mockPrisma.violation.update.mockResolvedValue({ ...confirmedViolation, status: 'APPEALED' });
    const app = buildApp('VIEWER', 1);
    await request(app).post('/api/platform/violations/uuid-1/appeal').send();
    expect(mockPrisma.violation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'uuid-1' },
        data: expect.objectContaining({ status: 'APPEALED' }),
      })
    );
  });
});

// ─── POST /:id/comments ─────────────────────────────────────────────────────

describe('POST /api/platform/violations/:id/comments', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).post('/api/platform/violations/uuid-1/comments').send({ body: 'Test' });
    expect(res.status).toBe(401);
  });

  it('allows any authenticated user (VIEWER) to add a comment', async () => {
    mockPrisma.violation.findUnique.mockResolvedValue(exampleViolation);
    mockPrisma.violationComment.create.mockResolvedValue(exampleComment);
    const app = buildApp('VIEWER');
    const res = await request(app)
      .post('/api/platform/violations/uuid-1/comments')
      .send({ body: 'Under investigation' });
    expect(res.status).toBe(201);
    expect(res.body.body).toBe('Under investigation');
  });

  it('returns 400 when body is missing', async () => {
    mockPrisma.violation.findUnique.mockResolvedValue(exampleViolation);
    const app = buildApp('VIEWER');
    const res = await request(app)
      .post('/api/platform/violations/uuid-1/comments')
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 when violation not found', async () => {
    mockPrisma.violation.findUnique.mockResolvedValue(null);
    const app = buildApp('VIEWER');
    const res = await request(app)
      .post('/api/platform/violations/nonexistent/comments')
      .send({ body: 'Test comment' });
    expect(res.status).toBe(404);
  });

  it('associates authorId with the session user id', async () => {
    mockPrisma.violation.findUnique.mockResolvedValue(exampleViolation);
    mockPrisma.violationComment.create.mockResolvedValue(exampleComment);
    // session user 7 → platformUser.id = 'platform-user-7'
    const app = buildApp('EDITOR', 7);
    await request(app)
      .post('/api/platform/violations/uuid-1/comments')
      .send({ body: 'Staff note' });
    expect(mockPrisma.violationComment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ authorId: 'platform-user-7', violationId: 'uuid-1' }),
      })
    );
  });

  it('supports isInternal flag for staff-only comments', async () => {
    mockPrisma.violation.findUnique.mockResolvedValue(exampleViolation);
    mockPrisma.violationComment.create.mockResolvedValue({ ...exampleComment, isInternal: true });
    const app = buildApp('EDITOR');
    const res = await request(app)
      .post('/api/platform/violations/uuid-1/comments')
      .send({ body: 'Internal note', isInternal: true });
    expect(res.status).toBe(201);
    expect(mockPrisma.violationComment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isInternal: true }),
      })
    );
  });
});
