/**
 * Unit tests for Global Search API route.
 *
 * Uses vi.mock to mock the search service so no database is needed.
 * Tests cover: missing q param (400), correct service call, result shape,
 * limit/offset pagination, and entity type filtering.
 *
 * Auth model:
 *  - GET requires auth (any role)
 *  - No mutations
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { errorHandler } from '../../server/middleware/errorHandler.js';

// Mock the search service before importing the router
vi.mock('../../server/services/search.js', () => ({
  searchEntities: vi.fn(),
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

import { searchEntities } from '../../server/services/search.js';
import searchRouter from '../../server/routes/platform/search.js';

// Helper to build a mini express app with a given session user
function buildApp(sessionUser?: { id: number; username: string; role: string }) {
  const app = express();
  app.use(express.json());

  // Inject mock session
  app.use((req: any, _res, next) => {
    req.session = { user: sessionUser };
    next();
  });

  app.use('/api/platform/search', searchRouter);
  app.use(errorHandler);
  return app;
}

const viewerUser = { id: 3, username: 'viewer', role: 'VIEWER' as const };
const adminUser = { id: 1, username: 'admin', role: 'ADMIN' as const };

const sampleResults = [
  {
    id: 'idx-1',
    entityType: 'Announcement',
    entityId: 'ann-1',
    title: 'Lobby Renovation',
    body: 'The lobby is being renovated starting Monday',
    metadata: null,
    createdAt: new Date('2024-01-10'),
  },
  {
    id: 'idx-2',
    entityType: 'Event',
    entityId: 'evt-5',
    title: 'Lobby Gathering',
    body: 'Community gathering in the lobby',
    metadata: { category: 'social' },
    createdAt: new Date('2024-01-08'),
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
describe('GET /api/platform/search - auth', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(undefined);
    const res = await request(app).get('/api/platform/search?q=lobby');
    expect(res.status).toBe(401);
  });

  it('returns results when VIEWER is authenticated', async () => {
    vi.mocked(searchEntities).mockResolvedValue(sampleResults as any);
    const app = buildApp(viewerUser);
    const res = await request(app).get('/api/platform/search?q=lobby');
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
describe('GET /api/platform/search - validation', () => {
  it('returns 400 if q param is missing', async () => {
    const app = buildApp(viewerUser);
    const res = await request(app).get('/api/platform/search');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });

  it('returns 400 if q param is empty string', async () => {
    const app = buildApp(viewerUser);
    const res = await request(app).get('/api/platform/search?q=');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });

  it('returns 400 if q param is only whitespace', async () => {
    const app = buildApp(viewerUser);
    const res = await request(app).get('/api/platform/search?q=%20%20');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });
});

// ---------------------------------------------------------------------------
// Basic search
// ---------------------------------------------------------------------------
describe('GET /api/platform/search - results', () => {
  it('calls searchEntities with trimmed query and no entity type', async () => {
    vi.mocked(searchEntities).mockResolvedValue(sampleResults as any);
    const app = buildApp(viewerUser);
    await request(app).get('/api/platform/search?q=lobby');

    expect(searchEntities).toHaveBeenCalledWith('lobby', undefined);
  });

  it('returns results array and total count', async () => {
    vi.mocked(searchEntities).mockResolvedValue(sampleResults as any);
    const app = buildApp(viewerUser);
    const res = await request(app).get('/api/platform/search?q=lobby');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('results');
    expect(res.body).toHaveProperty('total', 2);
    expect(res.body.results).toHaveLength(2);
    expect(res.body.results[0].title).toBe('Lobby Renovation');
  });

  it('returns empty results and total 0 when no matches', async () => {
    vi.mocked(searchEntities).mockResolvedValue([]);
    const app = buildApp(viewerUser);
    const res = await request(app).get('/api/platform/search?q=nonexistent');

    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('passes type filter to searchEntities', async () => {
    vi.mocked(searchEntities).mockResolvedValue([sampleResults[0]] as any);
    const app = buildApp(viewerUser);
    const res = await request(app).get('/api/platform/search?q=lobby&type=Announcement');

    expect(searchEntities).toHaveBeenCalledWith('lobby', 'Announcement');
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
  });

  it('does not pass empty type to searchEntities', async () => {
    vi.mocked(searchEntities).mockResolvedValue(sampleResults as any);
    const app = buildApp(viewerUser);
    await request(app).get('/api/platform/search?q=lobby&type=');

    expect(searchEntities).toHaveBeenCalledWith('lobby', undefined);
  });
});

// ---------------------------------------------------------------------------
// Pagination: limit/offset
// ---------------------------------------------------------------------------
describe('GET /api/platform/search - pagination', () => {
  const manyResults = Array.from({ length: 50 }, (_, i) => ({
    id: `idx-${i}`,
    entityType: 'Event',
    entityId: `evt-${i}`,
    title: `Event ${i}`,
    body: `Body ${i}`,
    metadata: null,
    createdAt: new Date(),
  }));

  it('defaults to limit 20 and offset 0', async () => {
    vi.mocked(searchEntities).mockResolvedValue(manyResults as any);
    const app = buildApp(viewerUser);
    const res = await request(app).get('/api/platform/search?q=event');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(50);
    expect(res.body.results).toHaveLength(20);
    // first item should be index 0
    expect(res.body.results[0].entityId).toBe('evt-0');
  });

  it('respects custom limit', async () => {
    vi.mocked(searchEntities).mockResolvedValue(manyResults as any);
    const app = buildApp(viewerUser);
    const res = await request(app).get('/api/platform/search?q=event&limit=5');

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(5);
    expect(res.body.total).toBe(50);
  });

  it('respects offset', async () => {
    vi.mocked(searchEntities).mockResolvedValue(manyResults as any);
    const app = buildApp(viewerUser);
    const res = await request(app).get('/api/platform/search?q=event&limit=10&offset=10');

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(10);
    expect(res.body.results[0].entityId).toBe('evt-10');
    expect(res.body.total).toBe(50);
  });

  it('caps limit at 100', async () => {
    const lotsOfResults = Array.from({ length: 200 }, (_, i) => ({
      id: `idx-${i}`,
      entityType: 'Event',
      entityId: `evt-${i}`,
      title: `Event ${i}`,
      body: `Body ${i}`,
      metadata: null,
      createdAt: new Date(),
    }));
    vi.mocked(searchEntities).mockResolvedValue(lotsOfResults as any);
    const app = buildApp(adminUser);
    const res = await request(app).get('/api/platform/search?q=event&limit=500');

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(100);
    expect(res.body.total).toBe(200);
  });

  it('returns fewer results when offset is near end', async () => {
    vi.mocked(searchEntities).mockResolvedValue(manyResults as any);
    const app = buildApp(viewerUser);
    const res = await request(app).get('/api/platform/search?q=event&limit=20&offset=45');

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(5);
    expect(res.body.total).toBe(50);
  });
});
