/**
 * Unit tests for announcements platform custom routes.
 *
 * Tests route structure and middleware behavior without a real database.
 * Prisma client is mocked so tests run in any environment.
 *
 * The announcements router is a custom router (NOT using createPlatformCrudRoutes factory)
 * with SSE notification support:
 * - GET /         - List active, non-expired announcements (pinned first, priority desc)
 * - GET /:id      - Get single announcement (404 if not found or soft-deleted)
 * - POST /        - Create new announcement (EDITOR+, SSE notification if publishedAt set)
 * - PUT /:id      - Update announcement (EDITOR+, SSE notification on publish transition)
 * - DELETE /:id   - Soft delete via markedForDeletion (EDITOR+)
 * - POST /:id/read - Mark as read by current session user
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { errorHandler } from '../../server/middleware/errorHandler.js';

// Mock the db module BEFORE importing anything that uses it
vi.mock('../../server/db.js', () => {
  const announcement = {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  };
  const announcementRead = {
    upsert: vi.fn(),
  };
  return {
    default: {
      announcement,
      announcementRead,
      $transaction: vi.fn(),
    },
  };
});

// Mock the SSE notifier
vi.mock('../../server/services/announcementNotifier.js', () => ({
  notifyNewAnnouncement: vi.fn(),
}));

// Mock express-session so requireAuth works in tests
vi.mock('express-session', () => ({
  default: () => (req: any, _res: any, next: any) => {
    req.session = (req as any).__mockSession || {};
    next();
  },
}));

// Import after mocks are in place
import prisma from '../../server/db.js';
import announcementsRouter from '../../server/routes/platform/announcements.js';
import { notifyNewAnnouncement } from '../../server/services/announcementNotifier.js';

const editorUser = { id: 2, username: 'editor', role: 'EDITOR' as const };

const uuid1 = '11111111-1111-1111-1111-111111111111';

const sampleAnnouncement = {
  id: uuid1,
  title: 'Test Announcement',
  body: 'This is a test',
  pinned: false,
  priority: 0,
  publishedAt: null,
  expiresAt: null,
  buildingId: null,
  markedForDeletion: false,
  createdBy: 'user-uuid',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

/** Build a minimal Express app with injected session user */
function buildApp(sessionUser?: { id: number; username: string; role: string }) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => {
    req.session = { user: sessionUser };
    // Mock platformUser for routes that need it
    if (sessionUser) {
      req.platformUser = { id: 'platform-user-uuid', role: 'MANAGER' };
    }
    next();
  });
  app.use('/api/platform/announcements', announcementsRouter);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('announcements custom routes', () => {
  describe('GET / — list announcements', () => {
    it('returns announcements sorted by pinned desc, priority desc', async () => {
      vi.mocked(prisma.announcement.findMany).mockResolvedValue([sampleAnnouncement] as any);

      const app = buildApp(editorUser);
      const res = await request(app).get('/api/platform/announcements');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
    });

    it('calls findMany with correct orderBy and filters', async () => {
      vi.mocked(prisma.announcement.findMany).mockResolvedValue([] as any);

      const app = buildApp(editorUser);
      await request(app).get('/api/platform/announcements');

      expect(vi.mocked(prisma.announcement.findMany)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            markedForDeletion: false,
          }),
          orderBy: [{ pinned: 'desc' }, { priority: 'desc' }, { createdAt: 'desc' }],
        })
      );
    });

    it('returns 401 when no user in session', async () => {
      const app = buildApp(undefined);
      const res = await request(app).get('/api/platform/announcements');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /:id — get single announcement', () => {
    it('returns the announcement when found', async () => {
      vi.mocked(prisma.announcement.findUnique).mockResolvedValue(sampleAnnouncement as any);

      const app = buildApp(editorUser);
      const res = await request(app).get(`/api/platform/announcements/${uuid1}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(uuid1);
      expect(res.body.title).toBe('Test Announcement');
    });

    it('returns 404 when announcement not found', async () => {
      vi.mocked(prisma.announcement.findUnique).mockResolvedValue(null);

      const app = buildApp(editorUser);
      const res = await request(app).get(`/api/platform/announcements/${uuid1}`);

      expect(res.status).toBe(404);
    });

    it('returns 404 when announcement is soft-deleted', async () => {
      vi.mocked(prisma.announcement.findUnique).mockResolvedValue({
        ...sampleAnnouncement,
        markedForDeletion: true,
      } as any);

      const app = buildApp(editorUser);
      const res = await request(app).get(`/api/platform/announcements/${uuid1}`);

      expect(res.status).toBe(404);
    });
  });

  describe('POST / — create announcement', () => {
    it('creates and returns the new announcement', async () => {
      const newAnnouncement = { ...sampleAnnouncement, title: 'New' };
      vi.mocked(prisma.announcement.create).mockResolvedValue(newAnnouncement as any);

      const app = buildApp(editorUser);
      const res = await request(app)
        .post('/api/platform/announcements')
        .send({ title: 'New', body: 'Content' });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('New');
    });

    it('notifies via SSE when publishedAt is set', async () => {
      const published = { ...sampleAnnouncement, publishedAt: new Date().toISOString() };
      vi.mocked(prisma.announcement.create).mockResolvedValue(published as any);

      const app = buildApp(editorUser);
      await request(app)
        .post('/api/platform/announcements')
        .send({ title: 'New', body: 'Content', publishedAt: new Date().toISOString() });

      expect(notifyNewAnnouncement).toHaveBeenCalledWith(published);
    });

    it('does not notify when publishedAt is null', async () => {
      vi.mocked(prisma.announcement.create).mockResolvedValue(sampleAnnouncement as any);

      const app = buildApp(editorUser);
      await request(app)
        .post('/api/platform/announcements')
        .send({ title: 'Draft', body: 'Content' });

      expect(notifyNewAnnouncement).not.toHaveBeenCalled();
    });

    it('requires title and body', async () => {
      const app = buildApp(editorUser);
      const res = await request(app)
        .post('/api/platform/announcements')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('PUT /:id — update announcement', () => {
    it('updates and returns the updated announcement', async () => {
      const updated = { ...sampleAnnouncement, title: 'Updated' };
      vi.mocked(prisma.announcement.findUnique).mockResolvedValue(sampleAnnouncement as any);
      vi.mocked(prisma.announcement.update).mockResolvedValue(updated as any);

      const app = buildApp(editorUser);
      const res = await request(app)
        .put(`/api/platform/announcements/${uuid1}`)
        .send({ title: 'Updated' });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Updated');
    });

    it('notifies via SSE when publishing transition occurs', async () => {
      const before = { ...sampleAnnouncement, publishedAt: null };
      const after = { ...sampleAnnouncement, publishedAt: new Date().toISOString() };
      vi.mocked(prisma.announcement.findUnique).mockResolvedValue(before as any);
      vi.mocked(prisma.announcement.update).mockResolvedValue(after as any);

      const app = buildApp(editorUser);
      await request(app)
        .put(`/api/platform/announcements/${uuid1}`)
        .send({ publishedAt: new Date().toISOString() });

      expect(notifyNewAnnouncement).toHaveBeenCalledWith(after);
    });

    it('returns 404 when announcement is soft-deleted', async () => {
      vi.mocked(prisma.announcement.findUnique).mockResolvedValue({
        ...sampleAnnouncement,
        markedForDeletion: true,
      } as any);

      const app = buildApp(editorUser);
      const res = await request(app)
        .put(`/api/platform/announcements/${uuid1}`)
        .send({ title: 'Updated' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /:id — soft-delete announcement', () => {
    it('marks announcement for deletion and returns ok', async () => {
      vi.mocked(prisma.announcement.findUnique).mockResolvedValue(sampleAnnouncement as any);
      vi.mocked(prisma.announcement.update).mockResolvedValue({
        ...sampleAnnouncement,
        markedForDeletion: true,
      } as any);

      const app = buildApp(editorUser);
      const res = await request(app).delete(`/api/platform/announcements/${uuid1}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(vi.mocked(prisma.announcement.update)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: uuid1 },
          data: { markedForDeletion: true },
        })
      );
    });
  });

  describe('POST /:id/read — mark as read', () => {
    it('marks the announcement as read for the given user', async () => {
      vi.mocked(prisma.announcement.findUnique).mockResolvedValue(sampleAnnouncement as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked((prisma as any).announcementRead.upsert).mockResolvedValue({
        userId: 'platform-user-uuid',
        announcementId: uuid1,
      });

      const app = buildApp(editorUser);
      const res = await request(app).post(`/api/platform/announcements/${uuid1}/read`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('returns 401 when no user in session', async () => {
      const app = buildApp(undefined);
      const res = await request(app).post(`/api/platform/announcements/${uuid1}/read`);
      expect(res.status).toBe(401);
    });
  });
});
