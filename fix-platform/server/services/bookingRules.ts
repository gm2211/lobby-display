/**
 * Booking Rules Engine
 *
 * Enforces amenity booking rules for the Renzo platform.
 *
 * Rules enforced:
 *  1. Max bookings per day per user  (AmenityRuleType.MAX_BOOKINGS_PER_DAY)
 *  2. Max bookings per week per user (AmenityRuleType.MAX_BOOKINGS_PER_WEEK)
 *  3. Blackout dates                 (AmenityRuleType.BLACKOUT_DATE)
 *  4. Role restrictions              (AmenityRuleType.ROLE_RESTRICTION)
 *  5. Capacity limits                (amenity.capacity + concurrent bookings)
 *  6. Advance notice                 (amenity.minAdvanceHours)
 *  7. Max duration                   (amenity.maxDurationHours)
 */

import prisma from '../db.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Valid PlatformRole values (mirrors the Prisma enum in platform schema). */
export type PlatformRoleValue =
  | 'RESIDENT'
  | 'BOARD_MEMBER'
  | 'MANAGER'
  | 'SECURITY'
  | 'CONCIERGE';

export interface ValidateBookingParams {
  amenityId: string;
  userId: string;
  /** The requesting user's platform role — used for ROLE_RESTRICTION rules. */
  userRole: PlatformRoleValue;
  startTime: Date;
  endTime: Date;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface TimeSlot {
  startTime: Date;
  endTime: Date;
  /** How many bookings currently exist for this slot. */
  bookingCount: number;
  /** Whether new bookings can be made (not full, not blackout, etc.). */
  available: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Return midnight (local) for a given Date. */
function startOfDay(d: Date): Date {
  const result = new Date(d);
  result.setHours(0, 0, 0, 0);
  return result;
}

/** Return 23:59:59.999 (local) for a given Date. */
function endOfDay(d: Date): Date {
  const result = new Date(d);
  result.setHours(23, 59, 59, 999);
  return result;
}

/** Return midnight of the Monday of the week containing `d`. */
function startOfWeek(d: Date): Date {
  const result = new Date(d);
  const day = result.getDay(); // 0=Sun … 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // adjust so Monday=0
  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

/** Return 23:59:59.999 of the Sunday of the week containing `d`. */
function endOfWeek(d: Date): Date {
  const result = startOfWeek(d);
  result.setDate(result.getDate() + 6);
  result.setHours(23, 59, 59, 999);
  return result;
}

/** Parse an HH:MM string into { hours, minutes }. */
function parseTime(hhmm: string): { hours: number; minutes: number } {
  const [h, m] = hhmm.split(':').map(Number);
  return { hours: h, minutes: m };
}

/** Build a Date on the same calendar day as `base` with the given HH:MM. */
function buildDateTime(base: Date, hhmm: string): Date {
  const { hours, minutes } = parseTime(hhmm);
  const result = new Date(base);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

// ---------------------------------------------------------------------------
// validateBooking
// ---------------------------------------------------------------------------

/**
 * Validate a booking request against all active amenity rules.
 *
 * @returns `{ valid, errors }` where `errors` is an array of human-readable
 *          messages explaining each violated rule.
 */
export async function validateBooking(
  params: ValidateBookingParams,
): Promise<ValidationResult> {
  const { amenityId, userId, userRole, startTime, endTime } = params;
  const errors: string[] = [];

  // -----------------------------------------------------------------------
  // 1. Load amenity with its rules
  // -----------------------------------------------------------------------
  const amenity = await prisma.amenity.findUnique({
    where: { id: amenityId },
    include: { rules: true },
  });

  if (!amenity) {
    return { valid: false, errors: ['Amenity not found'] };
  }

  if (!amenity.active) {
    return { valid: false, errors: ['Amenity is not currently available'] };
  }

  // -----------------------------------------------------------------------
  // 2. Basic time validation
  // -----------------------------------------------------------------------
  const now = new Date();

  if (endTime <= startTime) {
    errors.push('End time must be after start time');
  }

  // -----------------------------------------------------------------------
  // 3. Advance notice (minAdvanceHours)
  // -----------------------------------------------------------------------
  const hoursUntilStart = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hoursUntilStart < amenity.minAdvanceHours) {
    if (hoursUntilStart < 0) {
      errors.push(
        `Booking start time is in the past — advance notice of ${amenity.minAdvanceHours} hour(s) required`,
      );
    } else {
      errors.push(
        `Booking requires at least ${amenity.minAdvanceHours} hour(s) advance notice`,
      );
    }
  }

  // -----------------------------------------------------------------------
  // 4. Max duration (maxDurationHours)
  // -----------------------------------------------------------------------
  if (endTime > startTime) {
    const durationHours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
    if (durationHours > amenity.maxDurationHours) {
      errors.push(
        `Booking duration (${durationHours.toFixed(1)}h) exceeds maximum allowed duration of ${amenity.maxDurationHours} hours`,
      );
    }
  }

  // -----------------------------------------------------------------------
  // 5. Capacity limits
  // -----------------------------------------------------------------------
  if (amenity.capacity !== null) {
    const concurrentCount = await prisma.booking.count({
      where: {
        amenityId,
        status: { in: ['PENDING', 'APPROVED'] },
        // overlapping bookings: start < endTime AND end > startTime
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });

    if (concurrentCount >= amenity.capacity) {
      errors.push(
        `Amenity is at full capacity (${amenity.capacity}) for the requested time slot`,
      );
    }
  }

  // -----------------------------------------------------------------------
  // 6. Active AmenityRule checks
  // -----------------------------------------------------------------------
  const activeRules = amenity.rules.filter((r) => r.active);

  for (const rule of activeRules) {
    const value = rule.ruleValue as Record<string, unknown>;

    switch (rule.ruleType) {
      // -------------------------------------------------------------------
      // MAX_BOOKINGS_PER_DAY
      // -------------------------------------------------------------------
      case 'MAX_BOOKINGS_PER_DAY': {
        const limit = value.limit as number;
        const dayStart = startOfDay(startTime);
        const dayEnd = endOfDay(startTime);

        const countToday = await prisma.booking.count({
          where: {
            amenityId,
            userId,
            status: { in: ['PENDING', 'APPROVED', 'COMPLETED'] },
            startTime: { gte: dayStart, lte: dayEnd },
          },
        });

        if (countToday >= limit) {
          errors.push(
            `You have reached the daily booking limit of ${limit} for this amenity`,
          );
        }
        break;
      }

      // -------------------------------------------------------------------
      // MAX_BOOKINGS_PER_WEEK
      // -------------------------------------------------------------------
      case 'MAX_BOOKINGS_PER_WEEK': {
        const limit = value.limit as number;
        const weekStart = startOfWeek(startTime);
        const weekEnd = endOfWeek(startTime);

        const countThisWeek = await prisma.booking.count({
          where: {
            amenityId,
            userId,
            status: { in: ['PENDING', 'APPROVED', 'COMPLETED'] },
            startTime: { gte: weekStart, lte: weekEnd },
          },
        });

        if (countThisWeek >= limit) {
          errors.push(
            `You have reached the weekly booking limit of ${limit} for this amenity`,
          );
        }
        break;
      }

      // -------------------------------------------------------------------
      // BLACKOUT_DATE
      // -------------------------------------------------------------------
      case 'BLACKOUT_DATE': {
        const blackoutDateStr = value.date as string; // YYYY-MM-DD
        const bookingDateStr = startTime.toISOString().slice(0, 10);

        if (bookingDateStr === blackoutDateStr) {
          errors.push(
            `This amenity is not available on ${blackoutDateStr} (blackout date)`,
          );
        }
        break;
      }

      // -------------------------------------------------------------------
      // ROLE_RESTRICTION
      // -------------------------------------------------------------------
      case 'ROLE_RESTRICTION': {
        const allowedRoles = value.allowedRoles as string[];

        if (!allowedRoles.includes(userRole)) {
          errors.push(
            `Your role (${userRole}) is not allowed to book this amenity. ` +
              `Allowed roles: ${allowedRoles.join(', ')}`,
          );
        }
        break;
      }

      // CUSTOM rules are not enforced by the engine (reserved for future use)
      default:
        break;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ---------------------------------------------------------------------------
// checkAvailability
// ---------------------------------------------------------------------------

/**
 * Return available time slots for a given amenity on a specific date.
 *
 * Slots are generated based on the amenity's operating hours
 * (`availableFrom` → `availableTo`) using `maxDurationHours` as the slot
 * size.  Each slot's `available` flag is set to `false` if the amenity is
 * at full capacity for that window.
 *
 * Returns an empty array if:
 *  - The amenity does not exist
 *  - The amenity is not active
 *  - The requested date is not in `daysAvailable`
 */
export async function checkAvailability(amenityId: string, date: Date): Promise<TimeSlot[]> {
  const amenity = await prisma.amenity.findUnique({
    where: { id: amenityId },
    include: { rules: true },
  });

  if (!amenity || !amenity.active) {
    return [];
  }

  // Check if this day of week is available (0=Sun … 6=Sat)
  const dayOfWeek = date.getDay();
  if (!amenity.daysAvailable.includes(dayOfWeek)) {
    return [];
  }

  // Build slot boundaries
  const slotDurationMs = amenity.maxDurationHours * 60 * 60 * 1000;
  const openTime = buildDateTime(date, amenity.availableFrom);
  const closeTime = buildDateTime(date, amenity.availableTo);

  if (closeTime <= openTime) {
    return [];
  }

  // Generate slots
  const slots: TimeSlot[] = [];
  let cursor = openTime;
  while (cursor.getTime() + slotDurationMs <= closeTime.getTime()) {
    const slotStart = new Date(cursor);
    const slotEnd = new Date(cursor.getTime() + slotDurationMs);
    slots.push({ startTime: slotStart, endTime: slotEnd, bookingCount: 0, available: true });
    cursor = slotEnd;
  }

  if (slots.length === 0) {
    return [];
  }

  // Fetch all bookings for this amenity on this date
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);

  const existingBookings = await prisma.booking.findMany({
    where: {
      amenityId,
      status: { in: ['PENDING', 'APPROVED'] },
      startTime: { lt: dayEnd },
      endTime: { gt: dayStart },
    },
    select: { id: true, startTime: true, endTime: true, status: true },
  });

  // For each slot, count overlapping bookings and determine availability
  for (const slot of slots) {
    const overlapping = existingBookings.filter(
      (b) => b.startTime < slot.endTime && b.endTime > slot.startTime,
    );
    slot.bookingCount = overlapping.length;

    if (amenity.capacity !== null) {
      slot.available = slot.bookingCount < amenity.capacity;
    } else {
      // No capacity limit — always available
      slot.available = true;
    }
  }

  return slots;
}
