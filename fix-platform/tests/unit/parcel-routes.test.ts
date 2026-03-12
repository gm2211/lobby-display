/**
 * Unit tests for Parcel CRUD API routes.
 *
 * Uses vi.mock() to mock Prisma — no real DB needed.
 * Tests cover: list, detail, create, update, pickup, soft-delete, auth guards.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';

// Must mock BEFORE importing the router
vi.mock('../../server/db.js', () => ({
  default: {
    parcel: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Also mock csrf so it doesn't interfere
vi.mock('../../server/middleware/csrf.js', () => ({
  csrfMiddleware: (_req: any, _res: any, next: any) => next(),
}));

import parcelsRouter from '../../server/routes/platform/parcels.js';
import prisma from '../../server/db.js';

const mockPrisma = prisma as {
  parcel: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

// ---------------------------------------------------------------------------
// Test app helpers
// ---------------------------------------------------------------------------

function makeApp(role?: 'VIEWER' | 'EDITOR' | 'ADMIN') {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: 'test-secret',
      resave: false,
      saveUninitialized: false,
    })
  );

  // Inject a fake session user for auth middleware
  if (role) {
    app.use((req, _res, next) => {
      req.session.user = { id: 1, username: 'testuser', role };
      next();
    });
  }

  app.use('/api/platform/parcels', parcelsRouter);
  return app;
}

const SAMPLE_PARCEL = {
  id: 1,
  trackingNumber: '1Z999AA10123456784',
  carrier: 'UPS',
  description: 'Amazon package',
  recipientId: 42,
  unitNumber: '4B',
  status: 'RECEIVED',
  receivedBy: 'John Doe',
  receivedAt: new Date('2024-01-15T10:00:00Z'),
  pickedUpAt: null,
  photoId: null,
  notes: null,
  markedForDeletion: false,
  createdAt: new Date('2024-01-15T10:00:00Z'),
  updatedAt: new Date('2024-01-15T10:00:00Z'),
};

// ---------------------------------------------------------------------------
// Describe blocks
// ---------------------------------------------------------------------------

describe('GET /api/platform/parcels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    const app = makeApp(); // no role = no session user
    const res = await request(app).get('/api/platform/parcels');
    expect(res.status).toBe(401);
  });

  it('returns all parcels for EDITOR role', async () => {
    mockPrisma.parcel.findMany.mockResolvedValue([SAMPLE_PARCEL]);
    const app = makeApp('EDITOR');
    const res = await request(app).get('/api/platform/parcels');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(1);
  });

  it('EDITOR sees all parcels (no recipientId filter)', async () => {
    mockPrisma.parcel.findMany.mockResolvedValue([SAMPLE_PARCEL]);
    const app = makeApp('EDITOR');
    await request(app).get('/api/platform/parcels');
    expect(mockPrisma.parcel.findMany).toHaveBeenCalledWith(
      expect.not.objectContaining({ where: { recipientId: expect.anything() } })
    );
  });

  it('VIEWER sees only their own parcels (recipientId filter)', async () => {
    mockPrisma.parcel.findMany.mockResolvedValue([SAMPLE_PARCEL]);
    const app = makeApp('VIEWER');
    await request(app).get('/api/platform/parcels');
    // VIEWER session user id is 1
    expect(mockPrisma.parcel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ recipientId: 1 }),
      })
    );
  });

  it('ADMIN sees all parcels', async () => {
    mockPrisma.parcel.findMany.mockResolvedValue([SAMPLE_PARCEL]);
    const app = makeApp('ADMIN');
    await request(app).get('/api/platform/parcels');
    expect(mockPrisma.parcel.findMany).toHaveBeenCalledWith(
      expect.not.objectContaining({ where: { recipientId: expect.anything() } })
    );
  });
});

describe('GET /api/platform/parcels/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/platform/parcels/1');
    expect(res.status).toBe(401);
  });

  it('returns parcel by id for authenticated user', async () => {
    mockPrisma.parcel.findUnique.mockResolvedValue(SAMPLE_PARCEL);
    const app = makeApp('EDITOR');
    const res = await request(app).get('/api/platform/parcels/1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
    expect(res.body.carrier).toBe('UPS');
  });

  it('returns 404 when parcel not found', async () => {
    mockPrisma.parcel.findUnique.mockResolvedValue(null);
    const app = makeApp('EDITOR');
    const res = await request(app).get('/api/platform/parcels/999');
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid id', async () => {
    const app = makeApp('EDITOR');
    const res = await request(app).get('/api/platform/parcels/abc');
    expect(res.status).toBe(400);
  });
});

describe('POST /api/platform/parcels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/platform/parcels')
      .send({ description: 'Box', recipientId: 1, unitNumber: '4B', receivedBy: 'Jane' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for VIEWER role', async () => {
    const app = makeApp('VIEWER');
    const res = await request(app)
      .post('/api/platform/parcels')
      .send({ description: 'Box', recipientId: 1, unitNumber: '4B', receivedBy: 'Jane' });
    expect(res.status).toBe(403);
  });

  it('creates a parcel for EDITOR role', async () => {
    const created = { ...SAMPLE_PARCEL, id: 5 };
    mockPrisma.parcel.create.mockResolvedValue(created);
    const app = makeApp('EDITOR');
    const res = await request(app)
      .post('/api/platform/parcels')
      .send({ description: 'Box', recipientId: 42, unitNumber: '4B', receivedBy: 'Jane' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(5);
  });

  it('creates a parcel for ADMIN role', async () => {
    const created = { ...SAMPLE_PARCEL, id: 6 };
    mockPrisma.parcel.create.mockResolvedValue(created);
    const app = makeApp('ADMIN');
    const res = await request(app)
      .post('/api/platform/parcels')
      .send({ description: 'Envelope', recipientId: 10, unitNumber: '2A', receivedBy: 'Bob' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(6);
  });

  it('returns 400 when required fields missing', async () => {
    const app = makeApp('EDITOR');
    const res = await request(app)
      .post('/api/platform/parcels')
      .send({ description: 'Box' }); // missing recipientId, unitNumber, receivedBy
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/platform/parcels/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    const app = makeApp();
    const res = await request(app)
      .put('/api/platform/parcels/1')
      .send({ status: 'NOTIFIED' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for VIEWER role', async () => {
    const app = makeApp('VIEWER');
    const res = await request(app)
      .put('/api/platform/parcels/1')
      .send({ status: 'NOTIFIED' });
    expect(res.status).toBe(403);
  });

  it('updates parcel status for EDITOR role', async () => {
    const updated = { ...SAMPLE_PARCEL, status: 'NOTIFIED' };
    mockPrisma.parcel.update.mockResolvedValue(updated);
    const app = makeApp('EDITOR');
    const res = await request(app)
      .put('/api/platform/parcels/1')
      .send({ status: 'NOTIFIED' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('NOTIFIED');
  });

  it('returns 400 for invalid id', async () => {
    const app = makeApp('EDITOR');
    const res = await request(app)
      .put('/api/platform/parcels/not-a-number')
      .send({ status: 'NOTIFIED' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/platform/parcels/:id/pickup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    const app = makeApp();
    const res = await request(app).post('/api/platform/parcels/1/pickup');
    expect(res.status).toBe(401);
  });

  it('returns 403 for VIEWER role', async () => {
    const app = makeApp('VIEWER');
    const res = await request(app).post('/api/platform/parcels/1/pickup');
    expect(res.status).toBe(403);
  });

  it('confirms pickup for EDITOR role — sets status PICKED_UP and pickedUpAt', async () => {
    const updated = { ...SAMPLE_PARCEL, status: 'PICKED_UP', pickedUpAt: new Date() };
    mockPrisma.parcel.update.mockResolvedValue(updated);
    const app = makeApp('EDITOR');
    const res = await request(app).post('/api/platform/parcels/1/pickup');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PICKED_UP');
    expect(res.body.pickedUpAt).not.toBeNull();
    // Verify Prisma was called with correct data
    expect(mockPrisma.parcel.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({ status: 'PICKED_UP' }),
      })
    );
  });

  it('returns 400 for invalid id', async () => {
    const app = makeApp('EDITOR');
    const res = await request(app).post('/api/platform/parcels/xyz/pickup');
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/platform/parcels/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    const app = makeApp();
    const res = await request(app).delete('/api/platform/parcels/1');
    expect(res.status).toBe(401);
  });

  it('returns 403 for VIEWER role', async () => {
    const app = makeApp('VIEWER');
    const res = await request(app).delete('/api/platform/parcels/1');
    expect(res.status).toBe(403);
  });

  it('soft-deletes parcel for EDITOR role', async () => {
    mockPrisma.parcel.update.mockResolvedValue({ ...SAMPLE_PARCEL, markedForDeletion: true });
    const app = makeApp('EDITOR');
    const res = await request(app).delete('/api/platform/parcels/1');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockPrisma.parcel.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: { markedForDeletion: true },
      })
    );
  });

  it('returns 400 for invalid id', async () => {
    const app = makeApp('EDITOR');
    const res = await request(app).delete('/api/platform/parcels/bad');
    expect(res.status).toBe(400);
  });
});
