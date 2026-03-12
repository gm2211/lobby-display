/**
 * Platform Bookings API Routes - Amenity booking management with SSE notifications.
 *
 * ROUTES:
 * - POST /api/platform/bookings             - Create booking (any auth). Validates via bookingRules.
 *                                             Status starts as PENDING if amenity.requiresApproval; else APPROVED.
 * - GET /api/platform/bookings              - List own bookings with amenity details. MANAGER+ can see all.
 * - GET /api/platform/bookings/:id          - Single booking detail (any auth).
 * - PUT /api/platform/bookings/:id/approve  - MANAGER+ approves a PENDING booking.
 * - PUT /api/platform/bookings/:id/reject   - MANAGER+ rejects a PENDING booking (optional reason).
 * - PUT /api/platform/bookings/:id/cancel   - Cancel own booking, or MANAGER+ can cancel any.
 *
 * AUTH MODEL:
 * - All routes require authentication
 * - GET /:id enforces ownership (MANAGER+ can see any)
 * - Approve/reject require MANAGER+ platform role (MANAGER or BOARD_MEMBER)
 * - Cancel enforces ownership (MANAGER+ can cancel any)
 *
 * SSE EVENTS:
 * - booking:approved  - Broadcast after successful approval
 * - booking:rejected  - Broadcast after successful rejection
 *
 * VALIDATION:
 * - POST enforces all booking rules via bookingRules.validateBooking()
 * - Validation errors return 422 with an errors array
 *
 * GOTCHAS:
 * - req.platformUser is attached by platformProtectStrict in platform/index.ts
 * - Booking.userId is PlatformUser.id (UUID), NOT User.id (integer)
 * - MANAGER and BOARD_MEMBER are "manager-level" platform roles
 * - Approve/reject/cancel routes must be mounted BEFORE /:id to avoid route shadowing
 *
 * RELATED FILES:
 * - server/middleware/auth.ts             - requireAuth
 * - server/middleware/errorHandler.ts    - asyncHandler, NotFoundError, ValidationError
 * - server/middleware/platformAuth.ts    - platformProtectStrict (applied at router level)
 * - server/services/bookingRules.ts      - validateBooking, checkAvailability
 * - server/services/bookingNotifier.ts   - SSE broadcast helpers
 * - prisma/schema.prisma                 - Booking, BookingStatus, Amenity, PlatformUser models
 * - tests/unit/booking-routes.test.ts   - unit tests (Prisma + bookingRules mocked)
 */
import { Router } from 'express';
import type { PlatformRole } from '@prisma/client';
import prisma from '../../db.js';
import {
  asyncHandler,
  NotFoundError,
  ValidationError,
} from '../../middleware/errorHandler.js';
import { requireAuth, AuthorizationError } from '../../middleware/auth.js';
import { platformProtectStrict } from '../../middleware/platformAuth.js';
import { validateBooking } from '../../services/bookingRules.js';
import {
  notifyBookingApproved,
  notifyBookingRejected,
} from '../../services/bookingNotifier.js';

const router = Router();

// Apply platformProtectStrict to all booking routes so req.platformUser is available.
// platformProtect (at app level) already blocks VIEWER mutations, but does not load
// the PlatformUser record. platformProtectStrict loads it and attaches to req.platformUser.
router.use(platformProtectStrict);

/** Platform roles that can manage (approve/reject/cancel any) bookings */
const MANAGER_ROLES: PlatformRole[] = ['MANAGER', 'BOARD_MEMBER'];

function isManagerRole(role: PlatformRole | undefined): boolean {
  return role !== undefined && MANAGER_ROLES.includes(role);
}

// ─── POST / ───────────────────────────────────────────────────────────────────
// Create a booking. Validates all rules via bookingRules.
// Status starts as PENDING if amenity.requiresApproval; otherwise APPROVED.

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { amenityId, startTime, endTime, notes } = req.body;

    if (!amenityId || typeof amenityId !== 'string' || !amenityId.trim()) {
      throw new ValidationError('amenityId is required');
    }
    if (!startTime) {
      throw new ValidationError('startTime is required');
    }
    if (!endTime) {
      throw new ValidationError('endTime is required');
    }

    const startDate = new Date(startTime);
    const endDate = new Date(endTime);

    if (isNaN(startDate.getTime())) {
      throw new ValidationError('startTime must be a valid date');
    }
    if (isNaN(endDate.getTime())) {
      throw new ValidationError('endTime must be a valid date');
    }

    // Load the amenity to check requiresApproval
    const amenity = await prisma.amenity.findUnique({
      where: { id: amenityId },
    });

    if (!amenity) {
      throw new NotFoundError(`Amenity ${amenityId} not found`);
    }

    // Get platformUser from request (attached by platformProtectStrict)
    const platformUser = req.platformUser!;

    // Validate booking rules
    const validation = await validateBooking({
      amenityId,
      userId: platformUser.id,
      userRole: platformUser.role,
      startTime: startDate,
      endTime: endDate,
    });

    if (!validation.valid) {
      res.status(422).json({
        error: 'BookingValidationError',
        message: 'Booking request violates one or more rules',
        errors: validation.errors,
      });
      return;
    }

    // Determine initial status based on amenity approval requirement
    const status = amenity.requiresApproval ? 'PENDING' : 'APPROVED';

    const booking = await prisma.booking.create({
      data: {
        amenityId,
        userId: platformUser.id,
        startTime: startDate,
        endTime: endDate,
        status,
        notes: notes ?? null,
      },
      include: {
        amenity: true,
      },
    });

    res.status(201).json(booking);
  })
);

// ─── GET / ────────────────────────────────────────────────────────────────────
// List bookings. Regular users see only their own; MANAGER+ sees all.

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const platformUser = req.platformUser!;
    const canSeeAll = isManagerRole(platformUser.role);

    const where: Record<string, unknown> = {};

    // Non-managers can only see their own bookings
    if (!canSeeAll) {
      where.userId = platformUser.id;
    }

    const bookings = await prisma.booking.findMany({
      where,
      include: {
        amenity: true,
      },
      orderBy: { startTime: 'desc' },
    });

    res.json(bookings);
  })
);

// ─── GET /:id ─────────────────────────────────────────────────────────────────
// Single booking detail. Owner or MANAGER+ can view.
// NOTE: Must be mounted AFTER sub-routes like /:id/approve to avoid shadowing.

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const platformUser = req.platformUser!;

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        amenity: true,
      },
    });

    if (!booking) {
      throw new NotFoundError(`Booking ${id} not found`);
    }

    // Non-managers can only view their own bookings
    if (!isManagerRole(platformUser.role) && booking.userId !== platformUser.id) {
      throw new AuthorizationError('You do not have permission to view this booking');
    }

    res.json(booking);
  })
);

// ─── PUT /:id/approve ─────────────────────────────────────────────────────────
// Approve a PENDING booking. MANAGER+ only. Broadcasts SSE notification.

router.put(
  '/:id/approve',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const platformUser = req.platformUser!;

    if (!isManagerRole(platformUser.role)) {
      throw new AuthorizationError('Only MANAGER+ can approve bookings');
    }

    const booking = await prisma.booking.findUnique({ where: { id } });

    if (!booking) {
      throw new NotFoundError(`Booking ${id} not found`);
    }

    if (booking.status !== 'PENDING') {
      throw new ValidationError(`Booking cannot be approved: current status is ${booking.status}, not PENDING`);
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedBy: platformUser.id,
        approvedAt: new Date(),
      },
      include: {
        amenity: true,
      },
    });

    res.json(updated);

    // Broadcast SSE notification after response
    notifyBookingApproved(updated);
  })
);

// ─── PUT /:id/reject ──────────────────────────────────────────────────────────
// Reject a PENDING booking. MANAGER+ only. Optional reason. Broadcasts SSE notification.

router.put(
  '/:id/reject',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    const platformUser = req.platformUser!;

    if (!isManagerRole(platformUser.role)) {
      throw new AuthorizationError('Only MANAGER+ can reject bookings');
    }

    const booking = await prisma.booking.findUnique({ where: { id } });

    if (!booking) {
      throw new NotFoundError(`Booking ${id} not found`);
    }

    if (booking.status !== 'PENDING') {
      throw new ValidationError(`Booking cannot be rejected: current status is ${booking.status}, not PENDING`);
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: {
        status: 'REJECTED',
        cancellationReason: reason ?? null,
      },
      include: {
        amenity: true,
      },
    });

    res.json(updated);

    // Broadcast SSE notification after response
    notifyBookingRejected(updated);
  })
);

// ─── PUT /:id/cancel ──────────────────────────────────────────────────────────
// Cancel a booking. Owner can cancel their own; MANAGER+ can cancel any.

router.put(
  '/:id/cancel',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    const platformUser = req.platformUser!;

    const booking = await prisma.booking.findUnique({ where: { id } });

    if (!booking) {
      throw new NotFoundError(`Booking ${id} not found`);
    }

    // Permission check: must be owner or manager
    if (!isManagerRole(platformUser.role) && booking.userId !== platformUser.id) {
      throw new AuthorizationError('You do not have permission to cancel this booking');
    }

    if (booking.status === 'CANCELLED') {
      throw new ValidationError('Booking is already cancelled');
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancellationReason: reason ?? null,
      },
      include: {
        amenity: true,
      },
    });

    res.json(updated);
  })
);

export default router;
