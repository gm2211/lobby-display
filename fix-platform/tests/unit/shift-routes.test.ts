/**
 * Unit tests for Security & Concierge Shift API routes (spec §4.16).
 *
 * Uses vi.mock to mock Prisma so no database is needed.
 * Tests cover: list, get, create, update, start, complete, cancel,
 * overlap/duration constraints, and key log CRUD.
 *
 * Auth model:
 *  - All routes require platformProtectStrict (PlatformUser loaded)
 *  - Shift creation/cancellation requires MANAGER role
 *  - Start/complete requires assignee or MANAGER
 *  - Key logs require SECURITY, CONCIERGE, or MANAGER role
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { errorHandler } from '../../server/middleware/errorHandler.js';

// Mock prisma before importing routes
vi.mock('../../server/db.js', () => ({
  default: {
    shift: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    keyLog: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    platformUser: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock shiftNotifier
vi.mock('../../server/services/shiftNotifier.js', () => ({
  notifyShiftUpdate: vi.fn(),
}));

import prisma from '../../server/db.js';
import shiftsRouter from '../../server/routes/platform/shifts.js';

const mockPrisma = prisma as {
  shift: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  keyLog: {
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  platformUser: {
    findUnique: ReturnType<typeof vi.fn>;
  };
};

/**
 * Build a minimal Express app with a session user.
 * sessionRole is the dashboard role (ADMIN/EDITOR/VIEWER).
 * platformRole is the PlatformUser role (MANAGER/RESIDENT/SECURITY/CONCIERGE).
 */
function buildApp(
  sessionRole: 'ADMIN' | 'EDITOR' | 'VIEWER' | null = 'ADMIN',
  platformUserId: string = 'platform-user-1',
  platformRole: 'RESIDENT' | 'BOARD_MEMBER' | 'MANAGER' | 'SECURITY' | 'CONCIERGE' = 'MANAGER'
) {
  const app = express();
  app.use(express.json());

  app.use((req: any, _res, next) => {
    if (sessionRole !== null) {
      req.session = { user: { id: 1, username: 'testuser', role: sessionRole } };
    } else {
      req.session = {};
    }
    next();
  });

  if (sessionRole !== null) {
    mockPrisma.platformUser.findUnique.mockResolvedValue({
      id: platformUserId,
      userId: 1,
      role: platformRole,
    } as any);
  }

  app.use('/api/platform/shifts', shiftsRouter);
  app.use(errorHandler);
  return app;
}

// Sample data fixtures
const now = new Date();
const twoHoursLater = new Date(now.getTime() + 2 * 3600000);

const sampleShift = {
  id: 'shift-uuid-1',
  assigneeId: 'platform-user-1',
  shiftType: 'SECURITY',
  status: 'SCHEDULED',
  startTime: now.toISOString(),
  endTime: twoHoursLater.toISOString(),
  notes: null,
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
  assignee: { id: 'platform-user-1', unitNumber: '1A', role: 'SECURITY', userId: 1 },
};

const sampleKeyLog = {
  id: 'key-uuid-1',
  shiftId: 'shift-uuid-1',
  keyName: 'Master Key A',
  action: 'CHECK_OUT',
  performedBy: 'platform-user-1',
  notes: null,
  createdAt: now.toISOString(),
  performer: { id: 'platform-user-1', unitNumber: '1A', role: 'SECURITY' },
};

describe('Shift Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── GET /api/platform/shifts ────────────────────────────────────────────
  describe('GET /api/platform/shifts', () => {
    it('returns list of shifts for authorized roles', async () => {
      const app = buildApp('ADMIN', 'platform-user-1', 'MANAGER');
      mockPrisma.shift.findMany.mockResolvedValue([sampleShift]);

      const res = await request(app).get('/api/platform/shifts');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe('shift-uuid-1');
    });

    it('filters by shiftType query param', async () => {
      const app = buildApp('ADMIN', 'platform-user-1', 'SECURITY');
      mockPrisma.shift.findMany.mockResolvedValue([sampleShift]);

      const res = await request(app).get('/api/platform/shifts?shiftType=SECURITY');
      expect(res.status).toBe(200);
      expect(mockPrisma.shift.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ shiftType: 'SECURITY' }),
        })
      );
    });

    it('rejects RESIDENT role with 403', async () => {
      const app = buildApp('ADMIN', 'platform-user-1', 'RESIDENT');

      const res = await request(app).get('/api/platform/shifts');
      expect(res.status).toBe(403);
    });
  });

  // ─── GET /api/platform/shifts/active ─────────────────────────────────────
  describe('GET /api/platform/shifts/active', () => {
    it('returns only IN_PROGRESS shifts', async () => {
      const app = buildApp('ADMIN', 'platform-user-1', 'MANAGER');
      const activeShift = { ...sampleShift, status: 'IN_PROGRESS' };
      mockPrisma.shift.findMany.mockResolvedValue([activeShift]);

      const res = await request(app).get('/api/platform/shifts/active');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].status).toBe('IN_PROGRESS');
    });
  });

  // ─── GET /api/platform/shifts/:id ────────────────────────────────────────
  describe('GET /api/platform/shifts/:id', () => {
    it('returns shift detail with key logs', async () => {
      const app = buildApp('ADMIN', 'platform-user-1', 'MANAGER');
      const shiftWithLogs = { ...sampleShift, keyLogs: [sampleKeyLog] };
      mockPrisma.shift.findUnique.mockResolvedValue(shiftWithLogs);

      const res = await request(app).get('/api/platform/shifts/shift-uuid-1');
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('shift-uuid-1');
      expect(res.body.keyLogs).toHaveLength(1);
    });

    it('returns 404 for nonexistent shift', async () => {
      const app = buildApp('ADMIN', 'platform-user-1', 'MANAGER');
      mockPrisma.shift.findUnique.mockResolvedValue(null);

      const res = await request(app).get('/api/platform/shifts/nonexistent');
      expect(res.status).toBe(404);
    });
  });

  // ─── POST /api/platform/shifts ───────────────────────────────────────────
  describe('POST /api/platform/shifts', () => {
    it('creates a shift successfully as MANAGER', async () => {
      const app = buildApp('ADMIN', 'platform-user-1', 'MANAGER');
      mockPrisma.platformUser.findUnique
        .mockResolvedValueOnce({ id: 'platform-user-1', userId: 1, role: 'MANAGER' }) // platformProtectStrict
        .mockResolvedValueOnce({ id: 'assignee-1', userId: 2, role: 'SECURITY' }); // assignee check
      mockPrisma.shift.findFirst.mockResolvedValue(null); // no overlap
      mockPrisma.shift.create.mockResolvedValue(sampleShift);

      const res = await request(app)
        .post('/api/platform/shifts')
        .send({
          assigneeId: 'assignee-1',
          shiftType: 'SECURITY',
          startTime: now.toISOString(),
          endTime: twoHoursLater.toISOString(),
        });
      expect(res.status).toBe(201);
      expect(res.body.id).toBe('shift-uuid-1');
    });

    it('rejects non-MANAGER with 403', async () => {
      const app = buildApp('ADMIN', 'platform-user-1', 'SECURITY');

      const res = await request(app)
        .post('/api/platform/shifts')
        .send({
          assigneeId: 'assignee-1',
          shiftType: 'SECURITY',
          startTime: now.toISOString(),
          endTime: twoHoursLater.toISOString(),
        });
      expect(res.status).toBe(403);
    });

    it('rejects shift shorter than 1 hour', async () => {
      const app = buildApp('ADMIN', 'platform-user-1', 'MANAGER');
      // No extra Once needed — validation fails before assignee lookup

      const shortEnd = new Date(now.getTime() + 30 * 60000); // 30 minutes
      const res = await request(app)
        .post('/api/platform/shifts')
        .send({
          assigneeId: 'assignee-1',
          shiftType: 'SECURITY',
          startTime: now.toISOString(),
          endTime: shortEnd.toISOString(),
        });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/at least/i);
    });

    it('rejects shift longer than 24 hours', async () => {
      const app = buildApp('ADMIN', 'platform-user-1', 'MANAGER');
      // No extra Once needed — validation fails before assignee lookup

      const longEnd = new Date(now.getTime() + 25 * 3600000); // 25 hours
      const res = await request(app)
        .post('/api/platform/shifts')
        .send({
          assigneeId: 'assignee-1',
          shiftType: 'SECURITY',
          startTime: now.toISOString(),
          endTime: longEnd.toISOString(),
        });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/exceed/i);
    });

    it('rejects overlapping shift for same assignee', async () => {
      const app = buildApp('ADMIN', 'platform-user-1', 'MANAGER');
      mockPrisma.platformUser.findUnique
        .mockResolvedValueOnce({ id: 'platform-user-1', userId: 1, role: 'MANAGER' })
        .mockResolvedValueOnce({ id: 'assignee-1', userId: 2, role: 'SECURITY' });
      mockPrisma.shift.findFirst.mockResolvedValue(sampleShift); // overlap found

      const res = await request(app)
        .post('/api/platform/shifts')
        .send({
          assigneeId: 'assignee-1',
          shiftType: 'SECURITY',
          startTime: now.toISOString(),
          endTime: twoHoursLater.toISOString(),
        });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/overlap/i);
    });

    it('rejects missing assigneeId', async () => {
      const app = buildApp('ADMIN', 'platform-user-1', 'MANAGER');

      const res = await request(app)
        .post('/api/platform/shifts')
        .send({
          shiftType: 'SECURITY',
          startTime: now.toISOString(),
          endTime: twoHoursLater.toISOString(),
        });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/assigneeId/i);
    });

    it('rejects invalid shiftType', async () => {
      const app = buildApp('ADMIN', 'platform-user-1', 'MANAGER');

      const res = await request(app)
        .post('/api/platform/shifts')
        .send({
          assigneeId: 'assignee-1',
          shiftType: 'INVALID',
          startTime: now.toISOString(),
          endTime: twoHoursLater.toISOString(),
        });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/shiftType/i);
    });
  });

  // ─── POST /api/platform/shifts/:id/start ─────────────────────────────────
  describe('POST /api/platform/shifts/:id/start', () => {
    it('starts a SCHEDULED shift for the assignee', async () => {
      const app = buildApp('ADMIN', 'platform-user-1', 'SECURITY');
      mockPrisma.shift.findUnique.mockResolvedValue(sampleShift);
      const started = { ...sampleShift, status: 'IN_PROGRESS' };
      mockPrisma.shift.update.mockResolvedValue(started);

      const res = await request(app).post('/api/platform/shifts/shift-uuid-1/start');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('IN_PROGRESS');
    });

    it('rejects starting a non-SCHEDULED shift', async () => {
      const app = buildApp('ADMIN', 'platform-user-1', 'SECURITY');
      mockPrisma.shift.findUnique.mockResolvedValue({ ...sampleShift, status: 'IN_PROGRESS' });

      const res = await request(app).post('/api/platform/shifts/shift-uuid-1/start');
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/SCHEDULED/i);
    });

    it('rejects non-assignee from starting shift', async () => {
      const app = buildApp('ADMIN', 'platform-user-other', 'SECURITY');
      mockPrisma.shift.findUnique.mockResolvedValue(sampleShift); // assigneeId is platform-user-1

      const res = await request(app).post('/api/platform/shifts/shift-uuid-1/start');
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/assigned/i);
    });
  });

  // ─── POST /api/platform/shifts/:id/complete ──────────────────────────────
  describe('POST /api/platform/shifts/:id/complete', () => {
    it('completes an IN_PROGRESS shift for the assignee', async () => {
      const app = buildApp('ADMIN', 'platform-user-1', 'SECURITY');
      const inProgress = { ...sampleShift, status: 'IN_PROGRESS' };
      mockPrisma.shift.findUnique.mockResolvedValue(inProgress);
      const completed = { ...sampleShift, status: 'COMPLETED' };
      mockPrisma.shift.update.mockResolvedValue(completed);

      const res = await request(app).post('/api/platform/shifts/shift-uuid-1/complete');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('COMPLETED');
    });

    it('rejects completing a non-IN_PROGRESS shift', async () => {
      const app = buildApp('ADMIN', 'platform-user-1', 'SECURITY');
      mockPrisma.shift.findUnique.mockResolvedValue(sampleShift); // SCHEDULED

      const res = await request(app).post('/api/platform/shifts/shift-uuid-1/complete');
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/IN_PROGRESS/i);
    });
  });

  // ─── POST /api/platform/shifts/:id/cancel ────────────────────────────────
  describe('POST /api/platform/shifts/:id/cancel', () => {
    it('cancels a shift as MANAGER', async () => {
      const app = buildApp('ADMIN', 'platform-user-1', 'MANAGER');
      mockPrisma.shift.findUnique.mockResolvedValue(sampleShift);
      const cancelled = { ...sampleShift, status: 'CANCELLED' };
      mockPrisma.shift.update.mockResolvedValue(cancelled);

      const res = await request(app).post('/api/platform/shifts/shift-uuid-1/cancel');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('CANCELLED');
    });

    it('rejects cancellation by non-MANAGER', async () => {
      const app = buildApp('ADMIN', 'platform-user-1', 'SECURITY');

      const res = await request(app).post('/api/platform/shifts/shift-uuid-1/cancel');
      expect(res.status).toBe(403);
    });

    it('rejects cancelling a COMPLETED shift', async () => {
      const app = buildApp('ADMIN', 'platform-user-1', 'MANAGER');
      mockPrisma.shift.findUnique.mockResolvedValue({ ...sampleShift, status: 'COMPLETED' });

      const res = await request(app).post('/api/platform/shifts/shift-uuid-1/cancel');
      expect(res.status).toBe(400);
    });
  });

  // ─── Key Log routes ──────────────────────────────────────────────────────
  describe('GET /api/platform/shifts/keys', () => {
    it('returns key logs for authorized roles', async () => {
      const app = buildApp('ADMIN', 'platform-user-1', 'CONCIERGE');
      mockPrisma.keyLog.findMany.mockResolvedValue([sampleKeyLog]);

      const res = await request(app).get('/api/platform/shifts/keys');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].keyName).toBe('Master Key A');
    });
  });

  describe('POST /api/platform/shifts/keys', () => {
    it('creates a key checkout log', async () => {
      const app = buildApp('ADMIN', 'platform-user-1', 'SECURITY');
      mockPrisma.keyLog.create.mockResolvedValue(sampleKeyLog);

      const res = await request(app)
        .post('/api/platform/shifts/keys')
        .send({ keyName: 'Master Key A', action: 'CHECK_OUT' });
      expect(res.status).toBe(201);
      expect(res.body.keyName).toBe('Master Key A');
      expect(res.body.action).toBe('CHECK_OUT');
    });

    it('creates a key return log', async () => {
      const app = buildApp('ADMIN', 'platform-user-1', 'CONCIERGE');
      const returnLog = { ...sampleKeyLog, action: 'RETURN' };
      mockPrisma.keyLog.create.mockResolvedValue(returnLog);

      const res = await request(app)
        .post('/api/platform/shifts/keys')
        .send({ keyName: 'Master Key A', action: 'RETURN' });
      expect(res.status).toBe(201);
      expect(res.body.action).toBe('RETURN');
    });

    it('rejects missing keyName', async () => {
      const app = buildApp('ADMIN', 'platform-user-1', 'SECURITY');

      const res = await request(app)
        .post('/api/platform/shifts/keys')
        .send({ action: 'CHECK_OUT' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/keyName/i);
    });

    it('rejects invalid action', async () => {
      const app = buildApp('ADMIN', 'platform-user-1', 'SECURITY');

      const res = await request(app)
        .post('/api/platform/shifts/keys')
        .send({ keyName: 'Master Key A', action: 'INVALID' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/action/i);
    });

    it('rejects invalid shiftId reference', async () => {
      const app = buildApp('ADMIN', 'platform-user-1', 'SECURITY');
      mockPrisma.shift.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/platform/shifts/keys')
        .send({ keyName: 'Master Key A', action: 'CHECK_OUT', shiftId: 'nonexistent' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/shiftId/i);
    });

    it('rejects RESIDENT role with 403', async () => {
      const app = buildApp('ADMIN', 'platform-user-1', 'RESIDENT');

      const res = await request(app)
        .post('/api/platform/shifts/keys')
        .send({ keyName: 'Master Key A', action: 'CHECK_OUT' });
      expect(res.status).toBe(403);
    });
  });

  // ─── Auth: unauthenticated access ────────────────────────────────────────
  describe('Unauthenticated access', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const app = buildApp(null);

      const res = await request(app).get('/api/platform/shifts');
      expect(res.status).toBe(401);
    });
  });
});
