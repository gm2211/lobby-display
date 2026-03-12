/**
 * Shift Notifier Service
 *
 * Broadcasts SSE events when shift status changes occur.
 * Clients subscribed to the 'platform:shifts' channel will
 * receive 'shift:update' events with a compact payload.
 *
 * RELATED FILES:
 * - server/sse.ts                           - SSE broadcast primitives
 * - server/routes/platform/shifts.ts        - Calls this notifier
 */
import { broadcastEvent } from '../sse.js';

export interface ShiftForNotification {
  id: string;
  assigneeId: string;
  shiftType: string;
  status: string;
  startTime: Date;
  endTime: Date;
}

/**
 * Broadcast a 'shift:update' SSE event to the 'platform:shifts' channel.
 */
export function notifyShiftUpdate(shift: ShiftForNotification): void {
  broadcastEvent('platform:shifts', 'shift:update', {
    id: shift.id,
    assigneeId: shift.assigneeId,
    shiftType: shift.shiftType,
    status: shift.status,
    startTime: shift.startTime,
    endTime: shift.endTime,
  });
}
