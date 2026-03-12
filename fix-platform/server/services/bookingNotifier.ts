/**
 * Booking Notifier Service - SSE push notifications for booking lifecycle events.
 *
 * PURPOSE:
 * Broadcasts real-time notifications to all connected SSE clients when booking
 * status changes (approved/rejected) or when an amenity reaches capacity.
 *
 * CHANNEL:
 * All events are published to the `platform:bookings` SSE channel.
 *
 * USAGE:
 * ```typescript
 * import { notifyBookingApproved } from './bookingNotifier.js';
 *
 * // After approving a booking:
 * notifyBookingApproved(booking);
 * ```
 *
 * RELATED FILES:
 * - server/sse.ts       - broadcastEvent implementation
 * - server/routes/platform/bookings.ts - routes that call these notifiers
 */
import { broadcastEvent } from '../sse.js';

/**
 * Notify all SSE clients that a booking has been approved.
 *
 * @param booking - The approved booking object (any shape is acceptable)
 */
export function notifyBookingApproved(booking: unknown): void {
  broadcastEvent('platform:bookings', 'booking:approved', booking);
}

/**
 * Notify all SSE clients that a booking has been rejected.
 *
 * @param booking - The rejected booking object (any shape is acceptable)
 */
export function notifyBookingRejected(booking: unknown): void {
  broadcastEvent('platform:bookings', 'booking:rejected', booking);
}

/**
 * Notify all SSE clients that an amenity has reached capacity.
 *
 * @param amenityId - The amenity that hit capacity
 * @param eventId   - Optional event ID if capacity was reached within a specific event
 */
export function notifyCapacityReached(amenityId: number, eventId?: number): void {
  broadcastEvent('platform:bookings', 'capacity:reached', { amenityId, eventId });
}
