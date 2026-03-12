/**
 * Unit tests for Marketplace API routes.
 *
 * Uses vi.mock to mock Prisma so no database is needed.
 * Tests cover:
 *  - GET /categories       - list distinct categories (must be before /:id)
 *  - GET /                 - list active listings, filterable, paginated
 *  - GET /:id              - listing detail with images
 *  - POST /                - create listing (any auth user with platform user record)
 *  - PUT /:id              - update own listing
 *  - DELETE /:id           - delete own listing, or MANAGER+ can remove
 *
 * Auth model:
 *  - All routes require authentication (requireAuth)
 *  - POST requires a platform user record (attached via platformProtectStrict)
 *  - PUT /:id — owner or MANAGER+
 *  - DELETE /:id — owner or MANAGER+
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { errorHandler } from '../../server/middleware/errorHandler.js';

// Mock Prisma before importing routes
vi.mock('../../server/db.js', () => ({
  default: {
    marketplaceListing: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      groupBy: vi.fn(),
    },
    listingImage: {
      createMany: vi.fn(),
    },
    platformUser: {
      findUnique: vi.fn(),
    },
  },
}));

import prisma from '../../server/db.js';
import marketplaceRouter from '../../server/routes/platform/marketplace.js';

// Type helpers for mocked Prisma functions
const mockPrisma = prisma as {
  marketplaceListing: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    groupBy: ReturnType<typeof vi.fn>;
  };
  listingImage: {
    createMany: ReturnType<typeof vi.fn>;
  };
  platformUser: {
    findUnique: ReturnType<typeof vi.fn>;
  };
};

/** Build a minimal Express app with a session user. */
function buildApp(
  role: 'ADMIN' | 'EDITOR' | 'VIEWER' | null = 'ADMIN',
  userId: number = 1,
  platformUserId: string | null = 'platform-user-uuid-1'
) {
  const app = express();
  app.use(express.json());

  // Inject mock session
  app.use((req: any, _res: any, next: any) => {
    if (role !== null) {
      req.session = { user: { id: userId, username: 'testuser', role } };
    } else {
      req.session = {};
    }
    next();
  });

  // Configure mock platformUser.findUnique so platformProtectStrict can run
  if (role !== null && platformUserId !== null) {
    mockPrisma.platformUser.findUnique.mockResolvedValue({
      id: platformUserId,
      userId,
      role: 'RESIDENT',
      unitNumber: '101',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  } else if (role !== null && platformUserId === null) {
    // No platform user — platformProtectStrict will return 403
    mockPrisma.platformUser.findUnique.mockResolvedValue(null);
  }

  app.use('/api/platform/marketplace', marketplaceRouter);
  app.use(errorHandler);
  return app;
}

const sampleListing = {
  id: 'listing-uuid-1',
  sellerId: 'platform-user-uuid-1',
  title: 'Used Couch',
  description: 'In good condition',
  price: '150.00',
  category: 'Furniture',
  condition: 'Good',
  status: 'ACTIVE',
  createdAt: new Date('2025-01-01').toISOString(),
  updatedAt: new Date('2025-01-01').toISOString(),
  images: [],
};

const sampleListingWithImages = {
  ...sampleListing,
  images: [
    { id: 'img-uuid-1', listingId: 'listing-uuid-1', url: 'https://example.com/img1.jpg', sortOrder: 0 },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── GET /categories ──────────────────────────────────────────────────────────

describe('GET /api/platform/marketplace/categories', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).get('/api/platform/marketplace/categories');
    expect(res.status).toBe(401);
  });

  it('returns distinct categories for authenticated user', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.marketplaceListing.groupBy.mockResolvedValue([
      { category: 'Furniture' },
      { category: 'Electronics' },
    ]);
    const res = await request(app).get('/api/platform/marketplace/categories');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toContain('Furniture');
    expect(res.body).toContain('Electronics');
  });

  it('calls groupBy with correct args', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.marketplaceListing.groupBy.mockResolvedValue([{ category: 'Furniture' }]);
    await request(app).get('/api/platform/marketplace/categories');
    const callArgs = mockPrisma.marketplaceListing.groupBy.mock.calls[0][0];
    expect(callArgs.by).toContain('category');
  });

  it('returns empty array when no listings exist', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.marketplaceListing.groupBy.mockResolvedValue([]);
    const res = await request(app).get('/api/platform/marketplace/categories');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ─── GET / ────────────────────────────────────────────────────────────────────

describe('GET /api/platform/marketplace', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).get('/api/platform/marketplace');
    expect(res.status).toBe(401);
  });

  it('returns active listings for authenticated user', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.marketplaceListing.findMany.mockResolvedValue([sampleListing]);
    const res = await request(app).get('/api/platform/marketplace');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.listings)).toBe(true);
    expect(res.body.listings.length).toBe(1);
    expect(res.body.listings[0].id).toBe('listing-uuid-1');
  });

  it('filters by ACTIVE status by default', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.marketplaceListing.findMany.mockResolvedValue([sampleListing]);
    await request(app).get('/api/platform/marketplace');
    const callArgs = mockPrisma.marketplaceListing.findMany.mock.calls[0][0];
    expect(callArgs.where).toMatchObject({ status: 'ACTIVE' });
  });

  it('filters by category when ?category= is provided', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.marketplaceListing.findMany.mockResolvedValue([sampleListing]);
    await request(app).get('/api/platform/marketplace?category=Furniture');
    const callArgs = mockPrisma.marketplaceListing.findMany.mock.calls[0][0];
    expect(callArgs.where).toMatchObject({ category: 'Furniture' });
  });

  it('filters by minPrice when ?minPrice= is provided', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.marketplaceListing.findMany.mockResolvedValue([]);
    await request(app).get('/api/platform/marketplace?minPrice=50');
    const callArgs = mockPrisma.marketplaceListing.findMany.mock.calls[0][0];
    expect(callArgs.where.price).toMatchObject({ gte: 50 });
  });

  it('filters by maxPrice when ?maxPrice= is provided', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.marketplaceListing.findMany.mockResolvedValue([]);
    await request(app).get('/api/platform/marketplace?maxPrice=200');
    const callArgs = mockPrisma.marketplaceListing.findMany.mock.calls[0][0];
    expect(callArgs.where.price).toMatchObject({ lte: 200 });
  });

  it('filters by both minPrice and maxPrice', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.marketplaceListing.findMany.mockResolvedValue([]);
    await request(app).get('/api/platform/marketplace?minPrice=50&maxPrice=200');
    const callArgs = mockPrisma.marketplaceListing.findMany.mock.calls[0][0];
    expect(callArgs.where.price).toMatchObject({ gte: 50, lte: 200 });
  });

  it('returns pagination metadata', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.marketplaceListing.findMany.mockResolvedValue([sampleListing]);
    const res = await request(app).get('/api/platform/marketplace');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('pagination');
    expect(res.body.pagination).toHaveProperty('page');
    expect(res.body.pagination).toHaveProperty('pageSize');
    expect(res.body.pagination).toHaveProperty('total');
  });

  it('respects ?page= and ?pageSize= query params', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.marketplaceListing.findMany.mockResolvedValue([]);
    await request(app).get('/api/platform/marketplace?page=2&pageSize=5');
    const callArgs = mockPrisma.marketplaceListing.findMany.mock.calls[0][0];
    expect(callArgs.skip).toBe(5);
    expect(callArgs.take).toBe(5);
  });

  it('includes images in listing results', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.marketplaceListing.findMany.mockResolvedValue([sampleListingWithImages]);
    await request(app).get('/api/platform/marketplace');
    const callArgs = mockPrisma.marketplaceListing.findMany.mock.calls[0][0];
    expect(callArgs.include).toHaveProperty('images');
  });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────

describe('GET /api/platform/marketplace/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).get('/api/platform/marketplace/listing-uuid-1');
    expect(res.status).toBe(401);
  });

  it('returns 404 when listing not found', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.marketplaceListing.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/platform/marketplace/nonexistent-id');
    expect(res.status).toBe(404);
  });

  it('returns listing with images for authenticated user', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.marketplaceListing.findUnique.mockResolvedValue(sampleListingWithImages);
    const res = await request(app).get('/api/platform/marketplace/listing-uuid-1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('listing-uuid-1');
    expect(res.body.title).toBe('Used Couch');
    expect(Array.isArray(res.body.images)).toBe(true);
  });

  it('queries by id correctly', async () => {
    const app = buildApp('ADMIN');
    mockPrisma.marketplaceListing.findUnique.mockResolvedValue(sampleListingWithImages);
    await request(app).get('/api/platform/marketplace/listing-uuid-1');
    const callArgs = mockPrisma.marketplaceListing.findUnique.mock.calls[0][0];
    expect(callArgs.where).toMatchObject({ id: 'listing-uuid-1' });
    expect(callArgs.include).toHaveProperty('images');
  });
});

// ─── POST / ───────────────────────────────────────────────────────────────────

describe('POST /api/platform/marketplace', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app)
      .post('/api/platform/marketplace')
      .send({ title: 'Test', description: 'Desc', category: 'Furniture', price: 100 });
    expect(res.status).toBe(401);
  });

  it('returns 403 when user has no platform user record', async () => {
    const app = buildApp('VIEWER', 1, null);
    const res = await request(app)
      .post('/api/platform/marketplace')
      .send({ title: 'Test', description: 'Desc', category: 'Furniture' });
    expect(res.status).toBe(403);
  });

  it('returns 400 when title is missing', async () => {
    const app = buildApp('VIEWER');
    const res = await request(app)
      .post('/api/platform/marketplace')
      .send({ description: 'Desc', category: 'Furniture' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/title/i);
  });

  it('returns 400 when description is missing', async () => {
    const app = buildApp('VIEWER');
    const res = await request(app)
      .post('/api/platform/marketplace')
      .send({ title: 'Test', category: 'Furniture' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/description/i);
  });

  it('returns 400 when category is missing', async () => {
    const app = buildApp('VIEWER');
    const res = await request(app)
      .post('/api/platform/marketplace')
      .send({ title: 'Test', description: 'Desc' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/category/i);
  });

  it('creates listing for any authenticated user with platform record', async () => {
    const app = buildApp('VIEWER', 1, 'platform-user-uuid-1');
    mockPrisma.marketplaceListing.create.mockResolvedValue(sampleListing);
    const res = await request(app)
      .post('/api/platform/marketplace')
      .send({ title: 'Used Couch', description: 'In good condition', category: 'Furniture', price: 150 });
    expect(res.status).toBe(201);
    const createArgs = mockPrisma.marketplaceListing.create.mock.calls[0][0];
    expect(createArgs.data.title).toBe('Used Couch');
    expect(createArgs.data.sellerId).toBe('platform-user-uuid-1');
  });

  it('creates listing with ACTIVE status by default', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.marketplaceListing.create.mockResolvedValue(sampleListing);
    await request(app)
      .post('/api/platform/marketplace')
      .send({ title: 'Test', description: 'Desc', category: 'Furniture' });
    const createArgs = mockPrisma.marketplaceListing.create.mock.calls[0][0];
    expect(createArgs.data.status).toBe('ACTIVE');
  });

  it('accepts optional price, condition fields', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.marketplaceListing.create.mockResolvedValue(sampleListing);
    await request(app)
      .post('/api/platform/marketplace')
      .send({ title: 'Test', description: 'Desc', category: 'Furniture', price: 75, condition: 'Excellent' });
    const createArgs = mockPrisma.marketplaceListing.create.mock.calls[0][0];
    expect(createArgs.data.condition).toBe('Excellent');
  });

  it('creates listing for EDITOR role', async () => {
    const app = buildApp('EDITOR', 2, 'platform-user-uuid-2');
    mockPrisma.marketplaceListing.create.mockResolvedValue({ ...sampleListing, sellerId: 'platform-user-uuid-2' });
    const res = await request(app)
      .post('/api/platform/marketplace')
      .send({ title: 'Test', description: 'Desc', category: 'Electronics' });
    expect(res.status).toBe(201);
  });
});

// ─── PUT /:id ─────────────────────────────────────────────────────────────────

describe('PUT /api/platform/marketplace/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app)
      .put('/api/platform/marketplace/listing-uuid-1')
      .send({ title: 'Updated' });
    expect(res.status).toBe(401);
  });

  it('returns 404 when listing not found', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.marketplaceListing.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .put('/api/platform/marketplace/nonexistent')
      .send({ title: 'Updated' });
    expect(res.status).toBe(404);
  });

  it('returns 403 when non-owner tries to update', async () => {
    const app = buildApp('VIEWER', 1, 'platform-user-uuid-1');
    // Listing owned by someone else
    mockPrisma.marketplaceListing.findUnique.mockResolvedValue({
      ...sampleListing,
      sellerId: 'platform-user-uuid-2',
    });
    const res = await request(app)
      .put('/api/platform/marketplace/listing-uuid-1')
      .send({ title: 'Updated' });
    expect(res.status).toBe(403);
  });

  it('allows owner to update own listing', async () => {
    const app = buildApp('VIEWER', 1, 'platform-user-uuid-1');
    mockPrisma.marketplaceListing.findUnique.mockResolvedValue({
      ...sampleListing,
      sellerId: 'platform-user-uuid-1',
    });
    const updatedListing = { ...sampleListing, title: 'Updated Couch' };
    mockPrisma.marketplaceListing.update.mockResolvedValue(updatedListing);
    const res = await request(app)
      .put('/api/platform/marketplace/listing-uuid-1')
      .send({ title: 'Updated Couch' });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated Couch');
  });

  it('allows MANAGER role to update any listing', async () => {
    // MANAGER role is a platform role, but for this test the user is ADMIN (has higher system role)
    // The ticket says MANAGER+ can remove — we treat this as: EDITOR+ system role can update any listing
    const app = buildApp('EDITOR', 99, 'platform-user-uuid-99');
    mockPrisma.marketplaceListing.findUnique.mockResolvedValue({
      ...sampleListing,
      sellerId: 'platform-user-uuid-1', // different owner
    });
    mockPrisma.marketplaceListing.update.mockResolvedValue({ ...sampleListing, title: 'Admin Updated' });
    const res = await request(app)
      .put('/api/platform/marketplace/listing-uuid-1')
      .send({ title: 'Admin Updated' });
    expect(res.status).toBe(200);
  });

  it('only updates provided fields', async () => {
    const app = buildApp('VIEWER', 1, 'platform-user-uuid-1');
    mockPrisma.marketplaceListing.findUnique.mockResolvedValue({
      ...sampleListing,
      sellerId: 'platform-user-uuid-1',
    });
    mockPrisma.marketplaceListing.update.mockResolvedValue({ ...sampleListing, price: '200.00' });
    await request(app)
      .put('/api/platform/marketplace/listing-uuid-1')
      .send({ price: 200 });
    const updateArgs = mockPrisma.marketplaceListing.update.mock.calls[0][0];
    expect(updateArgs.data).toHaveProperty('price');
    expect(updateArgs.data).not.toHaveProperty('title');
  });
});

// ─── DELETE /:id ──────────────────────────────────────────────────────────────

describe('DELETE /api/platform/marketplace/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).delete('/api/platform/marketplace/listing-uuid-1');
    expect(res.status).toBe(401);
  });

  it('returns 404 when listing not found', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.marketplaceListing.findUnique.mockResolvedValue(null);
    const res = await request(app).delete('/api/platform/marketplace/nonexistent');
    expect(res.status).toBe(404);
  });

  it('returns 403 when non-owner tries to delete', async () => {
    const app = buildApp('VIEWER', 1, 'platform-user-uuid-1');
    mockPrisma.marketplaceListing.findUnique.mockResolvedValue({
      ...sampleListing,
      sellerId: 'platform-user-uuid-2',
    });
    const res = await request(app).delete('/api/platform/marketplace/listing-uuid-1');
    expect(res.status).toBe(403);
  });

  it('allows owner to delete own listing', async () => {
    const app = buildApp('VIEWER', 1, 'platform-user-uuid-1');
    mockPrisma.marketplaceListing.findUnique.mockResolvedValue({
      ...sampleListing,
      sellerId: 'platform-user-uuid-1',
    });
    mockPrisma.marketplaceListing.delete.mockResolvedValue(sampleListing);
    const res = await request(app).delete('/api/platform/marketplace/listing-uuid-1');
    expect(res.status).toBe(204);
    expect(mockPrisma.marketplaceListing.delete).toHaveBeenCalledOnce();
    const deleteArgs = mockPrisma.marketplaceListing.delete.mock.calls[0][0];
    expect(deleteArgs.where).toMatchObject({ id: 'listing-uuid-1' });
  });

  it('allows EDITOR+ to delete any listing', async () => {
    const app = buildApp('EDITOR', 99, 'platform-user-uuid-99');
    mockPrisma.marketplaceListing.findUnique.mockResolvedValue({
      ...sampleListing,
      sellerId: 'platform-user-uuid-1',
    });
    mockPrisma.marketplaceListing.delete.mockResolvedValue(sampleListing);
    const res = await request(app).delete('/api/platform/marketplace/listing-uuid-1');
    expect(res.status).toBe(204);
  });

  it('allows ADMIN to delete any listing', async () => {
    const app = buildApp('ADMIN', 99, 'platform-user-uuid-99');
    mockPrisma.marketplaceListing.findUnique.mockResolvedValue({
      ...sampleListing,
      sellerId: 'platform-user-uuid-1',
    });
    mockPrisma.marketplaceListing.delete.mockResolvedValue(sampleListing);
    const res = await request(app).delete('/api/platform/marketplace/listing-uuid-1');
    expect(res.status).toBe(204);
  });
});
