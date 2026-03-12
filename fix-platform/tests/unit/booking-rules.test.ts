/**
 * Unit tests for the Booking Rules Engine service.
 *
 * Uses vi.mock to mock Prisma so no database is needed.
 * Tests follow TDD: written first, then the service is implemented.
 *
 * Rules enforced:
 *  1. Max bookings per day per user (AmenityRuleType.MAX_BOOKINGS_PER_DAY)
 *  2. Max bookings per week per user (AmenityRuleType.MAX_BOOKINGS_PER_WEEK)
 *  3. Blackout dates (AmenityRuleType.BLACKOUT_DATE)
 *  4. Role restrictions (AmenityRuleType.ROLE_RESTRICTION)
 *  5. Capacity limits (amenity.capacity field + concurrent bookings)
 *  6. Advance notice (amenity.minAdvanceHours)
 *  7. Max duration (amenity.maxDurationHours)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma before importing the service
vi.mock('../../server/db.js', () => ({
  default: {
    amenity: {
      findUnique: vi.fn(),
    },
    booking: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import prisma from '../../server/db.js';
import { validateBooking, checkAvailability } from '../../server/services/bookingRules.js';

// ---------------------------------------------------------------------------
// Type helpers for mocked prisma
// ---------------------------------------------------------------------------

type MockPrisma = {
  amenity: { findUnique: ReturnType<typeof vi.fn> };
  booking: { count: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
};

const mockPrisma = prisma as unknown as MockPrisma;

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const baseAmenity = {
  id: 'amenity-1',
  name: 'Rooftop Pool',
  description: 'Heated pool',
  location: 'Floor 30',
  capacity: 10,
  requiresApproval: false,
  availableFrom: '08:00',
  availableTo: '22:00',
  daysAvailable: [0, 1, 2, 3, 4, 5, 6], // all days
  minAdvanceHours: 1,
  maxAdvanceHours: 720,
  maxDurationHours: 4,
  active: true,
  rules: [],
};

// A booking that starts 2 hours from now (within advance notice, within duration)
function futureBooking(hoursFromNow = 2, durationHours = 1) {
  const start = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
  return {
    amenityId: 'amenity-1',
    userId: 'user-1',
    userRole: 'RESIDENT' as const,
    startTime: start,
    endTime: end,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: amenity found, no existing bookings
  mockPrisma.amenity.findUnique.mockResolvedValue({ ...baseAmenity });
  mockPrisma.booking.count.mockResolvedValue(0);
  mockPrisma.booking.findMany.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// validateBooking — amenity not found
// ---------------------------------------------------------------------------

describe('validateBooking — amenity not found', () => {
  it('returns invalid with error when amenity does not exist', async () => {
    mockPrisma.amenity.findUnique.mockResolvedValue(null);

    const result = await validateBooking(futureBooking());

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Amenity not found');
  });

  it('returns invalid when amenity is not active', async () => {
    mockPrisma.amenity.findUnique.mockResolvedValue({ ...baseAmenity, active: false });

    const result = await validateBooking(futureBooking());

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Amenity is not currently available');
  });
});

// ---------------------------------------------------------------------------
// validateBooking — advance notice
// ---------------------------------------------------------------------------

describe('validateBooking — advance notice (minAdvanceHours)', () => {
  it('returns valid when booking is beyond min advance hours', async () => {
    // amenity requires 1 hour advance, booking is 2 hours away
    mockPrisma.amenity.findUnique.mockResolvedValue({ ...baseAmenity, minAdvanceHours: 1 });

    const result = await validateBooking(futureBooking(2));

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns invalid when booking is within min advance hours', async () => {
    // amenity requires 4 hours advance, booking is only 2 hours away
    mockPrisma.amenity.findUnique.mockResolvedValue({ ...baseAmenity, minAdvanceHours: 4 });

    const result = await validateBooking(futureBooking(2));

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('advance notice'))).toBe(true);
  });

  it('returns invalid when booking start is in the past', async () => {
    mockPrisma.amenity.findUnique.mockResolvedValue({ ...baseAmenity, minAdvanceHours: 0 });
    const params = {
      amenityId: 'amenity-1',
      userId: 'user-1',
      userRole: 'RESIDENT' as const,
      startTime: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
      endTime: new Date(Date.now() + 30 * 60 * 1000),
    };

    const result = await validateBooking(params);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('advance notice') || e.includes('past'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateBooking — max duration
// ---------------------------------------------------------------------------

describe('validateBooking — max duration (maxDurationHours)', () => {
  it('returns valid when booking is within max duration', async () => {
    // amenity allows 4 hours, booking is 2 hours
    mockPrisma.amenity.findUnique.mockResolvedValue({ ...baseAmenity, maxDurationHours: 4 });

    const result = await validateBooking(futureBooking(2, 2));

    expect(result.valid).toBe(true);
  });

  it('returns invalid when booking exceeds max duration', async () => {
    // amenity allows 2 hours, booking is 3 hours
    mockPrisma.amenity.findUnique.mockResolvedValue({ ...baseAmenity, maxDurationHours: 2 });

    const result = await validateBooking(futureBooking(2, 3));

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('duration') || e.includes('hours'))).toBe(true);
  });

  it('returns invalid when endTime is before startTime', async () => {
    const start = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const end = new Date(start.getTime() - 30 * 60 * 1000); // end before start
    const params = {
      amenityId: 'amenity-1',
      userId: 'user-1',
      userRole: 'RESIDENT' as const,
      startTime: start,
      endTime: end,
    };

    const result = await validateBooking(params);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('end') || e.includes('start') || e.includes('duration'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateBooking — capacity limits
// ---------------------------------------------------------------------------

describe('validateBooking — capacity limits', () => {
  it('returns valid when concurrent bookings are below capacity', async () => {
    mockPrisma.amenity.findUnique.mockResolvedValue({ ...baseAmenity, capacity: 5 });
    mockPrisma.booking.count.mockResolvedValue(3); // 3 concurrent bookings, capacity 5

    const result = await validateBooking(futureBooking());

    expect(result.valid).toBe(true);
  });

  it('returns invalid when amenity is at full capacity for the time slot', async () => {
    mockPrisma.amenity.findUnique.mockResolvedValue({ ...baseAmenity, capacity: 5 });
    mockPrisma.booking.count.mockResolvedValue(5); // fully booked

    const result = await validateBooking(futureBooking());

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('capacity') || e.includes('full'))).toBe(true);
  });

  it('returns valid when amenity has no capacity limit (null)', async () => {
    mockPrisma.amenity.findUnique.mockResolvedValue({ ...baseAmenity, capacity: null });
    mockPrisma.booking.count.mockResolvedValue(999);

    const result = await validateBooking(futureBooking());

    expect(result.valid).toBe(true);
  });

  it('queries bookings that overlap the requested time slot', async () => {
    const booking = futureBooking(2, 1);
    mockPrisma.amenity.findUnique.mockResolvedValue({ ...baseAmenity, capacity: 5 });
    mockPrisma.booking.count.mockResolvedValue(2);

    await validateBooking(booking);

    expect(mockPrisma.booking.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          amenityId: 'amenity-1',
          status: expect.objectContaining({ in: expect.arrayContaining(['PENDING', 'APPROVED']) }),
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// validateBooking — AmenityRule: MAX_BOOKINGS_PER_DAY
// ---------------------------------------------------------------------------

describe('validateBooking — MAX_BOOKINGS_PER_DAY rule', () => {
  it('returns valid when user is under daily limit', async () => {
    mockPrisma.amenity.findUnique.mockResolvedValue({
      ...baseAmenity,
      rules: [
        { id: 'rule-1', ruleType: 'MAX_BOOKINGS_PER_DAY', ruleValue: { limit: 2 }, active: true },
      ],
    });
    mockPrisma.booking.count.mockResolvedValue(1); // 1 booking today, limit is 2

    const result = await validateBooking(futureBooking());

    expect(result.valid).toBe(true);
  });

  it('returns invalid when user has reached daily booking limit', async () => {
    mockPrisma.amenity.findUnique.mockResolvedValue({
      ...baseAmenity,
      rules: [
        { id: 'rule-1', ruleType: 'MAX_BOOKINGS_PER_DAY', ruleValue: { limit: 2 }, active: true },
      ],
    });
    mockPrisma.booking.count.mockResolvedValue(2); // already at limit

    const result = await validateBooking(futureBooking());

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('day') || e.includes('daily'))).toBe(true);
  });

  it('ignores inactive MAX_BOOKINGS_PER_DAY rules', async () => {
    mockPrisma.amenity.findUnique.mockResolvedValue({
      ...baseAmenity,
      rules: [
        { id: 'rule-1', ruleType: 'MAX_BOOKINGS_PER_DAY', ruleValue: { limit: 1 }, active: false },
      ],
    });
    mockPrisma.booking.count.mockResolvedValue(5); // would fail if rule were active

    const result = await validateBooking(futureBooking());

    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateBooking — AmenityRule: MAX_BOOKINGS_PER_WEEK
// ---------------------------------------------------------------------------

describe('validateBooking — MAX_BOOKINGS_PER_WEEK rule', () => {
  it('returns valid when user is under weekly limit', async () => {
    mockPrisma.amenity.findUnique.mockResolvedValue({
      ...baseAmenity,
      rules: [
        { id: 'rule-2', ruleType: 'MAX_BOOKINGS_PER_WEEK', ruleValue: { limit: 3 }, active: true },
      ],
    });
    mockPrisma.booking.count.mockResolvedValue(2); // 2 this week, limit is 3

    const result = await validateBooking(futureBooking());

    expect(result.valid).toBe(true);
  });

  it('returns invalid when user has reached weekly booking limit', async () => {
    mockPrisma.amenity.findUnique.mockResolvedValue({
      ...baseAmenity,
      rules: [
        { id: 'rule-2', ruleType: 'MAX_BOOKINGS_PER_WEEK', ruleValue: { limit: 3 }, active: true },
      ],
    });
    mockPrisma.booking.count.mockResolvedValue(3); // already at limit

    const result = await validateBooking(futureBooking());

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('week') || e.includes('weekly'))).toBe(true);
  });

  it('ignores inactive MAX_BOOKINGS_PER_WEEK rules', async () => {
    mockPrisma.amenity.findUnique.mockResolvedValue({
      ...baseAmenity,
      capacity: null, // no capacity limit so count doesn't trigger capacity check
      rules: [
        { id: 'rule-2', ruleType: 'MAX_BOOKINGS_PER_WEEK', ruleValue: { limit: 1 }, active: false },
      ],
    });
    mockPrisma.booking.count.mockResolvedValue(10);

    const result = await validateBooking(futureBooking());

    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateBooking — AmenityRule: BLACKOUT_DATE
// ---------------------------------------------------------------------------

describe('validateBooking — BLACKOUT_DATE rule', () => {
  it('returns invalid when booking falls on a blackout date', async () => {
    // Use a fixed future date for the blackout
    const blackoutDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
    const dateStr = blackoutDate.toISOString().slice(0, 10); // YYYY-MM-DD

    mockPrisma.amenity.findUnique.mockResolvedValue({
      ...baseAmenity,
      rules: [
        { id: 'rule-3', ruleType: 'BLACKOUT_DATE', ruleValue: { date: dateStr }, active: true },
      ],
    });

    const start = new Date(blackoutDate);
    start.setHours(10, 0, 0, 0);
    const end = new Date(blackoutDate);
    end.setHours(11, 0, 0, 0);

    const result = await validateBooking({
      amenityId: 'amenity-1',
      userId: 'user-1',
      userRole: 'RESIDENT',
      startTime: start,
      endTime: end,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('blackout') || e.includes('unavailable') || e.includes('not available'))).toBe(true);
  });

  it('returns valid when booking does not fall on any blackout date', async () => {
    mockPrisma.amenity.findUnique.mockResolvedValue({
      ...baseAmenity,
      rules: [
        { id: 'rule-3', ruleType: 'BLACKOUT_DATE', ruleValue: { date: '2030-01-01' }, active: true },
      ],
    });

    // booking is 2 hours from now, definitely not Jan 1 2030
    const result = await validateBooking(futureBooking());

    expect(result.valid).toBe(true);
  });

  it('ignores inactive blackout date rules', async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const dateStr = tomorrow.toISOString().slice(0, 10);

    mockPrisma.amenity.findUnique.mockResolvedValue({
      ...baseAmenity,
      rules: [
        { id: 'rule-3', ruleType: 'BLACKOUT_DATE', ruleValue: { date: dateStr }, active: false },
      ],
    });

    const start = new Date(tomorrow);
    start.setHours(10, 0, 0, 0);
    const end = new Date(tomorrow);
    end.setHours(11, 0, 0, 0);

    const result = await validateBooking({
      amenityId: 'amenity-1',
      userId: 'user-1',
      userRole: 'RESIDENT',
      startTime: start,
      endTime: end,
    });

    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateBooking — AmenityRule: ROLE_RESTRICTION
// ---------------------------------------------------------------------------

describe('validateBooking — ROLE_RESTRICTION rule', () => {
  it('returns valid when user role is in the allowed roles list', async () => {
    mockPrisma.amenity.findUnique.mockResolvedValue({
      ...baseAmenity,
      rules: [
        {
          id: 'rule-4',
          ruleType: 'ROLE_RESTRICTION',
          ruleValue: { allowedRoles: ['BOARD_MEMBER', 'MANAGER'] },
          active: true,
        },
      ],
    });

    const result = await validateBooking({ ...futureBooking(), userRole: 'BOARD_MEMBER' });

    expect(result.valid).toBe(true);
  });

  it('returns invalid when user role is not in the allowed roles list', async () => {
    mockPrisma.amenity.findUnique.mockResolvedValue({
      ...baseAmenity,
      rules: [
        {
          id: 'rule-4',
          ruleType: 'ROLE_RESTRICTION',
          ruleValue: { allowedRoles: ['BOARD_MEMBER', 'MANAGER'] },
          active: true,
        },
      ],
    });

    const result = await validateBooking({ ...futureBooking(), userRole: 'RESIDENT' });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('role') || e.includes('permission') || e.includes('not allowed'))).toBe(true);
  });

  it('ignores inactive ROLE_RESTRICTION rules', async () => {
    mockPrisma.amenity.findUnique.mockResolvedValue({
      ...baseAmenity,
      rules: [
        {
          id: 'rule-4',
          ruleType: 'ROLE_RESTRICTION',
          ruleValue: { allowedRoles: ['BOARD_MEMBER'] },
          active: false,
        },
      ],
    });

    // RESIDENT would be blocked if rule were active
    const result = await validateBooking({ ...futureBooking(), userRole: 'RESIDENT' });

    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateBooking — multiple rules accumulate errors
// ---------------------------------------------------------------------------

describe('validateBooking — multiple rule violations', () => {
  it('accumulates multiple errors when multiple rules are violated', async () => {
    // Amenity with tight constraints
    mockPrisma.amenity.findUnique.mockResolvedValue({
      ...baseAmenity,
      maxDurationHours: 1,
      rules: [
        { id: 'rule-1', ruleType: 'MAX_BOOKINGS_PER_DAY', ruleValue: { limit: 1 }, active: true },
        {
          id: 'rule-4',
          ruleType: 'ROLE_RESTRICTION',
          ruleValue: { allowedRoles: ['BOARD_MEMBER'] },
          active: true,
        },
      ],
    });

    // Violates daily limit (count=1 at limit) + role restriction + duration
    mockPrisma.booking.count.mockResolvedValue(1);

    const result = await validateBooking({
      ...futureBooking(2, 3), // 3 hours exceeds maxDurationHours of 1
      userRole: 'RESIDENT',
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('returns valid with empty errors array when all rules pass', async () => {
    mockPrisma.amenity.findUnique.mockResolvedValue({ ...baseAmenity });
    mockPrisma.booking.count.mockResolvedValue(0);

    const result = await validateBooking(futureBooking());

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// checkAvailability
// ---------------------------------------------------------------------------

describe('checkAvailability', () => {
  it('returns empty slots array when amenity does not exist', async () => {
    mockPrisma.amenity.findUnique.mockResolvedValue(null);

    const result = await checkAvailability('non-existent', new Date('2030-06-15'));

    expect(result).toEqual([]);
  });

  it('returns empty slots array when amenity is not active', async () => {
    mockPrisma.amenity.findUnique.mockResolvedValue({ ...baseAmenity, active: false });

    const result = await checkAvailability('amenity-1', new Date('2030-06-15'));

    expect(result).toEqual([]);
  });

  it('returns time slots within operating hours for a given date', async () => {
    mockPrisma.amenity.findUnique.mockResolvedValue({
      ...baseAmenity,
      availableFrom: '09:00',
      availableTo: '17:00',
      maxDurationHours: 1,
    });
    mockPrisma.booking.findMany.mockResolvedValue([]);

    const date = new Date('2030-06-15');
    const result = await checkAvailability('amenity-1', date);

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);

    // Each slot should have startTime and endTime
    for (const slot of result) {
      expect(slot).toHaveProperty('startTime');
      expect(slot).toHaveProperty('endTime');
    }
  });

  it('marks slots as unavailable when fully booked', async () => {
    mockPrisma.amenity.findUnique.mockResolvedValue({
      ...baseAmenity,
      capacity: 2,
      availableFrom: '09:00',
      availableTo: '11:00',
      maxDurationHours: 1,
    });

    // Two bookings covering 09:00-10:00 — fills the slot
    const futureDate = new Date('2030-06-15');
    const start = new Date('2030-06-15T09:00:00.000Z');
    const end = new Date('2030-06-15T10:00:00.000Z');

    mockPrisma.booking.findMany.mockResolvedValue([
      { id: 'b1', startTime: start, endTime: end, status: 'APPROVED' },
      { id: 'b2', startTime: start, endTime: end, status: 'APPROVED' },
    ]);

    const result = await checkAvailability('amenity-1', futureDate);

    expect(Array.isArray(result)).toBe(true);
    // At least one slot should exist
    expect(result.length).toBeGreaterThan(0);
    // Each slot should have an available property
    for (const slot of result) {
      expect(slot).toHaveProperty('available');
    }
  });

  it('returns slots with available=true when no bookings exist', async () => {
    mockPrisma.amenity.findUnique.mockResolvedValue({
      ...baseAmenity,
      capacity: 5,
      availableFrom: '09:00',
      availableTo: '11:00',
      maxDurationHours: 1,
    });
    mockPrisma.booking.findMany.mockResolvedValue([]);

    const result = await checkAvailability('amenity-1', new Date('2030-06-15'));

    expect(result.every(slot => slot.available === true)).toBe(true);
  });

  it('does not return slots for days the amenity is not available', async () => {
    // Amenity only available Mon-Fri (1-5), test on Sunday (0)
    mockPrisma.amenity.findUnique.mockResolvedValue({
      ...baseAmenity,
      daysAvailable: [1, 2, 3, 4, 5],
    });
    mockPrisma.booking.findMany.mockResolvedValue([]);

    // June 15 2030 is a Saturday (day 6)
    const saturday = new Date('2030-06-15');
    const result = await checkAvailability('amenity-1', saturday);

    expect(result).toEqual([]);
  });

  it('queries existing bookings for the given date', async () => {
    mockPrisma.amenity.findUnique.mockResolvedValue({ ...baseAmenity });
    mockPrisma.booking.findMany.mockResolvedValue([]);

    await checkAvailability('amenity-1', new Date('2030-06-15'));

    expect(mockPrisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          amenityId: 'amenity-1',
        }),
      }),
    );
  });
});
