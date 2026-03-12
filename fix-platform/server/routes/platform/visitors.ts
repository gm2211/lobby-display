/**
 * Visitor Management API Routes
 *
 * Handles visitor pre-registration, check-in, check-out, and the guard desk
 * expected-visitor list.
 *
 * ROUTES:
 * - GET  /api/visitors                        - List visitors (own; EDITOR+ sees all)
 * - GET  /api/visitors/expected?date=YYYY-MM-DD - Expected visitors for guard desk (EDITOR+)
 * - GET  /api/visitors/:id                    - Visitor detail with logs
 * - POST /api/visitors                        - Pre-register visitor (any auth user)
 * - PUT  /api/visitors/:id                    - Update/cancel visitor (owner or EDITOR+)
 * - POST /api/visitors/:id/checkin            - Check in visitor (EDITOR+ required)
 * - POST /api/visitors/:id/checkout           - Check out visitor (EDITOR+ required)
 *
 * AUTH MODEL:
 * - All routes require authentication
 * - GET / returns own visitors for VIEWER, all visitors for EDITOR+
 * - GET /expected requires EDITOR+ (guard-desk feature)
 * - POST / is open to any authenticated user (residents pre-register guests)
 * - PUT /:id is allowed for the visitor's host (owner) or EDITOR+
 * - POST /:id/checkin and /:id/checkout require EDITOR+ (security staff)
 *
 * ACCESS CODE:
 * - Generated automatically on creation as a 6-character uppercase hex string
 * - Ensures a unique code per visitor for guard-desk scanning
 *
 * RELATED FILES:
 * - server/middleware/auth.ts        - requireAuth, requireMinRole, ROLE_LEVEL
 * - server/middleware/errorHandler.ts - asyncHandler, validateId, NotFoundError, ValidationError
 * - prisma/schema.prisma             - Visitor, VisitorLog, VisitorStatus, VisitorAction
 * - tests/unit/visitor-routes.test.ts - unit tests (Prisma mocked)
 */
import { Router } from 'express';
import { randomBytes } from 'crypto';
import prisma from '../../db.js';
import {
  asyncHandler,
  NotFoundError,
  ValidationError,
} from '../../middleware/errorHandler.js';
import { requireAuth, requireMinRole, ROLE_LEVEL, AuthorizationError } from '../../middleware/auth.js';
import { platformProtectStrict } from '../../middleware/platformAuth.js';

const router = Router();

// Apply platformProtectStrict to all visitor routes so req.platformUser is available.
// This ensures hostId uses PlatformUser.id (UUID String) not session user.id (integer).
router.use(platformProtectStrict);

/** Valid visitor statuses that can be set via PUT */
const VALID_STATUSES = ['EXPECTED', 'CANCELLED'] as const;

/** Generate a 6-character uppercase alphanumeric access code */
function generateAccessCode(): string {
  return randomBytes(3).toString('hex').toUpperCase();
}

/** Returns true if the session user is EDITOR or higher */
function isEditorPlus(role: string): boolean {
  return (ROLE_LEVEL[role] ?? 0) >= (ROLE_LEVEL['EDITOR'] ?? 0);
}

// ─── GET / ─────────────────────────────────────────────────────────────────
// List visitors: VIEWER sees only their own; EDITOR+ sees all

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = req.session.user!;
    const platformUser = req.platformUser!;
    const where: Record<string, unknown> = {};

    if (!isEditorPlus(user.role)) {
      // VIEWER only sees their own visitors — use PlatformUser.id (UUID String)
      where.hostId = platformUser.id;
    }

    const visitors = await prisma.visitor.findMany({
      where,
      orderBy: { expectedDate: 'asc' },
    });

    res.json(visitors);
  })
);

// ─── GET /expected ──────────────────────────────────────────────────────────
// Expected visitors for a given date (guard desk); EDITOR+ only
// NOTE: Must be defined BEFORE /:id to avoid route conflict

router.get(
  '/expected',
  requireAuth,
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const { date } = req.query;

    if (!date || typeof date !== 'string') {
      throw new ValidationError('date query parameter is required (format: YYYY-MM-DD)');
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      throw new ValidationError('date must be in YYYY-MM-DD format');
    }

    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      throw new ValidationError('date is not a valid calendar date');
    }

    // Build date range: start of day → start of next day (UTC)
    const startOfDay = new Date(`${date}T00:00:00.000Z`);
    const endOfDay = new Date(`${date}T23:59:59.999Z`);

    const visitors = await prisma.visitor.findMany({
      where: {
        status: 'EXPECTED',
        expectedDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      orderBy: { expectedDate: 'asc' },
    });

    res.json(visitors);
  })
);

// ─── GET /:id ────────────────────────────────────────────────────────────────
// Visitor detail with logs; VIEWER can only access their own

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const user = req.session.user!;
    const platformUser = req.platformUser!;

    const visitor = await prisma.visitor.findUnique({
      where: { id },
      include: { logs: { orderBy: { timestamp: 'asc' } } },
    });

    if (!visitor) {
      throw new NotFoundError(`Visitor ${id} not found`);
    }

    // VIEWER can only access their own visitors — compare PlatformUser.id (UUID String)
    if (!isEditorPlus(user.role) && visitor.hostId !== platformUser.id) {
      throw new AuthorizationError('You do not have permission to view this visitor');
    }

    res.json(visitor);
  })
);

// ─── POST / ──────────────────────────────────────────────────────────────────
// Pre-register a visitor (any authenticated user)
// Enforces overnight visitor limits per host (REQ-4.7-3).

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const {
      guestName, guestEmail, guestPhone, purpose, expectedDate, notes,
      accessWindowStart, accessWindowEnd, vehiclePlate, parkingSpot,
      overnight,
    } = req.body;
    const platformUser = req.platformUser!;

    if (!guestName || typeof guestName !== 'string' || !guestName.trim()) {
      throw new ValidationError('guestName is required');
    }

    if (!expectedDate) {
      throw new ValidationError('expectedDate is required');
    }

    const parsedDate = new Date(expectedDate);
    if (isNaN(parsedDate.getTime())) {
      throw new ValidationError('expectedDate is not a valid date');
    }

    const isOvernight = Boolean(overnight);

    // Enforce overnight visitor limit per host (REQ-4.7-3)
    if (isOvernight) {
      const setting = await prisma.platformSetting.findUnique({
        where: { key: 'visitor_overnight_limit' },
      });
      // Default limit: 3 overnight visitors per host at a time
      const limit = setting?.value && typeof setting.value === 'object' && 'limit' in (setting.value as Record<string, unknown>)
        ? Number((setting.value as Record<string, unknown>).limit)
        : 3;

      if (limit > 0) {
        const activeOvernight = await prisma.visitor.count({
          where: {
            hostId: platformUser.id,
            overnight: true,
            status: { in: ['EXPECTED', 'CHECKED_IN'] },
          },
        });

        if (activeOvernight >= limit) {
          throw new ValidationError(
            `Overnight visitor limit reached (${limit}). Cancel or check out existing overnight visitors first.`
          );
        }
      }
    }

    const accessCode = generateAccessCode();

    const visitor = await prisma.visitor.create({
      data: {
        hostId: platformUser.id,
        guestName: guestName.trim(),
        guestEmail: guestEmail ?? null,
        guestPhone: guestPhone ?? null,
        purpose: purpose ?? null,
        expectedDate: parsedDate,
        accessCode,
        status: 'EXPECTED',
        notes: notes ?? null,
        accessWindowStart: accessWindowStart ? new Date(accessWindowStart) : null,
        accessWindowEnd: accessWindowEnd ? new Date(accessWindowEnd) : null,
        vehiclePlate: vehiclePlate ?? null,
        parkingSpot: parkingSpot ?? null,
        overnight: isOvernight,
      },
    });

    res.status(201).json(visitor);
  })
);

// ─── PUT /:id ────────────────────────────────────────────────────────────────
// Update/cancel a visitor (owner or EDITOR+)

router.put(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const user = req.session.user!;
    const platformUser = req.platformUser!;

    const existing = await prisma.visitor.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError(`Visitor ${id} not found`);
    }

    // Only owner or EDITOR+ may update — compare PlatformUser.id (UUID String)
    if (!isEditorPlus(user.role) && existing.hostId !== platformUser.id) {
      throw new AuthorizationError('You do not have permission to update this visitor');
    }

    const {
      guestName, guestEmail, guestPhone, purpose, expectedDate, notes, status,
      accessWindowStart, accessWindowEnd, vehiclePlate, parkingSpot,
    } = req.body;

    // Validate status if provided
    if (status !== undefined) {
      const allowed: string[] = [...VALID_STATUSES];
      if (!allowed.includes(status)) {
        throw new ValidationError(
          `Invalid status: '${status}'. Allowed values: ${VALID_STATUSES.join(', ')}`
        );
      }
    }

    const data: Record<string, unknown> = {};
    if (guestName !== undefined) data.guestName = guestName;
    if (guestEmail !== undefined) data.guestEmail = guestEmail;
    if (guestPhone !== undefined) data.guestPhone = guestPhone;
    if (purpose !== undefined) data.purpose = purpose;
    if (notes !== undefined) data.notes = notes;
    if (status !== undefined) data.status = status;
    if (accessWindowStart !== undefined) data.accessWindowStart = accessWindowStart ? new Date(accessWindowStart) : null;
    if (accessWindowEnd !== undefined) data.accessWindowEnd = accessWindowEnd ? new Date(accessWindowEnd) : null;
    if (vehiclePlate !== undefined) data.vehiclePlate = vehiclePlate;
    if (parkingSpot !== undefined) data.parkingSpot = parkingSpot;
    if (expectedDate !== undefined) {
      const parsed = new Date(expectedDate);
      if (isNaN(parsed.getTime())) {
        throw new ValidationError('expectedDate is not a valid date');
      }
      data.expectedDate = parsed;
    }

    const updated = await prisma.visitor.update({ where: { id }, data });
    res.json(updated);
  })
);

// ─── POST /:id/checkin ────────────────────────────────────────────────────────
// Check in a visitor (EDITOR+)

router.post(
  '/:id/checkin',
  requireAuth,
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const platformUser = req.platformUser!;

    const visitor = await prisma.visitor.findUnique({ where: { id } });
    if (!visitor) {
      throw new NotFoundError(`Visitor ${id} not found`);
    }

    if (visitor.status === 'CHECKED_IN') {
      throw new ValidationError('Visitor is already checked in');
    }

    if (visitor.status !== 'EXPECTED') {
      throw new ValidationError(
        `Cannot check in visitor with status '${visitor.status}'. Visitor must be EXPECTED.`
      );
    }

    const [updated] = await Promise.all([
      prisma.visitor.update({
        where: { id },
        data: { status: 'CHECKED_IN' },
      }),
      prisma.visitorLog.create({
        data: {
          visitorId: id,
          action: 'CHECK_IN',
          performedBy: platformUser.id,
          notes: req.body.notes ?? null,
        },
      }),
    ]);

    res.json(updated);
  })
);

// ─── POST /:id/checkout ───────────────────────────────────────────────────────
// Check out a visitor (EDITOR+)

router.post(
  '/:id/checkout',
  requireAuth,
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const platformUser = req.platformUser!;

    const visitor = await prisma.visitor.findUnique({ where: { id } });
    if (!visitor) {
      throw new NotFoundError(`Visitor ${id} not found`);
    }

    if (visitor.status !== 'CHECKED_IN') {
      throw new ValidationError(
        `Visitor must be checked in to check out. Current status: '${visitor.status}'`
      );
    }

    const [updated] = await Promise.all([
      prisma.visitor.update({
        where: { id },
        data: { status: 'CHECKED_OUT' },
      }),
      prisma.visitorLog.create({
        data: {
          visitorId: id,
          action: 'CHECK_OUT',
          performedBy: platformUser.id,
          notes: req.body.notes ?? null,
        },
      }),
    ]);

    res.json(updated);
  })
);

export default router;
