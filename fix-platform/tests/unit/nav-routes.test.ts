/**
 * Unit tests for Platform Navigation endpoint.
 *
 * Tests the GET /api/platform/nav route which returns dynamic sidebar
 * navigation items with badge counts computed from live DB queries.
 *
 * Routes tested:
 * - GET / — returns items and managerItems with badge counts
 *
 * Auth model:
 * - Requires authentication (session user)
 * - managerItems only returned for MANAGER+ platform roles
 * - Badge counts are per-user (filtered by platformUser.id)
 *
 * Badge queries:
 * - Announcements: unread count (no AnnouncementRead for current user)
 * - Maintenance: open requests count for current user (by reportedBy)
 * - Parcels: uncollected parcels for current user (RECEIVED or NOTIFIED status)
 * - Payments: pending payments for current user
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { errorHandler } from '../../server/middleware/errorHandler.js';

// Mock Prisma before importing routes
vi.mock('../../server/db.js', () => ({
  default: {
    announcement: {
      count: vi.fn(),
    },
    maintenanceRequest: {
      count: vi.fn(),
    },
    parcel: {
      count: vi.fn(),
    },
    payment: {
      count: vi.fn(),
    },
    platformUser: {
      findUnique: vi.fn(),
    },
  },
}));

import prisma from '../../server/db.js';
import navRouter from '../../server/routes/platform/nav.js';

// Type helpers for mocked Prisma functions
const mockPrisma = prisma as {
  announcement: { count: ReturnType<typeof vi.fn> };
  maintenanceRequest: { count: ReturnType<typeof vi.fn> };
  parcel: { count: ReturnType<typeof vi.fn> };
  payment: { count: ReturnType<typeof vi.fn> };
  platformUser: { findUnique: ReturnType<typeof vi.fn> };
};

const SESSION_USER_ID = 42;
const PLATFORM_USER_ID = 'platform-uuid-1';

/**
 * Build a minimal Express app with an injected session user.
 * platformRole controls what platformUser record is returned from DB.
 */
function buildApp(
  role: 'ADMIN' | 'EDITOR' | 'VIEWER' | null = 'EDITOR',
  platformRole: 'RESIDENT' | 'BOARD_MEMBER' | 'MANAGER' | 'SECURITY' | 'CONCIERGE' = 'RESIDENT'
) {
  const app = express();
  app.use(express.json());

  // Inject mock session
  app.use((req: any, _res: any, next: any) => {
    if (role !== null) {
      req.session = { user: { id: SESSION_USER_ID, username: 'testuser', role } };
    } else {
      req.session = {};
    }
    next();
  });

  // Mock platformUser attachment (simulate platformProtectStrict)
  app.use((req: any, _res: any, next: any) => {
    if (role !== null) {
      req.platformUser = {
        id: PLATFORM_USER_ID,
        userId: SESSION_USER_ID,
        role: platformRole,
      };
    }
    next();
  });

  app.use('/api/platform/nav', navRouter);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();

  // Default badge counts
  mockPrisma.announcement.count.mockResolvedValue(3);
  mockPrisma.maintenanceRequest.count.mockResolvedValue(1);
  mockPrisma.parcel.count.mockResolvedValue(2);
  mockPrisma.payment.count.mockResolvedValue(1);
});

// ─── GET / ───────────────────────────────────────────────────────────────────

describe('GET /api/platform/nav', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    // For unauthenticated test, skip platformUser middleware
    const unauthApp = express();
    unauthApp.use(express.json());
    unauthApp.use((req: any, _res: any, next: any) => {
      req.session = {};
      next();
    });
    unauthApp.use('/api/platform/nav', navRouter);
    unauthApp.use(errorHandler);

    const res = await request(unauthApp).get('/api/platform/nav');
    expect(res.status).toBe(401);
  });

  it('returns items array with expected nav items', async () => {
    const app = buildApp('EDITOR', 'RESIDENT');
    const res = await request(app).get('/api/platform/nav');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('items');
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeGreaterThan(0);
  });

  it('includes all expected nav item labels', async () => {
    const app = buildApp('EDITOR', 'RESIDENT');
    const res = await request(app).get('/api/platform/nav');

    const labels = res.body.items.map((i: { label: string }) => i.label);
    expect(labels).toContain('Announcements');
    expect(labels).toContain('Maintenance');
    expect(labels).toContain('Amenities');
    expect(labels).toContain('Parcels');
    expect(labels).toContain('Events');
    expect(labels).toContain('Payments');
    expect(labels).toContain('Visitors');
    expect(labels).toContain('Documents');
    expect(labels).toContain('Directory');
    expect(labels).toContain('Forum');
    expect(labels).toContain('Marketplace');
  });

  it('includes correct icons for each nav item', async () => {
    const app = buildApp('EDITOR', 'RESIDENT');
    const res = await request(app).get('/api/platform/nav');

    const itemMap = Object.fromEntries(
      res.body.items.map((i: { label: string; icon: string }) => [i.label, i.icon])
    );

    expect(itemMap['Announcements']).toBe('megaphone');
    expect(itemMap['Maintenance']).toBe('wrench');
    expect(itemMap['Amenities']).toBe('building');
    expect(itemMap['Parcels']).toBe('package');
    expect(itemMap['Events']).toBe('calendar');
    expect(itemMap['Payments']).toBe('credit-card');
    expect(itemMap['Visitors']).toBe('users');
    expect(itemMap['Documents']).toBe('file-text');
    expect(itemMap['Directory']).toBe('book');
    expect(itemMap['Forum']).toBe('message-square');
    expect(itemMap['Marketplace']).toBe('shopping-bag');
  });

  it('includes correct paths for each nav item', async () => {
    const app = buildApp('EDITOR', 'RESIDENT');
    const res = await request(app).get('/api/platform/nav');

    const itemMap = Object.fromEntries(
      res.body.items.map((i: { label: string; path: string }) => [i.label, i.path])
    );

    expect(itemMap['Announcements']).toBe('/platform/announcements');
    expect(itemMap['Maintenance']).toBe('/platform/maintenance');
    expect(itemMap['Amenities']).toBe('/platform/amenities');
    expect(itemMap['Parcels']).toBe('/platform/parcels');
    expect(itemMap['Events']).toBe('/platform/events');
    expect(itemMap['Payments']).toBe('/platform/payments');
    expect(itemMap['Visitors']).toBe('/platform/visitors');
    expect(itemMap['Documents']).toBe('/platform/documents');
    expect(itemMap['Directory']).toBe('/platform/directory');
    expect(itemMap['Forum']).toBe('/platform/forum');
    expect(itemMap['Marketplace']).toBe('/platform/marketplace');
  });

  it('returns badge counts from DB for announcement (unread count)', async () => {
    mockPrisma.announcement.count.mockResolvedValue(5);

    const app = buildApp('EDITOR', 'RESIDENT');
    const res = await request(app).get('/api/platform/nav');

    const announcementsItem = res.body.items.find(
      (i: { label: string }) => i.label === 'Announcements'
    );
    expect(announcementsItem).toBeDefined();
    expect(announcementsItem.badge).toBe(5);
  });

  it('returns badge counts from DB for maintenance (open requests for current user)', async () => {
    mockPrisma.maintenanceRequest.count.mockResolvedValue(3);

    const app = buildApp('EDITOR', 'RESIDENT');
    const res = await request(app).get('/api/platform/nav');

    const maintenanceItem = res.body.items.find(
      (i: { label: string }) => i.label === 'Maintenance'
    );
    expect(maintenanceItem).toBeDefined();
    expect(maintenanceItem.badge).toBe(3);
  });

  it('returns badge counts from DB for parcels (uncollected for current user)', async () => {
    mockPrisma.parcel.count.mockResolvedValue(4);

    const app = buildApp('EDITOR', 'RESIDENT');
    const res = await request(app).get('/api/platform/nav');

    const parcelsItem = res.body.items.find(
      (i: { label: string }) => i.label === 'Parcels'
    );
    expect(parcelsItem).toBeDefined();
    expect(parcelsItem.badge).toBe(4);
  });

  it('returns badge counts from DB for payments (pending for current user)', async () => {
    mockPrisma.payment.count.mockResolvedValue(2);

    const app = buildApp('EDITOR', 'RESIDENT');
    const res = await request(app).get('/api/platform/nav');

    const paymentsItem = res.body.items.find(
      (i: { label: string }) => i.label === 'Payments'
    );
    expect(paymentsItem).toBeDefined();
    expect(paymentsItem.badge).toBe(2);
  });

  it('returns null badge for items without badge counts (Events)', async () => {
    const app = buildApp('EDITOR', 'RESIDENT');
    const res = await request(app).get('/api/platform/nav');

    const eventsItem = res.body.items.find(
      (i: { label: string }) => i.label === 'Events'
    );
    expect(eventsItem).toBeDefined();
    expect(eventsItem.badge).toBeNull();
  });

  it('returns null badge for items without badge counts (Amenities)', async () => {
    const app = buildApp('EDITOR', 'RESIDENT');
    const res = await request(app).get('/api/platform/nav');

    const amenitiesItem = res.body.items.find(
      (i: { label: string }) => i.label === 'Amenities'
    );
    expect(amenitiesItem).toBeDefined();
    expect(amenitiesItem.badge).toBeNull();
  });

  it('queries announcements unread count filtered by current platformUser id', async () => {
    const app = buildApp('EDITOR', 'RESIDENT');
    await request(app).get('/api/platform/nav');

    // Announcements unread: count announcements with no read receipt for this user
    expect(mockPrisma.announcement.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          reads: expect.objectContaining({
            none: expect.objectContaining({
              userId: PLATFORM_USER_ID,
            }),
          }),
        }),
      })
    );
  });

  it('queries maintenance open requests filtered by current platformUser id', async () => {
    const app = buildApp('EDITOR', 'RESIDENT');
    await request(app).get('/api/platform/nav');

    expect(mockPrisma.maintenanceRequest.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          reportedBy: PLATFORM_USER_ID,
          status: expect.objectContaining({
            in: expect.arrayContaining(['OPEN', 'ASSIGNED', 'IN_PROGRESS']),
          }),
        }),
      })
    );
  });

  it('queries parcels filtered to uncollected for current platformUser', async () => {
    const app = buildApp('EDITOR', 'RESIDENT');
    await request(app).get('/api/platform/nav');

    expect(mockPrisma.parcel.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          recipientId: PLATFORM_USER_ID,
          status: expect.objectContaining({
            in: expect.arrayContaining(['RECEIVED', 'NOTIFIED']),
          }),
          markedForDeletion: false,
        }),
      })
    );
  });

  it('queries payments filtered to PENDING for current platformUser', async () => {
    const app = buildApp('EDITOR', 'RESIDENT');
    await request(app).get('/api/platform/nav');

    expect(mockPrisma.payment.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: PLATFORM_USER_ID,
          status: 'PENDING',
        }),
      })
    );
  });

  it('returns 0 badge (not null) when count is 0', async () => {
    mockPrisma.announcement.count.mockResolvedValue(0);
    mockPrisma.maintenanceRequest.count.mockResolvedValue(0);
    mockPrisma.parcel.count.mockResolvedValue(0);
    mockPrisma.payment.count.mockResolvedValue(0);

    const app = buildApp('EDITOR', 'RESIDENT');
    const res = await request(app).get('/api/platform/nav');

    const announcementsItem = res.body.items.find(
      (i: { label: string }) => i.label === 'Announcements'
    );
    // When count is 0, badge should be 0 (not null)
    expect(announcementsItem.badge).toBe(0);
  });
});

// ─── managerItems ─────────────────────────────────────────────────────────────

describe('GET /api/platform/nav — managerItems', () => {
  it('does NOT return managerItems for RESIDENT role', async () => {
    const app = buildApp('EDITOR', 'RESIDENT');
    const res = await request(app).get('/api/platform/nav');

    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('managerItems');
  });

  it('returns managerItems for MANAGER role', async () => {
    const app = buildApp('ADMIN', 'MANAGER');
    const res = await request(app).get('/api/platform/nav');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('managerItems');
    expect(Array.isArray(res.body.managerItems)).toBe(true);
    expect(res.body.managerItems.length).toBeGreaterThan(0);
  });

  it('returns managerItems for BOARD_MEMBER role', async () => {
    const app = buildApp('ADMIN', 'BOARD_MEMBER');
    const res = await request(app).get('/api/platform/nav');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('managerItems');
  });

  it('does NOT return managerItems for SECURITY role', async () => {
    const app = buildApp('EDITOR', 'SECURITY');
    const res = await request(app).get('/api/platform/nav');

    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('managerItems');
  });

  it('does NOT return managerItems for CONCIERGE role', async () => {
    const app = buildApp('EDITOR', 'CONCIERGE');
    const res = await request(app).get('/api/platform/nav');

    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('managerItems');
  });

  it('managerItems contains expected items with labels', async () => {
    const app = buildApp('ADMIN', 'MANAGER');
    const res = await request(app).get('/api/platform/nav');

    const labels = res.body.managerItems.map((i: { label: string }) => i.label);
    expect(labels).toContain('Violations');
    expect(labels).toContain('Training');
    expect(labels).toContain('Surveys');
    expect(labels).toContain('Consent Forms');
  });

  it('managerItems contains correct icons', async () => {
    const app = buildApp('ADMIN', 'MANAGER');
    const res = await request(app).get('/api/platform/nav');

    const itemMap = Object.fromEntries(
      res.body.managerItems.map((i: { label: string; icon: string }) => [i.label, i.icon])
    );

    expect(itemMap['Violations']).toBe('alert-triangle');
    expect(itemMap['Training']).toBe('book-open');
    expect(itemMap['Surveys']).toBe('clipboard');
    expect(itemMap['Consent Forms']).toBe('file-check');
  });

  it('managerItems contains correct paths', async () => {
    const app = buildApp('ADMIN', 'MANAGER');
    const res = await request(app).get('/api/platform/nav');

    const itemMap = Object.fromEntries(
      res.body.managerItems.map((i: { label: string; path: string }) => [i.label, i.path])
    );

    expect(itemMap['Violations']).toBe('/platform/violations');
    expect(itemMap['Training']).toBe('/platform/training');
    expect(itemMap['Surveys']).toBe('/platform/surveys');
    expect(itemMap['Consent Forms']).toBe('/platform/consent');
  });

  it('Violations managerItem has badge 0 (not null) by default', async () => {
    const app = buildApp('ADMIN', 'MANAGER');
    const res = await request(app).get('/api/platform/nav');

    const violationsItem = res.body.managerItems.find(
      (i: { label: string }) => i.label === 'Violations'
    );
    expect(violationsItem).toBeDefined();
    // Per spec, badge is 0 (a defined count, not null)
    expect(violationsItem.badge).toBe(0);
  });

  it('Training managerItem has null badge', async () => {
    const app = buildApp('ADMIN', 'MANAGER');
    const res = await request(app).get('/api/platform/nav');

    const trainingItem = res.body.managerItems.find(
      (i: { label: string }) => i.label === 'Training'
    );
    expect(trainingItem).toBeDefined();
    expect(trainingItem.badge).toBeNull();
  });
});

// ─── Response shape ───────────────────────────────────────────────────────────

describe('GET /api/platform/nav — response shape', () => {
  it('each item has label, icon, path, and badge fields', async () => {
    const app = buildApp('EDITOR', 'RESIDENT');
    const res = await request(app).get('/api/platform/nav');

    for (const item of res.body.items) {
      expect(item).toHaveProperty('label');
      expect(item).toHaveProperty('icon');
      expect(item).toHaveProperty('path');
      expect(item).toHaveProperty('badge');
      expect(typeof item.label).toBe('string');
      expect(typeof item.icon).toBe('string');
      expect(typeof item.path).toBe('string');
      expect(item.badge === null || typeof item.badge === 'number').toBe(true);
    }
  });

  it('managerItems each have label, icon, path, and badge fields', async () => {
    const app = buildApp('ADMIN', 'MANAGER');
    const res = await request(app).get('/api/platform/nav');

    for (const item of res.body.managerItems) {
      expect(item).toHaveProperty('label');
      expect(item).toHaveProperty('icon');
      expect(item).toHaveProperty('path');
      expect(item).toHaveProperty('badge');
      expect(typeof item.label).toBe('string');
      expect(typeof item.icon).toBe('string');
      expect(typeof item.path).toBe('string');
      expect(item.badge === null || typeof item.badge === 'number').toBe(true);
    }
  });
});
