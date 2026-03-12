/**
 * Unit tests for the Waitlist Service.
 *
 * Tests follow TDD (Red/Blue): written first, before implementation.
 *
 * Functions tested:
 *  - joinWaitlist(userId, amenityId, startTime, endTime)
 *      Creates a Booking with status WAITLISTED
 *  - promoteFromWaitlist(amenityId, startTime, endTime)
 *      Finds earliest WAITLISTED booking and promotes it to PENDING/APPROVED
 *  - getWaitlistPosition(bookingId)
 *      Returns 1-based position in waitlist (count of earlier WAITLISTED bookings + 1)
 *  - cancelWaitlist(bookingId, userId)
 *      Verifies ownership and WAITLISTED status, then sets status to CANCELLED
 *
 * All Prisma calls are mocked — no database required.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma before importing the service
vi.mock('../../server/db.js', () => ({
  default: {
    booking: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    amenity: {
      findUnique: vi.fn(),
    },
  },
}));

import prisma from '../../server/db.js';
import {
  joinWaitlist,
  promoteFromWaitlist,
  getWaitlistPosition,
  cancelWaitlist,
} from '../../server/services/waitlist.js';

// Type helpers for mocked Prisma functions
const mockPrisma = prisma as {
  booking: {
    create: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  amenity: {
    findUnique: ReturnType<typeof vi.fn>;
  };
};

// Sample data fixtures
const amenityId = 'amenity-uuid-1';
const userId = 'platform-user-uuid-1';
const otherUserId = 'platform-user-uuid-2';
const startTime = new Date('2026-03-01T10:00:00Z');
const endTime = new Date('2026-03-01T11:00:00Z');

const sampleWaitlistedBooking = {
  id: 'booking-uuid-waitlist-1',
  amenityId,
  userId,
  startTime,
  endTime,
  status: 'WAITLISTED' as const,
  notes: null,
  approvedBy: null,
  approvedAt: null,
  cancellationReason: null,
  createdAt: new Date('2026-02-01T12:00:00Z'),
  updatedAt: new Date('2026-02-01T12:00:00Z'),
};

const sampleAmenityWithApproval = {
  id: amenityId,
  name: 'Rooftop Pool',
  requiresApproval: true,
};

const sampleAmenityNoApproval = {
  id: amenityId,
  name: 'Gym',
  requiresApproval: false,
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── joinWaitlist ─────────────────────────────────────────────────────────────

describe('joinWaitlist', () => {
  it('creates a booking with status WAITLISTED', async () => {
    mockPrisma.booking.create.mockResolvedValue(sampleWaitlistedBooking);

    const result = await joinWaitlist(userId, amenityId, startTime, endTime);

    expect(mockPrisma.booking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId,
          amenityId,
          startTime,
          endTime,
          status: 'WAITLISTED',
        }),
      }),
    );
    expect(result.status).toBe('WAITLISTED');
  });

  it('returns the created waitlisted booking', async () => {
    mockPrisma.booking.create.mockResolvedValue(sampleWaitlistedBooking);

    const result = await joinWaitlist(userId, amenityId, startTime, endTime);

    expect(result).toEqual(sampleWaitlistedBooking);
  });

  it('passes amenityId and userId correctly to create', async () => {
    mockPrisma.booking.create.mockResolvedValue(sampleWaitlistedBooking);

    await joinWaitlist(userId, amenityId, startTime, endTime);

    const createArgs = mockPrisma.booking.create.mock.calls[0][0];
    expect(createArgs.data.amenityId).toBe(amenityId);
    expect(createArgs.data.userId).toBe(userId);
  });

  it('passes startTime and endTime correctly to create', async () => {
    mockPrisma.booking.create.mockResolvedValue(sampleWaitlistedBooking);

    await joinWaitlist(userId, amenityId, startTime, endTime);

    const createArgs = mockPrisma.booking.create.mock.calls[0][0];
    expect(createArgs.data.startTime).toEqual(startTime);
    expect(createArgs.data.endTime).toEqual(endTime);
  });

  it('accepts an optional notes parameter', async () => {
    const bookingWithNotes = { ...sampleWaitlistedBooking, notes: 'Special request' };
    mockPrisma.booking.create.mockResolvedValue(bookingWithNotes);

    const result = await joinWaitlist(userId, amenityId, startTime, endTime, 'Special request');

    const createArgs = mockPrisma.booking.create.mock.calls[0][0];
    expect(createArgs.data.notes).toBe('Special request');
    expect(result.notes).toBe('Special request');
  });

  it('sets notes to null when not provided', async () => {
    mockPrisma.booking.create.mockResolvedValue(sampleWaitlistedBooking);

    await joinWaitlist(userId, amenityId, startTime, endTime);

    const createArgs = mockPrisma.booking.create.mock.calls[0][0];
    expect(createArgs.data.notes).toBeNull();
  });
});

// ─── promoteFromWaitlist ──────────────────────────────────────────────────────

describe('promoteFromWaitlist', () => {
  it('returns null when no WAITLISTED bookings exist', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(null);

    const result = await promoteFromWaitlist(amenityId, startTime, endTime);

    expect(result).toBeNull();
  });

  it('finds the earliest WAITLISTED booking for the amenity/time slot', async () => {
    mockPrisma.amenity.findUnique.mockResolvedValue(sampleAmenityNoApproval);
    mockPrisma.booking.findFirst.mockResolvedValue(sampleWaitlistedBooking);
    mockPrisma.booking.update.mockResolvedValue({ ...sampleWaitlistedBooking, status: 'APPROVED' });

    await promoteFromWaitlist(amenityId, startTime, endTime);

    expect(mockPrisma.booking.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          amenityId,
          startTime,
          endTime,
          status: 'WAITLISTED',
        }),
        orderBy: expect.objectContaining({
          createdAt: 'asc',
        }),
      }),
    );
  });

  it('promotes to APPROVED when amenity does NOT require approval', async () => {
    mockPrisma.amenity.findUnique.mockResolvedValue(sampleAmenityNoApproval);
    mockPrisma.booking.findFirst.mockResolvedValue(sampleWaitlistedBooking);
    const promotedBooking = { ...sampleWaitlistedBooking, status: 'APPROVED' };
    mockPrisma.booking.update.mockResolvedValue(promotedBooking);

    const result = await promoteFromWaitlist(amenityId, startTime, endTime);

    expect(mockPrisma.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: sampleWaitlistedBooking.id },
        data: expect.objectContaining({
          status: 'APPROVED',
        }),
      }),
    );
    expect(result?.status).toBe('APPROVED');
  });

  it('promotes to PENDING when amenity requires approval', async () => {
    mockPrisma.amenity.findUnique.mockResolvedValue(sampleAmenityWithApproval);
    mockPrisma.booking.findFirst.mockResolvedValue(sampleWaitlistedBooking);
    const promotedBooking = { ...sampleWaitlistedBooking, status: 'PENDING' };
    mockPrisma.booking.update.mockResolvedValue(promotedBooking);

    const result = await promoteFromWaitlist(amenityId, startTime, endTime);

    expect(mockPrisma.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: sampleWaitlistedBooking.id },
        data: expect.objectContaining({
          status: 'PENDING',
        }),
      }),
    );
    expect(result?.status).toBe('PENDING');
  });

  it('returns the promoted booking', async () => {
    mockPrisma.amenity.findUnique.mockResolvedValue(sampleAmenityNoApproval);
    mockPrisma.booking.findFirst.mockResolvedValue(sampleWaitlistedBooking);
    const promotedBooking = { ...sampleWaitlistedBooking, status: 'APPROVED' };
    mockPrisma.booking.update.mockResolvedValue(promotedBooking);

    const result = await promoteFromWaitlist(amenityId, startTime, endTime);

    expect(result).toEqual(promotedBooking);
  });

  it('looks up the amenity to determine the promotion status', async () => {
    mockPrisma.amenity.findUnique.mockResolvedValue(sampleAmenityNoApproval);
    mockPrisma.booking.findFirst.mockResolvedValue(sampleWaitlistedBooking);
    mockPrisma.booking.update.mockResolvedValue({ ...sampleWaitlistedBooking, status: 'APPROVED' });

    await promoteFromWaitlist(amenityId, startTime, endTime);

    expect(mockPrisma.amenity.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: amenityId },
      }),
    );
  });

  it('defaults to PENDING when amenity is not found (safe fallback)', async () => {
    mockPrisma.amenity.findUnique.mockResolvedValue(null);
    mockPrisma.booking.findFirst.mockResolvedValue(sampleWaitlistedBooking);
    const promotedBooking = { ...sampleWaitlistedBooking, status: 'PENDING' };
    mockPrisma.booking.update.mockResolvedValue(promotedBooking);

    const result = await promoteFromWaitlist(amenityId, startTime, endTime);

    const updateArgs = mockPrisma.booking.update.mock.calls[0][0];
    expect(updateArgs.data.status).toBe('PENDING');
    expect(result?.status).toBe('PENDING');
  });
});

// ─── getWaitlistPosition ──────────────────────────────────────────────────────

describe('getWaitlistPosition', () => {
  const bookingId = 'booking-uuid-waitlist-1';

  it('returns 1 when the booking is first in the waitlist', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(sampleWaitlistedBooking);
    // 0 bookings before this one
    mockPrisma.booking.count.mockResolvedValue(0);

    const position = await getWaitlistPosition(bookingId);

    expect(position).toBe(1);
  });

  it('returns 2 when there is 1 earlier WAITLISTED booking', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(sampleWaitlistedBooking);
    // 1 booking before this one
    mockPrisma.booking.count.mockResolvedValue(1);

    const position = await getWaitlistPosition(bookingId);

    expect(position).toBe(2);
  });

  it('returns N+1 when there are N earlier WAITLISTED bookings', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(sampleWaitlistedBooking);
    mockPrisma.booking.count.mockResolvedValue(4);

    const position = await getWaitlistPosition(bookingId);

    expect(position).toBe(5);
  });

  it('counts only WAITLISTED bookings for the same amenity/time before this booking', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(sampleWaitlistedBooking);
    mockPrisma.booking.count.mockResolvedValue(2);

    await getWaitlistPosition(bookingId);

    expect(mockPrisma.booking.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          amenityId: sampleWaitlistedBooking.amenityId,
          startTime: sampleWaitlistedBooking.startTime,
          endTime: sampleWaitlistedBooking.endTime,
          status: 'WAITLISTED',
          createdAt: expect.objectContaining({
            lt: sampleWaitlistedBooking.createdAt,
          }),
        }),
      }),
    );
  });

  it('throws an error when the booking is not found', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(null);

    await expect(getWaitlistPosition('nonexistent-id')).rejects.toThrow();
  });

  it('throws an error when the booking is not WAITLISTED', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({
      ...sampleWaitlistedBooking,
      status: 'PENDING',
    });

    await expect(getWaitlistPosition(bookingId)).rejects.toThrow();
  });
});

// ─── cancelWaitlist ───────────────────────────────────────────────────────────

describe('cancelWaitlist', () => {
  const bookingId = 'booking-uuid-waitlist-1';

  it('cancels a WAITLISTED booking belonging to the user', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(sampleWaitlistedBooking);
    const cancelledBooking = { ...sampleWaitlistedBooking, status: 'CANCELLED' };
    mockPrisma.booking.update.mockResolvedValue(cancelledBooking);

    const result = await cancelWaitlist(bookingId, userId);

    expect(mockPrisma.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: bookingId },
        data: expect.objectContaining({
          status: 'CANCELLED',
        }),
      }),
    );
    expect(result.status).toBe('CANCELLED');
  });

  it('throws an error when the booking does not belong to the user', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({
      ...sampleWaitlistedBooking,
      userId: otherUserId,
    });

    await expect(cancelWaitlist(bookingId, userId)).rejects.toThrow();
    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
  });

  it('throws an error when the booking is not found', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(null);

    await expect(cancelWaitlist(bookingId, userId)).rejects.toThrow();
    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
  });

  it('throws an error when the booking is not WAITLISTED', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({
      ...sampleWaitlistedBooking,
      userId,
      status: 'PENDING',
    });

    await expect(cancelWaitlist(bookingId, userId)).rejects.toThrow();
    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
  });

  it('verifies the booking belongs to the user before cancelling', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(sampleWaitlistedBooking);
    mockPrisma.booking.update.mockResolvedValue({ ...sampleWaitlistedBooking, status: 'CANCELLED' });

    await cancelWaitlist(bookingId, userId);

    // Should have looked up the booking first
    expect(mockPrisma.booking.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: bookingId },
      }),
    );
  });
});
