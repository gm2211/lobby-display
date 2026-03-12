/**
 * Unit tests for Platform Event CRUD API routes.
 *
 * Uses vi.mock to mock Prisma so no database is needed.
 * Tests cover: list upcoming, get by id with RSVP count, create, update,
 * soft-delete (set active=false), RSVP submission (upsert), and list RSVPs.
 *
 * Auth model:
 *  - GETs require auth (any role)
 *  - Mutations (POST/PUT/DELETE) require EDITOR+ (mapped from "MANAGER+")
 *  - POST /:id/rsvp requires any authenticated user
 *  - GET /:id/rsvps requires EDITOR+ (MANAGER+)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { errorHandler } from '../../server/middleware/errorHandler.js';

// Mock prisma before importing the router
vi.mock('../../server/db.js', () => ({
  default: {
    platformEvent: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    eventRSVP: {
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
    platformUser: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock session middleware
vi.mock('express-session', () => {
  return {
    default: () => (req: any, _res: any, next: any) => {
      req.session = (req as any).__mockSession || {};
      next();
    },
  };
});

import prisma from '../../server/db.js';
import eventsRouter from '../../server/routes/platform/events.js';

const mockPrisma = vi.mocked(prisma);

// Helper to build a mini express app with a given session user
function buildApp(sessionUser?: { id: string; username: string; role: string }) {
  const app = express();
  app.use(express.json());

  // Inject mock session
  app.use((req: any, _res, next) => {
    req.session = { user: sessionUser };
    next();
  });

  // Set up platformUser mock so platformProtectStrict middleware passes
  if (sessionUser) {
    mockPrisma.platformUser.findUnique.mockResolvedValue({
      id: `platform-${sessionUser.id}`,
      userId: sessionUser.id,
      role: 'RESIDENT',
    } as any);
  }

  app.use('/api/platform/events', eventsRouter);
  app.use(errorHandler);
  return app;
}

const adminUser = { id: 'admin-uuid-1', username: 'admin', role: 'ADMIN' as const };
const editorUser = { id: 'editor-uuid-2', username: 'editor', role: 'EDITOR' as const };
const viewerUser = { id: 'viewer-uuid-3', username: 'viewer', role: 'VIEWER' as const };

const sampleEvent = {
  id: 'event-uuid-1',
  title: 'Annual Building Meeting',
  description: 'Yearly residents meeting',
  location: 'Lobby',
  startTime: new Date('2025-06-01T18:00:00Z'),
  endTime: new Date('2025-06-01T20:00:00Z'),
  isRecurring: false,
  recurrenceRule: null,
  capacity: 50,
  imageId: null,
  createdBy: 'admin-uuid-1',
  active: true,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  rsvps: [],
  _count: { rsvps: 0 },
};

const sampleRSVP = {
  id: 'rsvp-uuid-1',
  eventId: 'event-uuid-1',
  userId: 'viewer-uuid-3',
  status: 'GOING',
  createdAt: new Date('2025-01-01'),
  user: { id: 'viewer-uuid-3', name: 'Viewer User', email: 'viewer@test.com' },
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// GET /api/platform/events
// ---------------------------------------------------------------------------
describe('GET /api/platform/events', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(undefined);
    const res = await request(app).get('/api/platform/events');
    expect(res.status).toBe(401);
  });

  it('returns list of upcoming active events ordered by startTime for VIEWER', async () => {
    const mockFindMany = vi.mocked(prisma.platformEvent.findMany);
    mockFindMany.mockResolvedValue([sampleEvent] as any);

    const app = buildApp(viewerUser);
    const res = await request(app).get('/api/platform/events');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('Annual Building Meeting');
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ active: true }),
        orderBy: expect.objectContaining({ startTime: 'asc' }),
      })
    );
  });

  it('returns list for EDITOR', async () => {
    const mockFindMany = vi.mocked(prisma.platformEvent.findMany);
    mockFindMany.mockResolvedValue([sampleEvent] as any);

    const app = buildApp(editorUser);
    const res = await request(app).get('/api/platform/events');
    expect(res.status).toBe(200);
  });

  it('returns list for ADMIN', async () => {
    const mockFindMany = vi.mocked(prisma.platformEvent.findMany);
    mockFindMany.mockResolvedValue([sampleEvent] as any);

    const app = buildApp(adminUser);
    const res = await request(app).get('/api/platform/events');
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /api/platform/events/:id
// ---------------------------------------------------------------------------
describe('GET /api/platform/events/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(undefined);
    const res = await request(app).get('/api/platform/events/event-uuid-1');
    expect(res.status).toBe(401);
  });

  it('returns event detail with RSVP count', async () => {
    const mockFindUnique = vi.mocked(prisma.platformEvent.findUnique);
    const eventWithCount = { ...sampleEvent, _count: { rsvps: 3 } };
    mockFindUnique.mockResolvedValue(eventWithCount as any);

    const app = buildApp(viewerUser);
    const res = await request(app).get('/api/platform/events/event-uuid-1');

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Annual Building Meeting');
    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'event-uuid-1' },
        include: expect.objectContaining({ _count: expect.anything() }),
      })
    );
  });

  it('returns 404 when event does not exist', async () => {
    const mockFindUnique = vi.mocked(prisma.platformEvent.findUnique);
    mockFindUnique.mockResolvedValue(null);

    const app = buildApp(viewerUser);
    const res = await request(app).get('/api/platform/events/nonexistent-uuid');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/platform/events
// ---------------------------------------------------------------------------
describe('POST /api/platform/events', () => {
  const newEventPayload = {
    title: 'Summer BBQ',
    description: 'Annual summer barbecue',
    location: 'Rooftop',
    startTime: '2025-07-04T17:00:00Z',
    endTime: '2025-07-04T21:00:00Z',
    isRecurring: false,
    capacity: 100,
  };

  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(undefined);
    const res = await request(app)
      .post('/api/platform/events')
      .send(newEventPayload);
    expect(res.status).toBe(401);
  });

  it('returns 403 when VIEWER tries to create', async () => {
    const app = buildApp(viewerUser);
    const res = await request(app)
      .post('/api/platform/events')
      .send(newEventPayload);
    expect(res.status).toBe(403);
  });

  it('returns 400 when required fields are missing', async () => {
    const app = buildApp(editorUser);
    const res = await request(app)
      .post('/api/platform/events')
      .send({ title: 'Incomplete Event' });
    expect(res.status).toBe(400);
  });

  it('creates event when EDITOR', async () => {
    const mockCreate = vi.mocked(prisma.platformEvent.create);
    const created = { ...sampleEvent, id: 'new-event-uuid', title: 'Summer BBQ' };
    mockCreate.mockResolvedValue(created as any);

    const app = buildApp(editorUser);
    const res = await request(app)
      .post('/api/platform/events')
      .send(newEventPayload);

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Summer BBQ');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: 'Summer BBQ' }),
      })
    );
  });

  it('creates event when ADMIN', async () => {
    const mockCreate = vi.mocked(prisma.platformEvent.create);
    const created = { ...sampleEvent, id: 'admin-event-uuid', title: 'Admin Event' };
    mockCreate.mockResolvedValue(created as any);

    const app = buildApp(adminUser);
    const res = await request(app)
      .post('/api/platform/events')
      .send({ ...newEventPayload, title: 'Admin Event' });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Admin Event');
  });

  it('sets createdBy to the authenticated user id', async () => {
    const mockCreate = vi.mocked(prisma.platformEvent.create);
    mockCreate.mockResolvedValue(sampleEvent as any);

    const app = buildApp(editorUser);
    await request(app)
      .post('/api/platform/events')
      .send(newEventPayload);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ createdBy: `platform-${editorUser.id}` }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// PUT /api/platform/events/:id
// ---------------------------------------------------------------------------
describe('PUT /api/platform/events/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(undefined);
    const res = await request(app)
      .put('/api/platform/events/event-uuid-1')
      .send({ title: 'Updated Title' });
    expect(res.status).toBe(401);
  });

  it('returns 403 when VIEWER tries to update', async () => {
    const app = buildApp(viewerUser);
    const res = await request(app)
      .put('/api/platform/events/event-uuid-1')
      .send({ title: 'Updated Title' });
    expect(res.status).toBe(403);
  });

  it('updates event when EDITOR', async () => {
    const mockUpdate = vi.mocked(prisma.platformEvent.update);
    const updated = { ...sampleEvent, title: 'Updated Title' };
    mockUpdate.mockResolvedValue(updated as any);

    const app = buildApp(editorUser);
    const res = await request(app)
      .put('/api/platform/events/event-uuid-1')
      .send({ title: 'Updated Title' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated Title');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'event-uuid-1' },
        data: expect.objectContaining({ title: 'Updated Title' }),
      })
    );
  });

  it('updates event when ADMIN', async () => {
    const mockUpdate = vi.mocked(prisma.platformEvent.update);
    mockUpdate.mockResolvedValue({ ...sampleEvent, capacity: 200 } as any);

    const app = buildApp(adminUser);
    const res = await request(app)
      .put('/api/platform/events/event-uuid-1')
      .send({ capacity: 200 });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/platform/events/:id
// ---------------------------------------------------------------------------
describe('DELETE /api/platform/events/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(undefined);
    const res = await request(app).delete('/api/platform/events/event-uuid-1');
    expect(res.status).toBe(401);
  });

  it('returns 403 when VIEWER tries to delete', async () => {
    const app = buildApp(viewerUser);
    const res = await request(app).delete('/api/platform/events/event-uuid-1');
    expect(res.status).toBe(403);
  });

  it('soft deletes event by setting active=false when EDITOR', async () => {
    const mockUpdate = vi.mocked(prisma.platformEvent.update);
    mockUpdate.mockResolvedValue({ ...sampleEvent, active: false } as any);

    const app = buildApp(editorUser);
    const res = await request(app).delete('/api/platform/events/event-uuid-1');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'event-uuid-1' },
        data: { active: false },
      })
    );
  });

  it('soft delete does NOT use markedForDeletion', async () => {
    const mockUpdate = vi.mocked(prisma.platformEvent.update);
    mockUpdate.mockResolvedValue({ ...sampleEvent, active: false } as any);

    const app = buildApp(adminUser);
    await request(app).delete('/api/platform/events/event-uuid-1');

    const callArg = mockUpdate.mock.calls[0][0] as any;
    expect(callArg.data.markedForDeletion).toBeUndefined();
  });

  it('soft delete does NOT use deletedAt', async () => {
    const mockUpdate = vi.mocked(prisma.platformEvent.update);
    mockUpdate.mockResolvedValue({ ...sampleEvent, active: false } as any);

    const app = buildApp(adminUser);
    await request(app).delete('/api/platform/events/event-uuid-1');

    const callArg = mockUpdate.mock.calls[0][0] as any;
    expect(callArg.data.deletedAt).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// POST /api/platform/events/:id/rsvp
// ---------------------------------------------------------------------------
describe('POST /api/platform/events/:id/rsvp', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(undefined);
    const res = await request(app)
      .post('/api/platform/events/event-uuid-1/rsvp')
      .send({ status: 'GOING' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when status is missing', async () => {
    const mockFindUnique = vi.mocked(prisma.platformEvent.findUnique);
    mockFindUnique.mockResolvedValue(sampleEvent as any);

    const app = buildApp(viewerUser);
    const res = await request(app)
      .post('/api/platform/events/event-uuid-1/rsvp')
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when status is invalid', async () => {
    const mockFindUnique = vi.mocked(prisma.platformEvent.findUnique);
    mockFindUnique.mockResolvedValue(sampleEvent as any);

    const app = buildApp(viewerUser);
    const res = await request(app)
      .post('/api/platform/events/event-uuid-1/rsvp')
      .send({ status: 'INVALID_STATUS' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when event does not exist', async () => {
    const mockFindUnique = vi.mocked(prisma.platformEvent.findUnique);
    mockFindUnique.mockResolvedValue(null);

    const app = buildApp(viewerUser);
    const res = await request(app)
      .post('/api/platform/events/nonexistent-uuid/rsvp')
      .send({ status: 'GOING' });
    expect(res.status).toBe(404);
  });

  it('creates RSVP for authenticated VIEWER', async () => {
    const mockFindUnique = vi.mocked(prisma.platformEvent.findUnique);
    mockFindUnique.mockResolvedValue(sampleEvent as any);

    const mockUpsert = vi.mocked(prisma.eventRSVP.upsert);
    mockUpsert.mockResolvedValue(sampleRSVP as any);

    const app = buildApp(viewerUser);
    const res = await request(app)
      .post('/api/platform/events/event-uuid-1/rsvp')
      .send({ status: 'GOING' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('GOING');
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId_userId: { eventId: 'event-uuid-1', userId: `platform-${viewerUser.id}` } },
        create: expect.objectContaining({ eventId: 'event-uuid-1', userId: `platform-${viewerUser.id}`, status: 'GOING' }),
        update: expect.objectContaining({ status: 'GOING' }),
      })
    );
  });

  it('updates existing RSVP (upsert on unique constraint)', async () => {
    const mockFindUnique = vi.mocked(prisma.platformEvent.findUnique);
    mockFindUnique.mockResolvedValue(sampleEvent as any);

    const mockUpsert = vi.mocked(prisma.eventRSVP.upsert);
    const updatedRSVP = { ...sampleRSVP, status: 'MAYBE' };
    mockUpsert.mockResolvedValue(updatedRSVP as any);

    const app = buildApp(viewerUser);
    const res = await request(app)
      .post('/api/platform/events/event-uuid-1/rsvp')
      .send({ status: 'MAYBE' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('MAYBE');
  });

  it('accepts NOT_GOING status', async () => {
    const mockFindUnique = vi.mocked(prisma.platformEvent.findUnique);
    mockFindUnique.mockResolvedValue(sampleEvent as any);

    const mockUpsert = vi.mocked(prisma.eventRSVP.upsert);
    mockUpsert.mockResolvedValue({ ...sampleRSVP, status: 'NOT_GOING' } as any);

    const app = buildApp(viewerUser);
    const res = await request(app)
      .post('/api/platform/events/event-uuid-1/rsvp')
      .send({ status: 'NOT_GOING' });

    expect(res.status).toBe(200);
  });

  it('allows EDITOR to RSVP', async () => {
    const mockFindUnique = vi.mocked(prisma.platformEvent.findUnique);
    mockFindUnique.mockResolvedValue(sampleEvent as any);

    const mockUpsert = vi.mocked(prisma.eventRSVP.upsert);
    mockUpsert.mockResolvedValue(sampleRSVP as any);

    const app = buildApp(editorUser);
    const res = await request(app)
      .post('/api/platform/events/event-uuid-1/rsvp')
      .send({ status: 'GOING' });

    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /api/platform/events/:id/rsvps
// ---------------------------------------------------------------------------
describe('GET /api/platform/events/:id/rsvps', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(undefined);
    const res = await request(app).get('/api/platform/events/event-uuid-1/rsvps');
    expect(res.status).toBe(401);
  });

  it('returns 403 when VIEWER tries to list RSVPs', async () => {
    const app = buildApp(viewerUser);
    const res = await request(app).get('/api/platform/events/event-uuid-1/rsvps');
    expect(res.status).toBe(403);
  });

  it('returns 404 when event does not exist', async () => {
    const mockFindUnique = vi.mocked(prisma.platformEvent.findUnique);
    mockFindUnique.mockResolvedValue(null);

    const app = buildApp(editorUser);
    const res = await request(app).get('/api/platform/events/nonexistent-uuid/rsvps');
    expect(res.status).toBe(404);
  });

  it('returns all RSVPs for event when EDITOR', async () => {
    const mockFindUnique = vi.mocked(prisma.platformEvent.findUnique);
    mockFindUnique.mockResolvedValue(sampleEvent as any);

    const mockFindMany = vi.mocked(prisma.eventRSVP.findMany);
    mockFindMany.mockResolvedValue([sampleRSVP] as any);

    const app = buildApp(editorUser);
    const res = await request(app).get('/api/platform/events/event-uuid-1/rsvps');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].status).toBe('GOING');
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId: 'event-uuid-1' },
        include: expect.objectContaining({ user: expect.anything() }),
      })
    );
  });

  it('returns all RSVPs for event when ADMIN', async () => {
    const mockFindUnique = vi.mocked(prisma.platformEvent.findUnique);
    mockFindUnique.mockResolvedValue(sampleEvent as any);

    const mockFindMany = vi.mocked(prisma.eventRSVP.findMany);
    mockFindMany.mockResolvedValue([sampleRSVP] as any);

    const app = buildApp(adminUser);
    const res = await request(app).get('/api/platform/events/event-uuid-1/rsvps');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});
