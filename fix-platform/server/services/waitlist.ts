/**
 * Waitlist Service
 *
 * Manages a waitlist for fully-booked amenity time slots.
 *
 * Functions:
 *  - joinWaitlist(userId, amenityId, startTime, endTime, notes?)
 *      Creates a Booking record with status WAITLISTED.
 *      Position is implicit from createdAt ordering.
 *
 *  - promoteFromWaitlist(amenityId, startTime, endTime)
 *      Called when a booking is cancelled. Finds the earliest
 *      WAITLISTED booking for the same slot and promotes it to
 *      PENDING (if amenity.requiresApproval) or APPROVED.
 *      Returns the promoted booking or null if the waitlist is empty.
 *
 *  - getWaitlistPosition(bookingId)
 *      Returns the 1-based position of a WAITLISTED booking.
 *      Counts all WAITLISTED bookings for the same amenity/time slot
 *      created before this booking's createdAt.
 *
 *  - cancelWaitlist(bookingId, userId)
 *      Cancels a WAITLISTED booking. Verifies the booking belongs
 *      to the given user and is in WAITLISTED status.
 *      Throws if the booking is not found, not owned by userId,
 *      or not WAITLISTED.
 *
 * RELATED FILES:
 *  - prisma/schema.prisma          - Booking, BookingStatus (WAITLISTED), Amenity
 *  - server/routes/platform/bookings.ts  - Booking API routes
 *  - server/services/bookingRules.ts     - Booking rule validation
 *  - tests/unit/waitlist.test.ts         - Unit tests (Prisma mocked)
 */

import prisma from '../db.js';

// ---------------------------------------------------------------------------
// joinWaitlist
// ---------------------------------------------------------------------------

/**
 * Add a user to the waitlist for a fully-booked amenity time slot.
 *
 * Creates a Booking with status WAITLISTED. Position in the waitlist
 * is determined by createdAt ordering (first come, first served).
 *
 * @param userId    PlatformUser.id of the user joining the waitlist
 * @param amenityId Amenity.id for the requested amenity
 * @param startTime Start of the desired time slot
 * @param endTime   End of the desired time slot
 * @param notes     Optional notes for the booking
 * @returns The created WAITLISTED booking
 */
export async function joinWaitlist(
  userId: string,
  amenityId: string,
  startTime: Date,
  endTime: Date,
  notes?: string | null,
) {
  return prisma.booking.create({
    data: {
      userId,
      amenityId,
      startTime,
      endTime,
      status: 'WAITLISTED',
      notes: notes ?? null,
    },
  });
}

// ---------------------------------------------------------------------------
// promoteFromWaitlist
// ---------------------------------------------------------------------------

/**
 * Auto-promote the next person on the waitlist when a cancellation occurs.
 *
 * Finds the earliest WAITLISTED booking for the given amenity/time slot
 * (ordered by createdAt ascending) and updates its status to:
 *  - PENDING  if the amenity requires approval
 *  - APPROVED if the amenity does not require approval
 *
 * Falls back to PENDING if the amenity cannot be found (safe default).
 *
 * @param amenityId Amenity.id for the time slot that just opened up
 * @param startTime Start of the time slot
 * @param endTime   End of the time slot
 * @returns The promoted booking, or null if no one was waitlisted
 */
export async function promoteFromWaitlist(
  amenityId: string,
  startTime: Date,
  endTime: Date,
) {
  // Find the earliest WAITLISTED booking for this slot
  const nextInLine = await prisma.booking.findFirst({
    where: {
      amenityId,
      startTime,
      endTime,
      status: 'WAITLISTED',
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  if (!nextInLine) {
    return null;
  }

  // Look up the amenity to determine promotion status
  const amenity = await prisma.amenity.findUnique({
    where: { id: amenityId },
  });

  // Determine the target status: PENDING if approval required, else APPROVED
  // Fall back to PENDING if amenity not found (safe default)
  const newStatus = (amenity === null || amenity.requiresApproval) ? 'PENDING' : 'APPROVED';

  return prisma.booking.update({
    where: { id: nextInLine.id },
    data: {
      status: newStatus,
    },
  });
}

// ---------------------------------------------------------------------------
// getWaitlistPosition
// ---------------------------------------------------------------------------

/**
 * Get the 1-based position of a WAITLISTED booking in the queue.
 *
 * Counts all WAITLISTED bookings for the same amenity/time slot
 * that were created before this booking's createdAt, then adds 1.
 *
 * @param bookingId The Booking.id to check
 * @returns 1-based position in the waitlist (1 = next to be promoted)
 * @throws Error if the booking is not found or is not WAITLISTED
 */
export async function getWaitlistPosition(bookingId: string): Promise<number> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
  });

  if (!booking) {
    throw new Error(`Booking ${bookingId} not found`);
  }

  if (booking.status !== 'WAITLISTED') {
    throw new Error(
      `Booking ${bookingId} is not WAITLISTED (current status: ${booking.status})`,
    );
  }

  // Count how many WAITLISTED bookings for the same slot were created before this one
  const earlierCount = await prisma.booking.count({
    where: {
      amenityId: booking.amenityId,
      startTime: booking.startTime,
      endTime: booking.endTime,
      status: 'WAITLISTED',
      createdAt: {
        lt: booking.createdAt,
      },
    },
  });

  // Position is 1-based: 0 earlier = position 1, 1 earlier = position 2, etc.
  return earlierCount + 1;
}

// ---------------------------------------------------------------------------
// cancelWaitlist
// ---------------------------------------------------------------------------

/**
 * Remove a user from the waitlist.
 *
 * Verifies that:
 *  1. The booking exists
 *  2. The booking belongs to the given user
 *  3. The booking is currently WAITLISTED
 *
 * Then updates the status to CANCELLED.
 *
 * @param bookingId The Booking.id to cancel
 * @param userId    PlatformUser.id of the user attempting the cancellation
 * @returns The cancelled booking
 * @throws Error if booking not found, wrong owner, or not WAITLISTED
 */
export async function cancelWaitlist(bookingId: string, userId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
  });

  if (!booking) {
    throw new Error(`Booking ${bookingId} not found`);
  }

  if (booking.userId !== userId) {
    throw new Error(
      `Booking ${bookingId} does not belong to user ${userId}`,
    );
  }

  if (booking.status !== 'WAITLISTED') {
    throw new Error(
      `Booking ${bookingId} is not WAITLISTED (current status: ${booking.status})`,
    );
  }

  return prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: 'CANCELLED',
    },
  });
}
