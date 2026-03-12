/**
 * Security & Concierge Shift Management API Routes (spec §4.16)
 *
 * Handles shift scheduling, status transitions, and key management
 * for SECURITY and CONCIERGE staff.
 *
 * ROUTES:
 * - GET    /api/platform/shifts                - List shifts (filter by date, type, status)
 * - GET    /api/platform/shifts/active         - Currently active shifts
 * - GET    /api/platform/shifts/:id            - Shift detail with key logs
 * - POST   /api/platform/shifts                - Create shift (MANAGER+)
 * - PUT    /api/platform/shifts/:id            - Update shift (MANAGER+ or assignee)
 * - POST   /api/platform/shifts/:id/start      - Start shift (assignee only)
 * - POST   /api/platform/shifts/:id/complete   - Complete shift (assignee only)
 * - POST   /api/platform/shifts/:id/cancel     - Cancel shift (MANAGER+)
 * - GET    /api/platform/shifts/keys           - List key logs (filter by shift)
 * - POST   /api/platform/shifts/keys           - Log key checkout/return (SECURITY/CONCIERGE+)
 *
 * AUTH MODEL:
 * - All routes require platformProtectStrict (PlatformUser loaded)
 * - Shift creation/cancellation requires MANAGER role
 * - Start/complete requires being the assigned staff member
 * - Key logs require SECURITY, CONCIERGE, or MANAGER role
 *
 * CONSTRAINTS (REQ-4.16-3):
 * - Shift duration must be 1–24 hours
 * - Overlapping shifts for the same assignee are rejected
 *
 * RELATED FILES:
 * - server/services/shiftNotifier.ts    - SSE broadcast for shift updates
 * - server/middleware/platformAuth.ts    - platformProtectStrict, requirePlatformRole
 * - prisma/schema.prisma                - Shift, KeyLog, ShiftStatus, ShiftType, KeyAction
 */
import { Router } from 'express';
import prisma from '../../db.js';
import {
  asyncHandler,
  NotFoundError,
  ValidationError,
} from '../../middleware/errorHandler.js';
import { platformProtectStrict, requirePlatformRole } from '../../middleware/platformAuth.js';
import { notifyShiftUpdate } from '../../services/shiftNotifier.js';

const router = Router();

// All shift routes require platformProtectStrict
router.use(platformProtectStrict);

const MAX_SHIFT_HOURS = 24;
const MIN_SHIFT_HOURS = 1;

/** Validate shift time constraints (REQ-4.16-3) */
function validateShiftTimes(startTime: Date, endTime: Date): void {
  if (endTime <= startTime) {
    throw new ValidationError('endTime must be after startTime');
  }
  const durationMs = endTime.getTime() - startTime.getTime();
  const durationHours = durationMs / (1000 * 60 * 60);
  if (durationHours < MIN_SHIFT_HOURS) {
    throw new ValidationError(`Shift duration must be at least ${MIN_SHIFT_HOURS} hour(s)`);
  }
  if (durationHours > MAX_SHIFT_HOURS) {
    throw new ValidationError(`Shift duration must not exceed ${MAX_SHIFT_HOURS} hours`);
  }
}

/** Check for overlapping shifts for the same assignee (REQ-4.16-3) */
async function checkOverlap(assigneeId: string, startTime: Date, endTime: Date, excludeId?: string): Promise<void> {
  const where: Record<string, unknown> = {
    assigneeId,
    status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
    startTime: { lt: endTime },
    endTime: { gt: startTime },
  };
  if (excludeId) {
    where.id = { not: excludeId };
  }
  const overlap = await prisma.shift.findFirst({ where });
  if (overlap) {
    throw new ValidationError('This shift overlaps with an existing shift for the same assignee');
  }
}

// ─── GET / ─────────────────────────────────────────────────────────────────
// List shifts with optional filters: date, shiftType, status, assigneeId

router.get(
  '/',
  requirePlatformRole('SECURITY', 'CONCIERGE', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const { date, shiftType, status, assigneeId } = req.query;
    const where: Record<string, unknown> = {};

    if (date && typeof date === 'string') {
      const parsed = new Date(date);
      if (!isNaN(parsed.getTime())) {
        const dayStart = new Date(`${date}T00:00:00.000Z`);
        const dayEnd = new Date(`${date}T23:59:59.999Z`);
        where.startTime = { lte: dayEnd };
        where.endTime = { gte: dayStart };
      }
    }

    if (shiftType && typeof shiftType === 'string') {
      where.shiftType = shiftType;
    }
    if (status && typeof status === 'string') {
      where.status = status;
    }
    if (assigneeId && typeof assigneeId === 'string') {
      where.assigneeId = assigneeId;
    }

    const shifts = await prisma.shift.findMany({
      where,
      include: { assignee: { select: { id: true, unitNumber: true, role: true, userId: true } } },
      orderBy: { startTime: 'asc' },
    });

    res.json(shifts);
  })
);

// ─── GET /active ────────────────────────────────────────────────────────────
// Currently active (IN_PROGRESS) shifts — for real-time ops board (REQ-4.16-2)
// NOTE: Must be defined BEFORE /:id to avoid route conflict

router.get(
  '/active',
  requirePlatformRole('SECURITY', 'CONCIERGE', 'MANAGER'),
  asyncHandler(async (_req, res) => {
    const shifts = await prisma.shift.findMany({
      where: { status: 'IN_PROGRESS' },
      include: { assignee: { select: { id: true, unitNumber: true, role: true, userId: true } } },
      orderBy: { startTime: 'asc' },
    });

    res.json(shifts);
  })
);

// ─── GET /keys ──────────────────────────────────────────────────────────────
// List key logs; optionally filter by shiftId

router.get(
  '/keys',
  requirePlatformRole('SECURITY', 'CONCIERGE', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const { shiftId } = req.query;
    const where: Record<string, unknown> = {};

    if (shiftId && typeof shiftId === 'string') {
      where.shiftId = shiftId;
    }

    const logs = await prisma.keyLog.findMany({
      where,
      include: { performer: { select: { id: true, unitNumber: true, role: true } } },
      orderBy: { createdAt: 'desc' },
    });

    res.json(logs);
  })
);

// ─── GET /:id ──────────────────────────────────────────────────────────────
// Shift detail with key logs

router.get(
  '/:id',
  requirePlatformRole('SECURITY', 'CONCIERGE', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const shift = await prisma.shift.findUnique({
      where: { id: req.params.id },
      include: {
        assignee: { select: { id: true, unitNumber: true, role: true, userId: true } },
        keyLogs: {
          include: { performer: { select: { id: true, unitNumber: true, role: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!shift) {
      throw new NotFoundError(`Shift ${req.params.id} not found`);
    }

    res.json(shift);
  })
);

// ─── POST / ────────────────────────────────────────────────────────────────
// Create a new shift (MANAGER only)

router.post(
  '/',
  requirePlatformRole('MANAGER'),
  asyncHandler(async (req, res) => {
    const { assigneeId, shiftType, startTime, endTime, notes } = req.body;

    if (!assigneeId || typeof assigneeId !== 'string') {
      throw new ValidationError('assigneeId is required');
    }
    if (!shiftType || !['SECURITY', 'CONCIERGE'].includes(shiftType)) {
      throw new ValidationError('shiftType must be SECURITY or CONCIERGE');
    }
    if (!startTime || !endTime) {
      throw new ValidationError('startTime and endTime are required');
    }

    const start = new Date(startTime);
    const end = new Date(endTime);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new ValidationError('startTime and endTime must be valid dates');
    }

    validateShiftTimes(start, end);

    // Verify assignee exists
    const assignee = await prisma.platformUser.findUnique({ where: { id: assigneeId } });
    if (!assignee) {
      throw new ValidationError('assigneeId does not match a platform user');
    }

    await checkOverlap(assigneeId, start, end);

    const shift = await prisma.shift.create({
      data: {
        assigneeId,
        shiftType,
        startTime: start,
        endTime: end,
        status: 'SCHEDULED',
        notes: notes ?? null,
      },
      include: { assignee: { select: { id: true, unitNumber: true, role: true, userId: true } } },
    });

    notifyShiftUpdate(shift);
    res.status(201).json(shift);
  })
);

// ─── PUT /:id ──────────────────────────────────────────────────────────────
// Update shift details (MANAGER or assignee; only SCHEDULED shifts)

router.put(
  '/:id',
  requirePlatformRole('SECURITY', 'CONCIERGE', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const platformUser = req.platformUser!;
    const existing = await prisma.shift.findUnique({ where: { id: req.params.id } });

    if (!existing) {
      throw new NotFoundError(`Shift ${req.params.id} not found`);
    }

    // Only MANAGER or the assignee can update
    if (platformUser.role !== 'MANAGER' && existing.assigneeId !== platformUser.id) {
      throw new ValidationError('Only the shift assignee or a MANAGER can update this shift');
    }

    if (existing.status !== 'SCHEDULED') {
      throw new ValidationError('Only SCHEDULED shifts can be updated');
    }

    const { startTime, endTime, notes, assigneeId, shiftType } = req.body;
    const data: Record<string, unknown> = {};

    const newStart = startTime ? new Date(startTime) : existing.startTime;
    const newEnd = endTime ? new Date(endTime) : existing.endTime;

    if (startTime || endTime) {
      validateShiftTimes(newStart, newEnd);
      const targetAssignee = assigneeId ?? existing.assigneeId;
      await checkOverlap(targetAssignee, newStart, newEnd, existing.id);
    }

    if (startTime) data.startTime = newStart;
    if (endTime) data.endTime = newEnd;
    if (notes !== undefined) data.notes = notes;
    if (assigneeId) {
      const assignee = await prisma.platformUser.findUnique({ where: { id: assigneeId } });
      if (!assignee) throw new ValidationError('assigneeId does not match a platform user');
      await checkOverlap(assigneeId, newStart, newEnd, existing.id);
      data.assigneeId = assigneeId;
    }
    if (shiftType && ['SECURITY', 'CONCIERGE'].includes(shiftType)) {
      data.shiftType = shiftType;
    }

    const updated = await prisma.shift.update({
      where: { id: req.params.id },
      data,
      include: { assignee: { select: { id: true, unitNumber: true, role: true, userId: true } } },
    });

    notifyShiftUpdate(updated);
    res.json(updated);
  })
);

// ─── POST /:id/start ──────────────────────────────────────────────────────
// Start a shift (assignee only)

router.post(
  '/:id/start',
  requirePlatformRole('SECURITY', 'CONCIERGE', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const platformUser = req.platformUser!;
    const shift = await prisma.shift.findUnique({ where: { id: req.params.id } });

    if (!shift) {
      throw new NotFoundError(`Shift ${req.params.id} not found`);
    }

    if (shift.assigneeId !== platformUser.id && platformUser.role !== 'MANAGER') {
      throw new ValidationError('Only the assigned staff member or a MANAGER can start this shift');
    }

    if (shift.status !== 'SCHEDULED') {
      throw new ValidationError(`Cannot start shift with status '${shift.status}'. Must be SCHEDULED.`);
    }

    const updated = await prisma.shift.update({
      where: { id: req.params.id },
      data: { status: 'IN_PROGRESS' },
      include: { assignee: { select: { id: true, unitNumber: true, role: true, userId: true } } },
    });

    notifyShiftUpdate(updated);
    res.json(updated);
  })
);

// ─── POST /:id/complete ──────────────────────────────────────────────────
// Complete a shift (assignee only)

router.post(
  '/:id/complete',
  requirePlatformRole('SECURITY', 'CONCIERGE', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const platformUser = req.platformUser!;
    const shift = await prisma.shift.findUnique({ where: { id: req.params.id } });

    if (!shift) {
      throw new NotFoundError(`Shift ${req.params.id} not found`);
    }

    if (shift.assigneeId !== platformUser.id && platformUser.role !== 'MANAGER') {
      throw new ValidationError('Only the assigned staff member or a MANAGER can complete this shift');
    }

    if (shift.status !== 'IN_PROGRESS') {
      throw new ValidationError(`Cannot complete shift with status '${shift.status}'. Must be IN_PROGRESS.`);
    }

    const updated = await prisma.shift.update({
      where: { id: req.params.id },
      data: { status: 'COMPLETED' },
      include: { assignee: { select: { id: true, unitNumber: true, role: true, userId: true } } },
    });

    notifyShiftUpdate(updated);
    res.json(updated);
  })
);

// ─── POST /:id/cancel ─────────────────────────────────────────────────────
// Cancel a shift (MANAGER only)

router.post(
  '/:id/cancel',
  requirePlatformRole('MANAGER'),
  asyncHandler(async (req, res) => {
    const shift = await prisma.shift.findUnique({ where: { id: req.params.id } });

    if (!shift) {
      throw new NotFoundError(`Shift ${req.params.id} not found`);
    }

    if (shift.status === 'COMPLETED' || shift.status === 'CANCELLED') {
      throw new ValidationError(`Cannot cancel shift with status '${shift.status}'`);
    }

    const updated = await prisma.shift.update({
      where: { id: req.params.id },
      data: { status: 'CANCELLED' },
      include: { assignee: { select: { id: true, unitNumber: true, role: true, userId: true } } },
    });

    notifyShiftUpdate(updated);
    res.json(updated);
  })
);

// ─── POST /keys ────────────────────────────────────────────────────────────
// Log a key checkout or return (REQ-4.16-1)

router.post(
  '/keys',
  requirePlatformRole('SECURITY', 'CONCIERGE', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const platformUser = req.platformUser!;
    const { keyName, action, shiftId, notes } = req.body;

    if (!keyName || typeof keyName !== 'string' || !keyName.trim()) {
      throw new ValidationError('keyName is required');
    }
    if (!action || !['CHECK_OUT', 'RETURN'].includes(action)) {
      throw new ValidationError('action must be CHECK_OUT or RETURN');
    }

    // If shiftId provided, verify it exists
    if (shiftId) {
      const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
      if (!shift) {
        throw new ValidationError('shiftId does not match an existing shift');
      }
    }

    const keyLog = await prisma.keyLog.create({
      data: {
        keyName: keyName.trim(),
        action,
        performedBy: platformUser.id,
        shiftId: shiftId ?? null,
        notes: notes ?? null,
      },
      include: { performer: { select: { id: true, unitNumber: true, role: true } } },
    });

    res.status(201).json(keyLog);
  })
);

export default router;
