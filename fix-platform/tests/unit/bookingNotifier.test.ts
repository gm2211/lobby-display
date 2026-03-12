/**
 * Unit tests for bookingNotifier service.
 *
 * Tests verify that notification functions call broadcastEvent
 * with the correct channel, event type, and payload.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock server/sse.ts before importing the notifier
vi.mock('../../server/sse.js', () => ({
  broadcastEvent: vi.fn(),
}));

import { broadcastEvent } from '../../server/sse.js';
import {
  notifyBookingApproved,
  notifyBookingRejected,
  notifyCapacityReached,
} from '../../server/services/bookingNotifier.js';

const mockBroadcastEvent = broadcastEvent as ReturnType<typeof vi.fn>;

describe('bookingNotifier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('notifyBookingApproved', () => {
    it('calls broadcastEvent with platform:bookings channel and booking:approved event', () => {
      const booking = { id: 1, amenityId: 42, userId: 7, status: 'approved' };
      notifyBookingApproved(booking);

      expect(mockBroadcastEvent).toHaveBeenCalledTimes(1);
      expect(mockBroadcastEvent).toHaveBeenCalledWith(
        'platform:bookings',
        'booking:approved',
        booking
      );
    });

    it('passes the full booking object as payload', () => {
      const booking = {
        id: 99,
        amenityId: 5,
        userId: 3,
        status: 'approved',
        startTime: '2026-02-26T10:00:00Z',
        endTime: '2026-02-26T11:00:00Z',
      };
      notifyBookingApproved(booking);

      const [, , payload] = mockBroadcastEvent.mock.calls[0];
      expect(payload).toEqual(booking);
    });
  });

  describe('notifyBookingRejected', () => {
    it('calls broadcastEvent with platform:bookings channel and booking:rejected event', () => {
      const booking = { id: 2, amenityId: 10, userId: 4, status: 'rejected' };
      notifyBookingRejected(booking);

      expect(mockBroadcastEvent).toHaveBeenCalledTimes(1);
      expect(mockBroadcastEvent).toHaveBeenCalledWith(
        'platform:bookings',
        'booking:rejected',
        booking
      );
    });

    it('passes the full booking object as payload', () => {
      const booking = {
        id: 55,
        amenityId: 8,
        userId: 12,
        status: 'rejected',
        reason: 'Facility unavailable',
      };
      notifyBookingRejected(booking);

      const [, , payload] = mockBroadcastEvent.mock.calls[0];
      expect(payload).toEqual(booking);
    });
  });

  describe('notifyCapacityReached', () => {
    it('calls broadcastEvent with platform:bookings channel and capacity:reached event', () => {
      notifyCapacityReached(42);

      expect(mockBroadcastEvent).toHaveBeenCalledTimes(1);
      expect(mockBroadcastEvent).toHaveBeenCalledWith(
        'platform:bookings',
        'capacity:reached',
        { amenityId: 42, eventId: undefined }
      );
    });

    it('includes optional eventId in payload when provided', () => {
      notifyCapacityReached(10, 99);

      expect(mockBroadcastEvent).toHaveBeenCalledWith(
        'platform:bookings',
        'capacity:reached',
        { amenityId: 10, eventId: 99 }
      );
    });

    it('omits eventId from payload when not provided', () => {
      notifyCapacityReached(7);

      const [, , payload] = mockBroadcastEvent.mock.calls[0];
      expect(payload.amenityId).toBe(7);
      expect(payload.eventId).toBeUndefined();
    });
  });
});
