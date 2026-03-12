/**
 * Announcement Notifier Service
 *
 * Broadcasts SSE events when a new announcement is published.
 * Clients subscribed to the 'platform:announcements' channel will
 * receive an 'announcement:new' event with a compact payload.
 *
 * USAGE:
 * ```typescript
 * import { notifyNewAnnouncement } from '../services/announcementNotifier.js';
 *
 * // After creating/updating an announcement with publishedAt set:
 * notifyNewAnnouncement(announcement);
 * ```
 *
 * RELATED FILES:
 * - server/sse.ts                                  - SSE broadcast primitives
 * - server/routes/platform/announcements.ts        - Calls this notifier
 * - server/utils/createPlatformCrudRoutes.ts        - Platform CRUD factory
 */
import { broadcastEvent } from '../sse.js';

/**
 * Minimal shape of an announcement required to emit a notification.
 * The full Prisma model contains additional fields that are not relevant
 * for the broadcast payload.
 */
export interface AnnouncementForNotification {
  id: string;
  title: string;
  priority: number;
  pinned: boolean;
  publishedAt: Date | null;
}

/**
 * Broadcast an 'announcement:new' SSE event to the 'platform:announcements' channel.
 *
 * Only the fields relevant to clients are included in the payload:
 * id, title, priority, pinned, publishedAt.
 *
 * @param announcement - The published announcement (must have publishedAt set).
 */
export function notifyNewAnnouncement(announcement: AnnouncementForNotification): void {
  broadcastEvent('platform:announcements', 'announcement:new', {
    id: announcement.id,
    title: announcement.title,
    priority: announcement.priority,
    pinned: announcement.pinned,
    publishedAt: announcement.publishedAt,
  });
}
