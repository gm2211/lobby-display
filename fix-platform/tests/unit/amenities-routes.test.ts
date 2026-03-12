/**
 * Unit tests for Amenity CRUD API routes.
 *
 * Uses vi.mock to mock Prisma so no database is needed.
 * Tests cover: list, get by id, create, update, soft-delete,
 * availability endpoint, and rule CRUD (nested routes).
 *
 * Auth model:
 *  - GETs require auth (any role)
 *  - Mutations (POST/PUT/DELETE) require EDITOR+ (mapped from "MANAGER+")
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { errorHandler } from '../../server/middleware/errorHandler.js';

// Mock prisma before importing the router
vi.mock('../../server/db.js', () => ({
  default: {
    amenity: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    amenityRule: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
    amenityImage: {
      findMany: vi.fn(),
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
import amenitiesRouter from '../../server/routes/platform/amenities.js';

// Helper to build a mini express app with a given session user
function buildApp(sessionUser?: { id: number; username: string; role: string }) {
  const app = express();
  app.use(express.json());

  // Inject mock session
  app.use((req: any, _res, next) => {
    req.session = { user: sessionUser };
    next();
  });

  app.use('/api/platform/amenities', amenitiesRouter);
  app.use(errorHandler);
  return app;
}

const adminUser = { id: 1, username: 'admin', role: 'ADMIN' as const };
const editorUser = { id: 2, username: 'editor', role: 'EDITOR' as const };
const viewerUser = { id: 3, username: 'viewer', role: 'VIEWER' as const };

const sampleAmenity = {
  id: 'amenity-uuid-1',
  name: 'Rooftop Pool',
  description: 'Heated pool on the rooftop',
  location: 'Floor 30',
  active: true,
  sortOrder: 0,
  markedForDeletion: false,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  images: [{ id: 'img-uuid-1', amenityId: 'amenity-uuid-1', url: '/images/pool.jpg', caption: 'Pool', sortOrder: 0 }],
  rules: [{ id: 'rule-uuid-1', amenityId: 'amenity-uuid-1', title: 'No diving', description: '', sortOrder: 0 }],
};

const sampleRule = {
  id: 'rule-uuid-1',
  amenityId: 'amenity-uuid-1',
  title: 'No diving',
  description: 'No diving in the shallow end',
  sortOrder: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// GET /api/platform/amenities
// ---------------------------------------------------------------------------
describe('GET /api/platform/amenities', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(undefined);
    const res = await request(app).get('/api/platform/amenities');
    expect(res.status).toBe(401);
  });

  it('returns list of active amenities with images for VIEWER', async () => {
    const mockFindMany = vi.mocked(prisma.amenity.findMany);
    mockFindMany.mockResolvedValue([sampleAmenity] as any);

    const app = buildApp(viewerUser);
    const res = await request(app).get('/api/platform/amenities');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Rooftop Pool');
    expect(res.body[0].images).toBeDefined();
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ active: true }),
        include: expect.objectContaining({ images: expect.anything() }),
      })
    );
  });

  it('returns list for EDITOR', async () => {
    const mockFindMany = vi.mocked(prisma.amenity.findMany);
    mockFindMany.mockResolvedValue([sampleAmenity] as any);

    const app = buildApp(editorUser);
    const res = await request(app).get('/api/platform/amenities');
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /api/platform/amenities/:id
// ---------------------------------------------------------------------------
describe('GET /api/platform/amenities/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(undefined);
    const res = await request(app).get('/api/platform/amenities/amenity-uuid-1');
    expect(res.status).toBe(401);
  });

  it('returns amenity with rules and images', async () => {
    const mockFindUnique = vi.mocked(prisma.amenity.findUnique);
    mockFindUnique.mockResolvedValue(sampleAmenity as any);

    const app = buildApp(viewerUser);
    const res = await request(app).get('/api/platform/amenities/amenity-uuid-1');

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Rooftop Pool');
    expect(res.body.rules).toBeDefined();
    expect(res.body.images).toBeDefined();
    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'amenity-uuid-1' },
        include: expect.objectContaining({
          images: expect.anything(),
          rules: expect.anything(),
        }),
      })
    );
  });

  it('returns 404 when amenity does not exist', async () => {
    const mockFindUnique = vi.mocked(prisma.amenity.findUnique);
    mockFindUnique.mockResolvedValue(null);

    const app = buildApp(viewerUser);
    const res = await request(app).get('/api/platform/amenities/nonexistent-uuid');
    expect(res.status).toBe(404);
  });

  it('returns 404 for nonexistent id (UUIDs are strings, no format validation)', async () => {
    const mockFindUnique = vi.mocked(prisma.amenity.findUnique);
    mockFindUnique.mockResolvedValue(null);

    const app = buildApp(viewerUser);
    const res = await request(app).get('/api/platform/amenities/abc');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /api/platform/amenities/:id/availability?date=YYYY-MM-DD
// ---------------------------------------------------------------------------
describe('GET /api/platform/amenities/:id/availability', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(undefined);
    const res = await request(app).get('/api/platform/amenities/amenity-uuid-1/availability?date=2024-01-15');
    expect(res.status).toBe(401);
  });

  it('returns 400 when date param is missing', async () => {
    const mockFindUnique = vi.mocked(prisma.amenity.findUnique);
    mockFindUnique.mockResolvedValue(sampleAmenity as any);

    const app = buildApp(viewerUser);
    const res = await request(app).get('/api/platform/amenities/amenity-uuid-1/availability');
    expect(res.status).toBe(400);
  });

  it('returns 400 when date format is invalid', async () => {
    const mockFindUnique = vi.mocked(prisma.amenity.findUnique);
    mockFindUnique.mockResolvedValue(sampleAmenity as any);

    const app = buildApp(viewerUser);
    const res = await request(app).get('/api/platform/amenities/amenity-uuid-1/availability?date=not-a-date');
    expect(res.status).toBe(400);
  });

  it('returns 404 when amenity does not exist', async () => {
    const mockFindUnique = vi.mocked(prisma.amenity.findUnique);
    mockFindUnique.mockResolvedValue(null);

    const app = buildApp(viewerUser);
    const res = await request(app).get('/api/platform/amenities/amenity-uuid-1/availability?date=2024-01-15');
    expect(res.status).toBe(404);
  });

  it('returns available time slots for a valid date', async () => {
    const mockFindUnique = vi.mocked(prisma.amenity.findUnique);
    mockFindUnique.mockResolvedValue(sampleAmenity as any);

    const app = buildApp(viewerUser);
    const res = await request(app).get('/api/platform/amenities/amenity-uuid-1/availability?date=2024-01-15');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('date', '2024-01-15');
    expect(res.body).toHaveProperty('amenityId', 'amenity-uuid-1');
    expect(res.body).toHaveProperty('slots');
    expect(Array.isArray(res.body.slots)).toBe(true);
  });

  it('returns 404 for nonexistent amenity id with availability', async () => {
    const mockFindUnique = vi.mocked(prisma.amenity.findUnique);
    mockFindUnique.mockResolvedValue(null);

    const app = buildApp(viewerUser);
    const res = await request(app).get('/api/platform/amenities/abc/availability?date=2024-01-15');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/platform/amenities
// ---------------------------------------------------------------------------
describe('POST /api/platform/amenities', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(undefined);
    const res = await request(app)
      .post('/api/platform/amenities')
      .send({ name: 'Gym', description: 'Fitness center', location: 'B1' });
    expect(res.status).toBe(401);
  });

  it('returns 403 when VIEWER tries to create', async () => {
    const app = buildApp(viewerUser);
    const res = await request(app)
      .post('/api/platform/amenities')
      .send({ name: 'Gym', description: 'Fitness center', location: 'B1' });
    expect(res.status).toBe(403);
  });

  it('creates amenity when EDITOR', async () => {
    const mockCreate = vi.mocked(prisma.amenity.create);
    const created = { ...sampleAmenity, id: 'amenity-uuid-2', name: 'Gym', images: [], rules: [] };
    mockCreate.mockResolvedValue(created as any);

    const app = buildApp(editorUser);
    const res = await request(app)
      .post('/api/platform/amenities')
      .send({ name: 'Gym', description: 'Fitness center', location: 'B1' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Gym');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Gym' }),
      })
    );
  });

  it('creates amenity when ADMIN', async () => {
    const mockCreate = vi.mocked(prisma.amenity.create);
    const created = { ...sampleAmenity, id: 'amenity-uuid-3', name: 'Sauna', images: [], rules: [] };
    mockCreate.mockResolvedValue(created as any);

    const app = buildApp(adminUser);
    const res = await request(app)
      .post('/api/platform/amenities')
      .send({ name: 'Sauna', description: 'Dry sauna', location: 'Floor 2' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Sauna');
  });
});

// ---------------------------------------------------------------------------
// PUT /api/platform/amenities/:id
// ---------------------------------------------------------------------------
describe('PUT /api/platform/amenities/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(undefined);
    const res = await request(app)
      .put('/api/platform/amenities/amenity-uuid-1')
      .send({ name: 'Updated Pool' });
    expect(res.status).toBe(401);
  });

  it('returns 403 when VIEWER tries to update', async () => {
    const app = buildApp(viewerUser);
    const res = await request(app)
      .put('/api/platform/amenities/amenity-uuid-1')
      .send({ name: 'Updated Pool' });
    expect(res.status).toBe(403);
  });

  it('updates amenity when EDITOR', async () => {
    const mockUpdate = vi.mocked(prisma.amenity.update);
    const updated = { ...sampleAmenity, name: 'Updated Pool' };
    mockUpdate.mockResolvedValue(updated as any);

    const app = buildApp(editorUser);
    const res = await request(app)
      .put('/api/platform/amenities/amenity-uuid-1')
      .send({ name: 'Updated Pool' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Pool');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'amenity-uuid-1' },
        data: expect.objectContaining({ name: 'Updated Pool' }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/platform/amenities/:id
// ---------------------------------------------------------------------------
describe('DELETE /api/platform/amenities/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(undefined);
    const res = await request(app).delete('/api/platform/amenities/amenity-uuid-1');
    expect(res.status).toBe(401);
  });

  it('returns 403 when VIEWER tries to delete', async () => {
    const app = buildApp(viewerUser);
    const res = await request(app).delete('/api/platform/amenities/amenity-uuid-1');
    expect(res.status).toBe(403);
  });

  it('soft deletes amenity by setting active=false when EDITOR', async () => {
    const mockUpdate = vi.mocked(prisma.amenity.update);
    mockUpdate.mockResolvedValue({ ...sampleAmenity, active: false } as any);

    const app = buildApp(editorUser);
    const res = await request(app).delete('/api/platform/amenities/amenity-uuid-1');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // Amenity route uses active=false for soft deletion
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'amenity-uuid-1' },
        data: { active: false },
      })
    );
  });

  it('soft delete does NOT set deletedAt', async () => {
    const mockUpdate = vi.mocked(prisma.amenity.update);
    mockUpdate.mockResolvedValue({ ...sampleAmenity, active: false } as any);

    const app = buildApp(adminUser);
    await request(app).delete('/api/platform/amenities/amenity-uuid-1');

    const callArg = mockUpdate.mock.calls[0][0] as any;
    expect(callArg.data.deletedAt).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// POST /api/platform/amenities/:id/rules
// ---------------------------------------------------------------------------
describe('POST /api/platform/amenities/:id/rules', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(undefined);
    const res = await request(app)
      .post('/api/platform/amenities/amenity-uuid-1/rules')
      .send({ title: 'New Rule' });
    expect(res.status).toBe(401);
  });

  it('returns 403 when VIEWER tries to add rule', async () => {
    const app = buildApp(viewerUser);
    const res = await request(app)
      .post('/api/platform/amenities/amenity-uuid-1/rules')
      .send({ title: 'New Rule' });
    expect(res.status).toBe(403);
  });

  it('creates a rule for existing amenity when EDITOR', async () => {
    const mockFindUnique = vi.mocked(prisma.amenity.findUnique);
    mockFindUnique.mockResolvedValue(sampleAmenity as any);

    const mockRuleCreate = vi.mocked(prisma.amenityRule.create);
    const newRule = { id: 'rule-uuid-2', amenityId: 'amenity-uuid-1', ruleType: 'MAX_DURATION', ruleValue: { hours: 2 }, active: true };
    mockRuleCreate.mockResolvedValue(newRule as any);

    const app = buildApp(editorUser);
    const res = await request(app)
      .post('/api/platform/amenities/amenity-uuid-1/rules')
      .send({ ruleType: 'MAX_DURATION', ruleValue: { hours: 2 } });

    expect(res.status).toBe(201);
    expect(res.body.ruleType).toBe('MAX_DURATION');
    expect(mockRuleCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ amenityId: 'amenity-uuid-1', ruleType: 'MAX_DURATION' }),
      })
    );
  });

  it('returns 404 when parent amenity does not exist', async () => {
    const mockFindUnique = vi.mocked(prisma.amenity.findUnique);
    mockFindUnique.mockResolvedValue(null);

    const app = buildApp(editorUser);
    const res = await request(app)
      .post('/api/platform/amenities/nonexistent-uuid/rules')
      .send({ title: 'No running' });

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/platform/amenities/:id/rules/:ruleId
// ---------------------------------------------------------------------------
describe('PUT /api/platform/amenities/:id/rules/:ruleId', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(undefined);
    const res = await request(app)
      .put('/api/platform/amenities/amenity-uuid-1/rules/rule-uuid-1')
      .send({ title: 'Updated Rule' });
    expect(res.status).toBe(401);
  });

  it('returns 403 when VIEWER tries to update rule', async () => {
    const app = buildApp(viewerUser);
    const res = await request(app)
      .put('/api/platform/amenities/amenity-uuid-1/rules/rule-uuid-1')
      .send({ title: 'Updated Rule' });
    expect(res.status).toBe(403);
  });

  it('updates a rule when EDITOR', async () => {
    const mockRuleFindUnique = vi.mocked(prisma.amenityRule.findUnique);
    mockRuleFindUnique.mockResolvedValue({ id: 'rule-uuid-1', amenityId: 'amenity-uuid-1', ruleType: 'MAX_DURATION', ruleValue: { hours: 2 }, active: true } as any);

    const mockRuleUpdate = vi.mocked(prisma.amenityRule.update);
    const updated = { id: 'rule-uuid-1', amenityId: 'amenity-uuid-1', ruleType: 'MAX_DURATION', ruleValue: { hours: 3 }, active: true };
    mockRuleUpdate.mockResolvedValue(updated as any);

    const app = buildApp(editorUser);
    const res = await request(app)
      .put('/api/platform/amenities/amenity-uuid-1/rules/rule-uuid-1')
      .send({ ruleValue: { hours: 3 } });

    expect(res.status).toBe(200);
    expect(res.body.ruleValue).toEqual({ hours: 3 });
    expect(mockRuleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'rule-uuid-1' },
        data: expect.objectContaining({ ruleValue: { hours: 3 } }),
      })
    );
  });

  it('returns 404 when rule does not belong to amenity', async () => {
    const mockRuleFindUnique = vi.mocked(prisma.amenityRule.findUnique);
    // Rule belongs to a different amenity
    mockRuleFindUnique.mockResolvedValue({ ...sampleRule, amenityId: 'other-amenity-uuid' } as any);

    const app = buildApp(editorUser);
    const res = await request(app)
      .put('/api/platform/amenities/amenity-uuid-1/rules/rule-uuid-1')
      .send({ title: 'Updated' });

    expect(res.status).toBe(404);
  });

  it('returns 404 when rule does not exist', async () => {
    const mockRuleFindUnique = vi.mocked(prisma.amenityRule.findUnique);
    mockRuleFindUnique.mockResolvedValue(null);

    const app = buildApp(editorUser);
    const res = await request(app)
      .put('/api/platform/amenities/amenity-uuid-1/rules/nonexistent-uuid')
      .send({ title: 'Updated' });

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/platform/amenities/:id/rules/:ruleId
// ---------------------------------------------------------------------------
describe('DELETE /api/platform/amenities/:id/rules/:ruleId', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(undefined);
    const res = await request(app).delete('/api/platform/amenities/amenity-uuid-1/rules/rule-uuid-1');
    expect(res.status).toBe(401);
  });

  it('returns 403 when VIEWER tries to delete rule', async () => {
    const app = buildApp(viewerUser);
    const res = await request(app).delete('/api/platform/amenities/amenity-uuid-1/rules/rule-uuid-1');
    expect(res.status).toBe(403);
  });

  it('deletes a rule when EDITOR', async () => {
    const mockRuleFindUnique = vi.mocked(prisma.amenityRule.findUnique);
    mockRuleFindUnique.mockResolvedValue({ ...sampleRule, amenityId: 'amenity-uuid-1' } as any);

    const mockRuleDelete = vi.mocked(prisma.amenityRule.delete);
    mockRuleDelete.mockResolvedValue(sampleRule as any);

    const app = buildApp(editorUser);
    const res = await request(app).delete('/api/platform/amenities/amenity-uuid-1/rules/rule-uuid-1');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockRuleDelete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'rule-uuid-1' } })
    );
  });

  it('returns 404 when rule does not belong to amenity', async () => {
    const mockRuleFindUnique = vi.mocked(prisma.amenityRule.findUnique);
    mockRuleFindUnique.mockResolvedValue({ ...sampleRule, amenityId: 'other-amenity-uuid' } as any);

    const app = buildApp(editorUser);
    const res = await request(app).delete('/api/platform/amenities/amenity-uuid-1/rules/rule-uuid-1');

    expect(res.status).toBe(404);
  });

  it('returns 404 when rule does not exist', async () => {
    const mockRuleFindUnique = vi.mocked(prisma.amenityRule.findUnique);
    mockRuleFindUnique.mockResolvedValue(null);

    const app = buildApp(editorUser);
    const res = await request(app).delete('/api/platform/amenities/amenity-uuid-1/rules/nonexistent-uuid');

    expect(res.status).toBe(404);
  });
});
