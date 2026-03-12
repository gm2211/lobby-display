/**
 * Unit tests for Payment API routes.
 * Uses vi.mock() to mock Prisma — no real DB needed.
 *
 * RED phase: These tests are written before implementation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import session from 'express-session';

// Mock prisma before importing the route
vi.mock('../../server/db.js', () => ({
  default: {
    payment: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    platformUser: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

import prisma from '../../server/db.js';
import paymentsRouter from '../../server/routes/platform/payments.js';
import { errorHandler } from '../../server/middleware/errorHandler.js';
import { csrfMiddleware } from '../../server/middleware/csrf.js';

const mockPrisma = prisma as typeof prisma & {
  payment: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  platformUser: {
    findUnique: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
  };
};

function createTestApp(role: 'VIEWER' | 'EDITOR' | 'ADMIN' | null = 'ADMIN') {
  const app = express();
  app.use(express.json());
  app.use(session({
    secret: 'test-secret',
    resave: false,
    saveUninitialized: false,
  }));
  // Inject mock session user
  app.use((req, _res, next) => {
    if (role !== null) {
      req.session.user = { id: 1, username: 'testuser', role };
    }
    next();
  });
  // CSRF middleware (bypass in tests by injecting token)
  app.use('/api', csrfMiddleware);
  app.use('/api/payments', paymentsRouter);
  app.use(errorHandler);
  return app;
}

// Shared test app instances
let adminApp: ReturnType<typeof express>;
let editorApp: ReturnType<typeof express>;
let viewerApp: ReturnType<typeof express>;
let unauthApp: ReturnType<typeof express>;

beforeEach(() => {
  vi.clearAllMocks();
  adminApp = createTestApp('ADMIN');
  editorApp = createTestApp('EDITOR');
  viewerApp = createTestApp('VIEWER');
  unauthApp = createTestApp(null);
  // Default: platformUser.findFirst maps session user.id → PlatformUser.id
  // Convention: user id N → platform user id 'platform-user-N'
  mockPrisma.platformUser.findFirst.mockImplementation(async (args: any) => {
    const sessionUserId = args?.where?.userId;
    if (sessionUserId === undefined || sessionUserId === null) return null;
    return { id: `platform-user-${sessionUserId}`, userId: sessionUserId, role: 'RESIDENT' };
  });
});

// Helper to get CSRF token from the test app
async function getAgent(app: ReturnType<typeof express>) {
  const agent = request.agent(app);
  // The csrf middleware uses a session-stored token.
  // We'll add it directly via header for simplicity using a GET first.
  return agent;
}

// For state-changing requests, we need CSRF. We'll bypass by injecting a
// known token. The csrfMiddleware checks req.headers['x-csrf-token'] against
// req.session.csrfToken. We inject it via a setup route.
function createTestAppWithCsrf(role: 'VIEWER' | 'EDITOR' | 'ADMIN' | null = 'ADMIN') {
  const app = express();
  app.use(express.json());
  app.use(session({
    secret: 'test-secret',
    resave: false,
    saveUninitialized: false,
  }));
  // Inject mock session user AND csrf token
  app.use((req, _res, next) => {
    if (role !== null) {
      req.session.user = { id: 1, username: 'testuser', role };
    }
    req.session.csrfToken = 'test-csrf-token';
    next();
  });
  app.use('/api', csrfMiddleware);
  app.use('/api/payments', paymentsRouter);
  app.use(errorHandler);
  return app;
}

const CSRF_HEADER = { 'X-CSRF-Token': 'test-csrf-token' };

describe('GET /api/payments — list payments', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(unauthApp).get('/api/payments');
    expect(res.status).toBe(401);
  });

  it('returns own payments when VIEWER role', async () => {
    const mockPayments = [
      {
        id: 1, userId: 'platform-user-1', amount: '100.00', currency: 'USD',
        status: 'PENDING', description: 'Monthly fee',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        items: [],
      },
    ];
    mockPrisma.payment.findMany.mockResolvedValue(mockPayments);

    const res = await request(viewerApp).get('/api/payments');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // VIEWER only sees their own — filtered by PlatformUser.id (UUID string)
    expect(mockPrisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'platform-user-1' } })
    );
  });

  it('returns all payments when EDITOR role', async () => {
    mockPrisma.payment.findMany.mockResolvedValue([]);

    const res = await request(editorApp).get('/api/payments');
    expect(res.status).toBe(200);
    // EDITOR sees all — no userId filter
    expect(mockPrisma.payment.findMany).toHaveBeenCalledWith(
      expect.not.objectContaining({ where: { userId: 1 } })
    );
  });

  it('returns all payments when ADMIN role', async () => {
    mockPrisma.payment.findMany.mockResolvedValue([]);
    const res = await request(adminApp).get('/api/payments');
    expect(res.status).toBe(200);
  });
});

describe('GET /api/payments/summary — payment summary', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(unauthApp).get('/api/payments/summary');
    expect(res.status).toBe(401);
  });

  it('returns 403 for VIEWER role', async () => {
    const res = await request(viewerApp).get('/api/payments/summary');
    expect(res.status).toBe(403);
  });

  it('returns summary for EDITOR role', async () => {
    mockPrisma.payment.findMany.mockResolvedValue([
      { id: 1, amount: '100.00', status: 'PAID', currency: 'USD' },
      { id: 2, amount: '50.00', status: 'PENDING', currency: 'USD' },
    ]);

    const res = await request(editorApp).get('/api/payments/summary');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('paid');
    expect(res.body).toHaveProperty('pending');
    expect(res.body).toHaveProperty('count');
  });

  it('returns summary for ADMIN role', async () => {
    mockPrisma.payment.findMany.mockResolvedValue([]);

    const res = await request(adminApp).get('/api/payments/summary');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('paid');
    expect(res.body).toHaveProperty('pending');
    expect(res.body).toHaveProperty('count');
    expect(res.body.total).toBe(0);
    expect(res.body.count).toBe(0);
  });
});

describe('GET /api/payments/:id — payment detail', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(unauthApp).get('/api/payments/1');
    expect(res.status).toBe(401);
  });

  it('returns 404 for unknown id (Payment IDs are UUIDs, no integer validation)', async () => {
    mockPrisma.payment.findUnique.mockResolvedValue(null);
    const res = await request(adminApp).get('/api/payments/abc');
    expect(res.status).toBe(404);
  });

  it('returns 404 when payment not found', async () => {
    mockPrisma.payment.findUnique.mockResolvedValue(null);
    const res = await request(adminApp).get('/api/payments/999');
    expect(res.status).toBe(404);
  });

  it('returns payment with items for ADMIN', async () => {
    const mockPayment = {
      id: 1, userId: 1, amount: '100.00', currency: 'USD',
      status: 'PENDING', description: 'Monthly fee',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      items: [
        { id: 1, paymentId: 1, description: 'Base fee', amount: '100.00', category: 'maintenance' },
      ],
    };
    mockPrisma.payment.findUnique.mockResolvedValue(mockPayment);

    const res = await request(adminApp).get('/api/payments/1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(mockPrisma.payment.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ include: { items: true } })
    );
  });

  it('returns 403 when VIEWER tries to access another user payment', async () => {
    const mockPayment = {
      id: 2, userId: 'platform-user-99', amount: '100.00', currency: 'USD',
      status: 'PENDING', description: 'Other user payment',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      items: [],
    };
    mockPrisma.payment.findUnique.mockResolvedValue(mockPayment);

    const res = await request(viewerApp).get('/api/payments/2');
    expect(res.status).toBe(403);
  });

  it('returns own payment for VIEWER', async () => {
    const mockPayment = {
      id: 1, userId: 'platform-user-1', amount: '100.00', currency: 'USD',
      status: 'PENDING', description: 'Own payment',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      items: [],
    };
    mockPrisma.payment.findUnique.mockResolvedValue(mockPayment);

    const res = await request(viewerApp).get('/api/payments/1');
    expect(res.status).toBe(200);
  });
});

describe('POST /api/payments — create payment', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = createTestAppWithCsrf(null);
    const res = await request(app)
      .post('/api/payments')
      .set(CSRF_HEADER)
      .send({ userId: 1, amount: 100, description: 'Fee' });
    expect(res.status).toBe(401);
  });

  it('returns 403 when VIEWER tries to create', async () => {
    const app = createTestAppWithCsrf('VIEWER');
    const res = await request(app)
      .post('/api/payments')
      .set(CSRF_HEADER)
      .send({ userId: 1, amount: 100, description: 'Fee' });
    expect(res.status).toBe(403);
  });

  it('returns 400 when required fields are missing', async () => {
    const app = createTestAppWithCsrf('EDITOR');
    const res = await request(app)
      .post('/api/payments')
      .set(CSRF_HEADER)
      .send({ userId: 1 }); // missing amount and description
    expect(res.status).toBe(400);
  });

  it('creates payment for EDITOR role', async () => {
    const mockCreated = {
      id: 1, userId: 1, amount: '100.00', currency: 'USD',
      status: 'PENDING', description: 'Monthly maintenance fee',
      paymentMethod: null, externalId: null, dueDate: null, paidAt: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      items: [],
    };
    mockPrisma.platformUser.findUnique.mockResolvedValue({ id: 1, name: 'Tenant A' });
    mockPrisma.payment.create.mockResolvedValue(mockCreated);

    const app = createTestAppWithCsrf('EDITOR');
    const res = await request(app)
      .post('/api/payments')
      .set(CSRF_HEADER)
      .send({ userId: 1, amount: 100, description: 'Monthly maintenance fee' });

    expect(res.status).toBe(201);
    expect(res.body.description).toBe('Monthly maintenance fee');
  });

  it('creates payment with items for ADMIN role', async () => {
    const mockCreated = {
      id: 2, userId: 1, amount: '150.00', currency: 'USD',
      status: 'PENDING', description: 'Combined fee',
      paymentMethod: null, externalId: null, dueDate: null, paidAt: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      items: [
        { id: 1, paymentId: 2, description: 'Maintenance', amount: '100.00', category: 'maintenance' },
        { id: 2, paymentId: 2, description: 'Utilities', amount: '50.00', category: 'utilities' },
      ],
    };
    mockPrisma.platformUser.findUnique.mockResolvedValue({ id: 1, name: 'Tenant A' });
    mockPrisma.payment.create.mockResolvedValue(mockCreated);

    const app = createTestAppWithCsrf('ADMIN');
    const res = await request(app)
      .post('/api/payments')
      .set(CSRF_HEADER)
      .send({
        userId: 1,
        amount: 150,
        description: 'Combined fee',
        items: [
          { description: 'Maintenance', amount: 100, category: 'maintenance' },
          { description: 'Utilities', amount: 50, category: 'utilities' },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.items).toHaveLength(2);
  });

  it('returns 404 when user not found', async () => {
    mockPrisma.platformUser.findUnique.mockResolvedValue(null);

    const app = createTestAppWithCsrf('EDITOR');
    const res = await request(app)
      .post('/api/payments')
      .set(CSRF_HEADER)
      .send({ userId: 999, amount: 100, description: 'Fee' });

    expect(res.status).toBe(404);
  });
});

describe('PUT /api/payments/:id — update payment status', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = createTestAppWithCsrf(null);
    const res = await request(app)
      .put('/api/payments/1')
      .set(CSRF_HEADER)
      .send({ status: 'PAID' });
    expect(res.status).toBe(401);
  });

  it('returns 403 when VIEWER tries to update', async () => {
    const app = createTestAppWithCsrf('VIEWER');
    const res = await request(app)
      .put('/api/payments/1')
      .set(CSRF_HEADER)
      .send({ status: 'PAID' });
    expect(res.status).toBe(403);
  });

  it('returns 404 for unknown id (Payment IDs are UUIDs, no integer validation)', async () => {
    mockPrisma.payment.findUnique.mockResolvedValue(null);
    const app = createTestAppWithCsrf('EDITOR');
    const res = await request(app)
      .put('/api/payments/abc')
      .set(CSRF_HEADER)
      .send({ status: 'PAID' });
    expect(res.status).toBe(404);
  });

  it('returns 404 when payment not found', async () => {
    mockPrisma.payment.findUnique.mockResolvedValue(null);

    const app = createTestAppWithCsrf('EDITOR');
    const res = await request(app)
      .put('/api/payments/999')
      .set(CSRF_HEADER)
      .send({ status: 'PAID' });
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid status', async () => {
    mockPrisma.payment.findUnique.mockResolvedValue({
      id: 1, userId: 1, status: 'PENDING', amount: '100.00', description: 'Fee',
    });

    const app = createTestAppWithCsrf('EDITOR');
    const res = await request(app)
      .put('/api/payments/1')
      .set(CSRF_HEADER)
      .send({ status: 'INVALID_STATUS' });
    expect(res.status).toBe(400);
  });

  it('updates payment status for EDITOR', async () => {
    const existing = {
      id: 1, userId: 1, status: 'PENDING', amount: '100.00',
      description: 'Fee', currency: 'USD', createdAt: new Date(), updatedAt: new Date(),
    };
    const updated = { ...existing, status: 'PAID', paidAt: new Date() };
    mockPrisma.payment.findUnique.mockResolvedValue(existing);
    mockPrisma.payment.update.mockResolvedValue(updated);

    const app = createTestAppWithCsrf('EDITOR');
    const res = await request(app)
      .put('/api/payments/1')
      .set(CSRF_HEADER)
      .send({ status: 'PAID' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PAID');
  });
});

describe('POST /api/payments/webhook — Stripe webhook stub', () => {
  it('returns 200 with no auth required', async () => {
    // Webhook has no auth
    const res = await request(unauthApp)
      .post('/api/payments/webhook')
      .send({ type: 'payment_intent.succeeded', data: {} });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('received', true);
  });

  it('returns 200 even with valid auth (using CSRF token)', async () => {
    // Webhook accepts both authenticated and unauthenticated requests
    // When called with auth + CSRF, it still returns 200
    const app = createTestAppWithCsrf('ADMIN');
    const res = await request(app)
      .post('/api/payments/webhook')
      .set(CSRF_HEADER)
      .send({ type: 'payment_intent.succeeded', data: {} });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('received', true);
  });
});
