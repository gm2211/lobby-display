/**
 * Amenity CRUD API Routes - Platform amenity management.
 *
 * ROUTES:
 * - GET /api/platform/amenities              - List active amenities with images
 * - GET /api/platform/amenities/:id          - Amenity detail with rules + images
 * - POST /api/platform/amenities             - Create amenity (EDITOR+ required)
 * - PUT /api/platform/amenities/:id          - Update amenity (EDITOR+ required)
 * - DELETE /api/platform/amenities/:id       - Soft delete via markedForDeletion (EDITOR+ required)
 * - GET /api/platform/amenities/:id/availability?date=YYYY-MM-DD - Available time slots
 * - POST /api/platform/amenities/:id/rules          - Add rule (EDITOR+ required)
 * - PUT /api/platform/amenities/:id/rules/:ruleId   - Update rule (EDITOR+ required)
 * - DELETE /api/platform/amenities/:id/rules/:ruleId - Delete rule (EDITOR+ required)
 *
 * AUTH MODEL:
 * - GETs require authentication (any role: VIEWER, EDITOR, ADMIN)
 * - Mutations require EDITOR+ (mapped from "MANAGER+" in ticket)
 *
 * GOTCHAS:
 * - Soft delete uses markedForDeletion, NOT deletedAt (deletedAt is vestigial)
 * - Every async handler wrapped in asyncHandler()
 *
 * RELATED FILES:
 * - server/middleware/auth.ts  - requireAuth, requireMinRole
 * - server/middleware/errorHandler.ts - asyncHandler, validateId, NotFoundError
 * - prisma/schema.prisma - Amenity, AmenityImage, AmenityRule models
 */
import { Router } from 'express';
import prisma from '../../db.js';
import { asyncHandler, NotFoundError, ValidationError } from '../../middleware/errorHandler.js';
import { requireAuth, requireMinRole } from '../../middleware/auth.js';

const router = Router();

// ---------------------------------------------------------------------------
// GET / - List active amenities with images
// ---------------------------------------------------------------------------
router.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const amenities = await prisma.amenity.findMany({
      where: { active: true },
      include: { images: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { name: 'asc' },
    });

    // Add computed fields expected by the frontend Amenity type:
    // - availabilityStatus: derived from active flag (all listed amenities are active/AVAILABLE)
    // - category: not in schema; default to empty string so frontend filter works
    // - pricePerDay: not in schema; default to null
    // - pricePerHour: Prisma Decimal → JS number (so .toFixed() works in frontend)
    const items = amenities.map(a => ({
      ...a,
      pricePerHour: a.pricePerHour != null ? Number(a.pricePerHour) : null,
      category: '',
      pricePerDay: null,
      availabilityStatus: 'AVAILABLE' as const,
    }));

    res.json({ items });
  })
);

// ---------------------------------------------------------------------------
// GET /:id/availability?date=YYYY-MM-DD - Available time slots for a date
// Must appear before /:id to avoid route conflict
// ---------------------------------------------------------------------------
router.get(
  '/:id/availability',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = req.params.id;

    if (!id || typeof id !== 'string' || !id.trim()) {
      throw new ValidationError('id is required');
    }

    const { date } = req.query;
    if (!date || typeof date !== 'string') {
      throw new ValidationError('date query parameter is required (format: YYYY-MM-DD)');
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      throw new ValidationError('date must be in YYYY-MM-DD format');
    }

    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      throw new ValidationError('date is not a valid calendar date');
    }

    const amenity = await prisma.amenity.findUnique({
      where: { id },
    });

    if (!amenity) {
      throw new NotFoundError(`Amenity ${id} not found`);
    }

    // Return standard time slots for the requested date.
    // In a production system this would check bookings/reservations.
    const slots = generateTimeSlots(date);

    res.json({
      amenityId: id,
      date,
      slots,
    });
  })
);

// ---------------------------------------------------------------------------
// GET /:id - Amenity detail with rules + images
// ---------------------------------------------------------------------------
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = req.params.id;

    const amenity = await prisma.amenity.findUnique({
      where: { id },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        rules: true,
      },
    });

    if (!amenity) {
      throw new NotFoundError(`Amenity ${id} not found`);
    }

    res.json(amenity);
  })
);

// ---------------------------------------------------------------------------
// POST / - Create amenity (EDITOR+ required)
// ---------------------------------------------------------------------------
router.post(
  '/',
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const {
      name,
      description = '',
      location = '',
      active = true,
      availableFrom = '08:00',
      availableTo = '22:00',
      daysAvailable = [1, 2, 3, 4, 5],
      requiresApproval = false,
      capacity,
    } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      throw new ValidationError('name is required');
    }

    const amenity = await prisma.amenity.create({
      data: {
        name: name.trim(),
        description,
        location,
        active,
        availableFrom,
        availableTo,
        daysAvailable,
        requiresApproval,
        capacity: capacity ?? null,
      },
      include: {
        images: true,
        rules: true,
      },
    });

    res.status(201).json(amenity);
  })
);

// ---------------------------------------------------------------------------
// PUT /:id - Update amenity (EDITOR+ required)
// ---------------------------------------------------------------------------
router.put(
  '/:id',
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const id = req.params.id;

    const { name, description, location, active, availableFrom, availableTo, daysAvailable, requiresApproval, capacity } = req.body;
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (location !== undefined) data.location = location;
    if (active !== undefined) data.active = active;
    if (availableFrom !== undefined) data.availableFrom = availableFrom;
    if (availableTo !== undefined) data.availableTo = availableTo;
    if (daysAvailable !== undefined) data.daysAvailable = daysAvailable;
    if (requiresApproval !== undefined) data.requiresApproval = requiresApproval;
    if (capacity !== undefined) data.capacity = capacity;

    const amenity = await prisma.amenity.update({
      where: { id },
      data,
      include: {
        images: true,
        rules: true,
      },
    });

    res.json(amenity);
  })
);

// ---------------------------------------------------------------------------
// DELETE /:id - Soft delete via active=false (EDITOR+ required)
// NOTE: Amenity model uses active=false for soft deletion (no markedForDeletion field)
// ---------------------------------------------------------------------------
router.delete(
  '/:id',
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const id = req.params.id;

    await prisma.amenity.update({
      where: { id },
      data: { active: false },
    });

    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// POST /:id/rules - Add rule to amenity (EDITOR+ required)
// ---------------------------------------------------------------------------
router.post(
  '/:id/rules',
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const amenityId = req.params.id;

    const amenity = await prisma.amenity.findUnique({ where: { id: amenityId } });
    if (!amenity) {
      throw new NotFoundError(`Amenity ${amenityId} not found`);
    }

    const { ruleType, ruleValue, active = true } = req.body;

    if (!ruleType) {
      throw new ValidationError('ruleType is required');
    }

    const rule = await prisma.amenityRule.create({
      data: { amenityId, ruleType, ruleValue: ruleValue ?? {}, active },
    });

    res.status(201).json(rule);
  })
);

// ---------------------------------------------------------------------------
// PUT /:id/rules/:ruleId - Update rule (EDITOR+ required)
// ---------------------------------------------------------------------------
router.put(
  '/:id/rules/:ruleId',
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const amenityId = req.params.id;
    const ruleId = req.params.ruleId;

    const existingRule = await prisma.amenityRule.findUnique({ where: { id: ruleId } });
    if (!existingRule || existingRule.amenityId !== amenityId) {
      throw new NotFoundError(`Rule ${ruleId} not found for amenity ${amenityId}`);
    }

    const { ruleType, ruleValue, active } = req.body;
    const data: Record<string, unknown> = {};
    if (ruleType !== undefined) data.ruleType = ruleType;
    if (ruleValue !== undefined) data.ruleValue = ruleValue;
    if (active !== undefined) data.active = active;

    const rule = await prisma.amenityRule.update({
      where: { id: ruleId },
      data,
    });

    res.json(rule);
  })
);

// ---------------------------------------------------------------------------
// DELETE /:id/rules/:ruleId - Delete rule (EDITOR+ required)
// ---------------------------------------------------------------------------
router.delete(
  '/:id/rules/:ruleId',
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const amenityId = req.params.id;
    const ruleId = req.params.ruleId;

    const existingRule = await prisma.amenityRule.findUnique({ where: { id: ruleId } });
    if (!existingRule || existingRule.amenityId !== amenityId) {
      throw new NotFoundError(`Rule ${ruleId} not found for amenity ${amenityId}`);
    }

    await prisma.amenityRule.delete({ where: { id: ruleId } });

    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// Helper: generate standard daily time slots
// ---------------------------------------------------------------------------
function generateTimeSlots(date: string): Array<{ time: string; available: boolean }> {
  const slots: Array<{ time: string; available: boolean }> = [];
  // Generate slots from 6 AM to 10 PM in 1-hour increments
  for (let hour = 6; hour <= 22; hour++) {
    const timeStr = `${String(hour).padStart(2, '0')}:00`;
    slots.push({ time: `${date}T${timeStr}:00`, available: true });
  }
  return slots;
}

export default router;
