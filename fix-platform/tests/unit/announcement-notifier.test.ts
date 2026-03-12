/**
 * Unit tests for the AnnouncementNotifier service.
 *
 * Tests that notifyNewAnnouncement() broadcasts to the 'platform:announcements'
 * SSE channel with the correct event type and payload.
 *
 * RED/BLUE TDD: These tests are written first (red), then the implementation
 * is added to make them pass (blue).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the SSE module before importing the notifier
vi.mock('../../server/sse.js', () => ({
  broadcast: vi.fn(),
  broadcastEvent: vi.fn(),
  sseHandler: vi.fn(),
}));

import { broadcastEvent } from '../../server/sse.js';
import { notifyNewAnnouncement } from '../../server/services/announcementNotifier.js';

const mockBroadcastEvent = broadcastEvent as ReturnType<typeof vi.fn>;

describe('notifyNewAnnouncement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls broadcastEvent on the platform:announcements channel', () => {
    const announcement = {
      id: 'ann-1',
      title: 'Water Shutdown',
      priority: 2,
      pinned: true,
      publishedAt: new Date('2026-02-26T10:00:00Z'),
    };

    notifyNewAnnouncement(announcement);

    expect(mockBroadcastEvent).toHaveBeenCalledTimes(1);
    expect(mockBroadcastEvent).toHaveBeenCalledWith(
      'platform:announcements',
      'announcement:new',
      {
        id: 'ann-1',
        title: 'Water Shutdown',
        priority: 2,
        pinned: true,
        publishedAt: new Date('2026-02-26T10:00:00Z'),
      }
    );
  });

  it('includes all required payload fields', () => {
    const announcement = {
      id: 'ann-2',
      title: 'Lobby Renovation',
      priority: 1,
      pinned: false,
      publishedAt: new Date('2026-02-25T08:00:00Z'),
    };

    notifyNewAnnouncement(announcement);

    const [channel, eventType, payload] = mockBroadcastEvent.mock.calls[0];

    expect(channel).toBe('platform:announcements');
    expect(eventType).toBe('announcement:new');
    expect(payload).toMatchObject({
      id: 'ann-2',
      title: 'Lobby Renovation',
      priority: 1,
      pinned: false,
      publishedAt: new Date('2026-02-25T08:00:00Z'),
    });
  });

  it('does not include extra fields in the payload', () => {
    const announcement = {
      id: 'ann-3',
      title: 'Pool Closed',
      priority: 0,
      pinned: false,
      publishedAt: new Date('2026-02-20T12:00:00Z'),
      // Extra fields that should NOT be in the payload
      body: 'The pool will be closed for maintenance.',
      createdBy: 'user-1',
      createdAt: new Date('2026-02-20T11:00:00Z'),
      updatedAt: new Date('2026-02-20T11:00:00Z'),
      markedForDeletion: false,
    };

    notifyNewAnnouncement(announcement);

    const [, , payload] = mockBroadcastEvent.mock.calls[0];

    expect(Object.keys(payload)).toEqual(['id', 'title', 'priority', 'pinned', 'publishedAt']);
    expect(payload).not.toHaveProperty('body');
    expect(payload).not.toHaveProperty('createdBy');
    expect(payload).not.toHaveProperty('createdAt');
    expect(payload).not.toHaveProperty('updatedAt');
    expect(payload).not.toHaveProperty('markedForDeletion');
  });

  it('broadcasts to platform:announcements channel specifically (not global)', () => {
    const announcement = {
      id: 'ann-4',
      title: 'Fire Drill',
      priority: 3,
      pinned: true,
      publishedAt: new Date('2026-02-26T09:00:00Z'),
    };

    notifyNewAnnouncement(announcement);

    const [channel] = mockBroadcastEvent.mock.calls[0];
    expect(channel).toBe('platform:announcements');
  });

  it('uses announcement:new as the event type', () => {
    const announcement = {
      id: 'ann-5',
      title: 'Package Room',
      priority: 0,
      pinned: false,
      publishedAt: new Date('2026-02-26T07:00:00Z'),
    };

    notifyNewAnnouncement(announcement);

    const [, eventType] = mockBroadcastEvent.mock.calls[0];
    expect(eventType).toBe('announcement:new');
  });
});
