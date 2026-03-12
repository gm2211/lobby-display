/**
 * Unit tests for Booking CRUD API routes.
 *
 * Uses vi.mock to mock Prisma and bookingRules so no database is needed.
 * Tests follow TDD: written first, then routes are implemented.
 *
 * Routes tested:
 *  - POST /           - create booking (validates via bookingRules, sets status based on requiresApproval)
 *  - GET /            - list own bookings; MANAGER+ can see all
 *  - GET /:id         - single booking detail
 *  - PUT /:id/approve - MANAGER+ approves a PENDING booking
 *  - PUT /:id/reject  - MANAGER+ rejects a PENDING booking (with optional reason)
 *  - PUT /:id/cancel  - cancel own booking, or MANAGER+ can cancel any
 *
 * Auth model:
 *  - All routes require authentication (any role)
 *  - Approve/reject require MANAGER+ platform role
 *  - Cancel can be done by owner or MANAGER+
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { errorHandler } from '../../server/middleware/errorHandler.js';

// Mock Prisma before importing routes
vi.mock('../../server/db.js', () => ({
  default: {
    booking: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    amenity: {
      findUnique: vi.fn(),
    },
    platformUser: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock bookingRules service
vi.mock('../../server/services/bookingRules.js', () => ({
  validateBooking: vi.fn(),
}));

import prisma from '../../server/db.js';
import * as bookingRules from '../../server/services/bookingRules.js';
import bookingsRouter from '../../server/routes/platform/bookings.js';

// Type helpers for mocked Prisma functions
const mockPrisma = prisma as {
  booking: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  amenity: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  platformUser: {
    findUnique: ReturnType<typeof vi.fn>;
  };
};

const mockValidateBooking = bookingRules.validateBooking as ReturnType<typeof vi.fn>;

/**
 * Build a minimal Express app with a session user.
 * sessionRole is the dashboard role (ADMIN/EDITOR/VIEWER).
 * platformRole is the PlatformUser role (MANAGER/RESIDENT/etc).
 */
function buildApp(
  sessionRole: 'ADMIN' | 'EDITOR' | 'VIEWER' | null = 'ADMIN',
  userId: string = 'user-uuid-1',
  platformRole: 'RESIDENT' | 'BOARD_MEMBER' | 'MANAGER' | 'SECURITY' | 'CONCIERGE' = 'RESIDENT'
) {
  const app = express();
  app.use(express.json());

  // Inject mock session
  app.use((req: any, _res, next) => {
    if (sessionRole !== null) {
      req.session = { user: { id: userId, username: 'testuser', role: sessionRole } };
    } else {
      req.session = {};
    }
    next();
  });

  // Set platformUser mock for platformProtectStrict middleware
  if (sessionRole !== null) {
    mockPrisma.platformUser.findUnique.mockResolvedValue({
      id: 'platform-user-uuid-1',
      userId,
      role: platformRole,
    } as any);
  }

  app.use('/api/platform/bookings', bookingsRouter);
  app.use(errorHandler);
  return app;
}

// Sample data fixtures
const sampleAmenity = {
  id: 'amenity-uuid-1',
  name: 'Rooftop Pool',
  description: 'Heated pool on floor 30',
  requiresApproval: false,
  capacity: 10,
  active: true,
};

const sampleBooking = {
  id: 'booking-uuid-1',
  amenityId: 'amenity-uuid-1',
  userId: 'platform-user-uuid-1',
  startTime: new Date('2026-03-01T10:00:00Z'),
  endTime: new Date('2026-03-01T11:00:00Z'),
  status: 'APPROVED',
  notes: 'Pool booking',
  approvedBy: null,
  approvedAt: null,
  cancellationReason: null,
  createdAt: new Date('2026-02-01T12:00:00Z'),
  updatedAt: new Date('2026-02-01T12:00:00Z'),
  amenity: sampleAmenity,
};

const pendingBooking = {
  ...sampleBooking,
  id: 'booking-uuid-2',
  status: 'PENDING',
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: validation passes
  mockValidateBooking.mockResolvedValue({ valid: true, errors: [] });
  // Default: amenity found, no approval required
  mockPrisma.amenity.findUnique.mockResolvedValue(sampleAmenity);
  // Default: platformUser found
  mockPrisma.platformUser.findUnique.mockResolvedValue({
    id: 'platform-user-uuid-1',
    userId: 'user-uuid-1',
    role: 'RESIDENT',
  });
});

// ─── POST / ───────────────────────────────────────────────────────────────────

describe('POST /api/platform/bookings', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app)
      .post('/api/platform/bookings')
      .send({
        amenityId: 'amenity-uuid-1',
        startTime: '2026-03-01T10:00:00Z',
        endTime: '2026-03-01T11:00:00Z',
      });
    expect(res.status).toBe(401);
  });

  it('returns 400 when amenityId is missing', async () => {
    const app = buildApp('VIEWER');
    const res = await request(app)
      .post('/api/platform/bookings')
      .send({
        startTime: '2026-03-01T10:00:00Z',
        endTime: '2026-03-01T11:00:00Z',
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/amenityId/i);
  });

  it('returns 400 when startTime is missing', async () => {
    const app = buildApp('VIEWER');
    const res = await request(app)
      .post('/api/platform/bookings')
      .send({
        amenityId: 'amenity-uuid-1',
        endTime: '2026-03-01T11:00:00Z',
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/startTime/i);
  });

  it('returns 400 when endTime is missing', async () => {
    const app = buildApp('VIEWER');
    const res = await request(app)
      .post('/api/platform/bookings')
      .send({
        amenityId: 'amenity-uuid-1',
        startTime: '2026-03-01T10:00:00Z',
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/endTime/i);
  });

  it('returns 404 when amenity is not found', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.amenity.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/platform/bookings')
      .send({
        amenityId: 'nonexistent-amenity',
        startTime: '2026-03-01T10:00:00Z',
        endTime: '2026-03-01T11:00:00Z',
      });
    expect(res.status).toBe(404);
  });

  it('returns 422 when booking validation fails', async () => {
    const app = buildApp('VIEWER');
    mockValidateBooking.mockResolvedValue({
      valid: false,
      errors: ['Booking requires at least 1 hour(s) advance notice'],
    });
    const res = await request(app)
      .post('/api/platform/bookings')
      .send({
        amenityId: 'amenity-uuid-1',
        startTime: '2026-03-01T10:00:00Z',
        endTime: '2026-03-01T11:00:00Z',
      });
    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('errors');
  });

  it('creates booking with APPROVED status when amenity does not require approval', async () => {
    const app = buildApp('VIEWER', 'user-uuid-1', 'RESIDENT');
    mockPrisma.amenity.findUnique.mockResolvedValue({ ...sampleAmenity, requiresApproval: false });
    mockPrisma.booking.create.mockResolvedValue({ ...sampleBooking, status: 'APPROVED' });

    const res = await request(app)
      .post('/api/platform/bookings')
      .send({
        amenityId: 'amenity-uuid-1',
        startTime: '2026-03-01T10:00:00Z',
        endTime: '2026-03-01T11:00:00Z',
      });

    expect(res.status).toBe(201);
    const createArgs = mockPrisma.booking.create.mock.calls[0][0];
    expect(createArgs.data.status).toBe('APPROVED');
  });

  it('creates booking with PENDING status when amenity requires approval', async () => {
    const app = buildApp('VIEWER', 'user-uuid-1', 'RESIDENT');
    mockPrisma.amenity.findUnique.mockResolvedValue({ ...sampleAmenity, requiresApproval: true });
    mockPrisma.booking.create.mockResolvedValue({ ...sampleBooking, status: 'PENDING' });

    const res = await request(app)
      .post('/api/platform/bookings')
      .send({
        amenityId: 'amenity-uuid-1',
        startTime: '2026-03-01T10:00:00Z',
        endTime: '2026-03-01T11:00:00Z',
      });

    expect(res.status).toBe(201);
    const createArgs = mockPrisma.booking.create.mock.calls[0][0];
    expect(createArgs.data.status).toBe('PENDING');
  });

  it('passes correct userId (platformUser.id) to create', async () => {
    const app = buildApp('VIEWER', 'user-uuid-1', 'RESIDENT');
    mockPrisma.booking.create.mockResolvedValue(sampleBooking);

    await request(app)
      .post('/api/platform/bookings')
      .send({
        amenityId: 'amenity-uuid-1',
        startTime: '2026-03-01T10:00:00Z',
        endTime: '2026-03-01T11:00:00Z',
      });

    const createArgs = mockPrisma.booking.create.mock.calls[0][0];
    expect(createArgs.data.userId).toBe('platform-user-uuid-1');
  });

  it('passes optional notes to create', async () => {
    const app = buildApp('VIEWER', 'user-uuid-1', 'RESIDENT');
    mockPrisma.booking.create.mockResolvedValue({ ...sampleBooking, notes: 'Birthday party' });

    await request(app)
      .post('/api/platform/bookings')
      .send({
        amenityId: 'amenity-uuid-1',
        startTime: '2026-03-01T10:00:00Z',
        endTime: '2026-03-01T11:00:00Z',
        notes: 'Birthday party',
      });

    const createArgs = mockPrisma.booking.create.mock.calls[0][0];
    expect(createArgs.data.notes).toBe('Birthday party');
  });

  it('calls validateBooking with correct params', async () => {
    const app = buildApp('VIEWER', 'user-uuid-1', 'RESIDENT');
    mockPrisma.booking.create.mockResolvedValue(sampleBooking);

    await request(app)
      .post('/api/platform/bookings')
      .send({
        amenityId: 'amenity-uuid-1',
        startTime: '2026-03-01T10:00:00Z',
        endTime: '2026-03-01T11:00:00Z',
      });

    expect(mockValidateBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        amenityId: 'amenity-uuid-1',
        userId: 'platform-user-uuid-1',
        userRole: 'RESIDENT',
        startTime: expect.any(Date),
        endTime: expect.any(Date),
      }),
    );
  });
});

// ─── GET / ────────────────────────────────────────────────────────────────────

describe('GET /api/platform/bookings', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).get('/api/platform/bookings');
    expect(res.status).toBe(401);
  });

  it('returns only own bookings for a RESIDENT', async () => {
    const app = buildApp('VIEWER', 'user-uuid-1', 'RESIDENT');
    mockPrisma.booking.findMany.mockResolvedValue([sampleBooking]);

    const res = await request(app).get('/api/platform/bookings');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const callArgs = mockPrisma.booking.findMany.mock.calls[0][0];
    expect(callArgs.where).toMatchObject({ userId: 'platform-user-uuid-1' });
  });

  it('returns all bookings for MANAGER role', async () => {
    const app = buildApp('ADMIN', 'user-uuid-1', 'MANAGER');
    mockPrisma.booking.findMany.mockResolvedValue([sampleBooking, pendingBooking]);

    const res = await request(app).get('/api/platform/bookings');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    // MANAGER should not have userId filter
    const callArgs = mockPrisma.booking.findMany.mock.calls[0][0];
    expect(callArgs.where).not.toHaveProperty('userId');
  });

  it('includes amenity details in response', async () => {
    const app = buildApp('VIEWER', 'user-uuid-1', 'RESIDENT');
    mockPrisma.booking.findMany.mockResolvedValue([sampleBooking]);

    await request(app).get('/api/platform/bookings');

    const callArgs = mockPrisma.booking.findMany.mock.calls[0][0];
    expect(callArgs.include).toHaveProperty('amenity');
  });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────

describe('GET /api/platform/bookings/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).get('/api/platform/bookings/booking-uuid-1');
    expect(res.status).toBe(401);
  });

  it('returns 404 when booking not found', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.booking.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/platform/bookings/nonexistent-id');
    expect(res.status).toBe(404);
  });

  it('returns booking for owner', async () => {
    const app = buildApp('VIEWER', 'user-uuid-1', 'RESIDENT');
    mockPrisma.booking.findUnique.mockResolvedValue(sampleBooking);
    const res = await request(app).get('/api/platform/bookings/booking-uuid-1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('booking-uuid-1');
  });

  it('returns 403 when non-owner non-manager tries to access another user booking', async () => {
    // Booking belongs to a different platform user
    const app = buildApp('VIEWER', 'user-uuid-1', 'RESIDENT');
    const otherUserBooking = {
      ...sampleBooking,
      userId: 'other-platform-user-uuid',
    };
    mockPrisma.booking.findUnique.mockResolvedValue(otherUserBooking);

    const res = await request(app).get('/api/platform/bookings/booking-uuid-1');
    expect(res.status).toBe(403);
  });

  it('returns booking for MANAGER even if not owner', async () => {
    const app = buildApp('ADMIN', 'user-uuid-1', 'MANAGER');
    const otherUserBooking = {
      ...sampleBooking,
      userId: 'other-platform-user-uuid',
    };
    mockPrisma.booking.findUnique.mockResolvedValue(otherUserBooking);

    const res = await request(app).get('/api/platform/bookings/booking-uuid-1');
    expect(res.status).toBe(200);
  });

  it('includes amenity details in response', async () => {
    const app = buildApp('VIEWER', 'user-uuid-1', 'RESIDENT');
    mockPrisma.booking.findUnique.mockResolvedValue(sampleBooking);

    await request(app).get('/api/platform/bookings/booking-uuid-1');

    const callArgs = mockPrisma.booking.findUnique.mock.calls[0][0];
    expect(callArgs.include).toHaveProperty('amenity');
  });
});

// ─── PUT /:id/approve ─────────────────────────────────────────────────────────

describe('PUT /api/platform/bookings/:id/approve', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).put('/api/platform/bookings/booking-uuid-2/approve');
    expect(res.status).toBe(401);
  });

  it('returns 403 when called by RESIDENT (non-manager)', async () => {
    const app = buildApp('VIEWER', 'user-uuid-1', 'RESIDENT');
    const res = await request(app).put('/api/platform/bookings/booking-uuid-2/approve');
    expect(res.status).toBe(403);
  });

  it('returns 404 when booking not found', async () => {
    const app = buildApp('ADMIN', 'user-uuid-1', 'MANAGER');
    mockPrisma.booking.findUnique.mockResolvedValue(null);
    const res = await request(app).put('/api/platform/bookings/nonexistent-id/approve');
    expect(res.status).toBe(404);
  });

  it('returns 400 when booking is not PENDING', async () => {
    const app = buildApp('ADMIN', 'user-uuid-1', 'MANAGER');
    mockPrisma.booking.findUnique.mockResolvedValue({ ...sampleBooking, status: 'APPROVED' });
    const res = await request(app).put('/api/platform/bookings/booking-uuid-1/approve');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/pending/i);
  });

  it('approves a PENDING booking (MANAGER)', async () => {
    const app = buildApp('ADMIN', 'user-uuid-1', 'MANAGER');
    mockPrisma.booking.findUnique.mockResolvedValue(pendingBooking);
    const approvedBooking = { ...pendingBooking, status: 'APPROVED', approvedBy: 'platform-user-uuid-1' };
    mockPrisma.booking.update.mockResolvedValue(approvedBooking);

    const res = await request(app).put('/api/platform/bookings/booking-uuid-2/approve');
    expect(res.status).toBe(200);

    const updateArgs = mockPrisma.booking.update.mock.calls[0][0];
    expect(updateArgs.data.status).toBe('APPROVED');
    expect(updateArgs.data.approvedBy).toBe('platform-user-uuid-1');
    expect(updateArgs.data.approvedAt).toBeInstanceOf(Date);
  });

  it('also works for BOARD_MEMBER role', async () => {
    const app = buildApp('ADMIN', 'user-uuid-1', 'BOARD_MEMBER');
    mockPrisma.booking.findUnique.mockResolvedValue(pendingBooking);
    mockPrisma.booking.update.mockResolvedValue({ ...pendingBooking, status: 'APPROVED' });

    const res = await request(app).put('/api/platform/bookings/booking-uuid-2/approve');
    expect(res.status).toBe(200);
  });
});

// ─── PUT /:id/reject ──────────────────────────────────────────────────────────

describe('PUT /api/platform/bookings/:id/reject', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).put('/api/platform/bookings/booking-uuid-2/reject');
    expect(res.status).toBe(401);
  });

  it('returns 403 when called by RESIDENT (non-manager)', async () => {
    const app = buildApp('VIEWER', 'user-uuid-1', 'RESIDENT');
    const res = await request(app).put('/api/platform/bookings/booking-uuid-2/reject');
    expect(res.status).toBe(403);
  });

  it('returns 404 when booking not found', async () => {
    const app = buildApp('ADMIN', 'user-uuid-1', 'MANAGER');
    mockPrisma.booking.findUnique.mockResolvedValue(null);
    const res = await request(app).put('/api/platform/bookings/nonexistent-id/reject');
    expect(res.status).toBe(404);
  });

  it('returns 400 when booking is not PENDING', async () => {
    const app = buildApp('ADMIN', 'user-uuid-1', 'MANAGER');
    mockPrisma.booking.findUnique.mockResolvedValue({ ...sampleBooking, status: 'REJECTED' });
    const res = await request(app).put('/api/platform/bookings/booking-uuid-1/reject');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/pending/i);
  });

  it('rejects a PENDING booking (MANAGER)', async () => {
    const app = buildApp('ADMIN', 'user-uuid-1', 'MANAGER');
    mockPrisma.booking.findUnique.mockResolvedValue(pendingBooking);
    const rejectedBooking = { ...pendingBooking, status: 'REJECTED', cancellationReason: 'Time conflict' };
    mockPrisma.booking.update.mockResolvedValue(rejectedBooking);

    const res = await request(app)
      .put('/api/platform/bookings/booking-uuid-2/reject')
      .send({ reason: 'Time conflict' });

    expect(res.status).toBe(200);

    const updateArgs = mockPrisma.booking.update.mock.calls[0][0];
    expect(updateArgs.data.status).toBe('REJECTED');
    expect(updateArgs.data.cancellationReason).toBe('Time conflict');
  });

  it('rejects without a reason when not provided', async () => {
    const app = buildApp('ADMIN', 'user-uuid-1', 'MANAGER');
    mockPrisma.booking.findUnique.mockResolvedValue(pendingBooking);
    mockPrisma.booking.update.mockResolvedValue({ ...pendingBooking, status: 'REJECTED' });

    const res = await request(app).put('/api/platform/bookings/booking-uuid-2/reject');
    expect(res.status).toBe(200);

    const updateArgs = mockPrisma.booking.update.mock.calls[0][0];
    expect(updateArgs.data.status).toBe('REJECTED');
  });
});

// ─── PUT /:id/cancel ──────────────────────────────────────────────────────────

describe('PUT /api/platform/bookings/:id/cancel', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).put('/api/platform/bookings/booking-uuid-1/cancel');
    expect(res.status).toBe(401);
  });

  it('returns 404 when booking not found', async () => {
    const app = buildApp('VIEWER', 'user-uuid-1', 'RESIDENT');
    mockPrisma.booking.findUnique.mockResolvedValue(null);
    const res = await request(app).put('/api/platform/bookings/nonexistent-id/cancel');
    expect(res.status).toBe(404);
  });

  it('returns 403 when non-owner RESIDENT tries to cancel another user booking', async () => {
    const app = buildApp('VIEWER', 'user-uuid-1', 'RESIDENT');
    const otherUserBooking = {
      ...sampleBooking,
      userId: 'other-platform-user-uuid',
    };
    mockPrisma.booking.findUnique.mockResolvedValue(otherUserBooking);

    const res = await request(app).put('/api/platform/bookings/booking-uuid-1/cancel');
    expect(res.status).toBe(403);
  });

  it('returns 400 when booking is already CANCELLED', async () => {
    const app = buildApp('VIEWER', 'user-uuid-1', 'RESIDENT');
    mockPrisma.booking.findUnique.mockResolvedValue({
      ...sampleBooking,
      status: 'CANCELLED',
    });

    const res = await request(app).put('/api/platform/bookings/booking-uuid-1/cancel');
    expect(res.status).toBe(400);
  });

  it('allows owner to cancel their own booking', async () => {
    const app = buildApp('VIEWER', 'user-uuid-1', 'RESIDENT');
    mockPrisma.booking.findUnique.mockResolvedValue(sampleBooking);
    mockPrisma.booking.update.mockResolvedValue({ ...sampleBooking, status: 'CANCELLED' });

    const res = await request(app).put('/api/platform/bookings/booking-uuid-1/cancel');
    expect(res.status).toBe(200);

    const updateArgs = mockPrisma.booking.update.mock.calls[0][0];
    expect(updateArgs.data.status).toBe('CANCELLED');
  });

  it('allows MANAGER to cancel any booking', async () => {
    const app = buildApp('ADMIN', 'user-uuid-1', 'MANAGER');
    const otherUserBooking = {
      ...sampleBooking,
      userId: 'other-platform-user-uuid',
    };
    mockPrisma.booking.findUnique.mockResolvedValue(otherUserBooking);
    mockPrisma.booking.update.mockResolvedValue({ ...otherUserBooking, status: 'CANCELLED' });

    const res = await request(app).put('/api/platform/bookings/booking-uuid-1/cancel');
    expect(res.status).toBe(200);
  });

  it('stores cancellation reason when provided', async () => {
    const app = buildApp('VIEWER', 'user-uuid-1', 'RESIDENT');
    mockPrisma.booking.findUnique.mockResolvedValue(sampleBooking);
    mockPrisma.booking.update.mockResolvedValue({
      ...sampleBooking,
      status: 'CANCELLED',
      cancellationReason: 'Change of plans',
    });

    await request(app)
      .put('/api/platform/bookings/booking-uuid-1/cancel')
      .send({ reason: 'Change of plans' });

    const updateArgs = mockPrisma.booking.update.mock.calls[0][0];
    expect(updateArgs.data.cancellationReason).toBe('Change of plans');
  });
});
