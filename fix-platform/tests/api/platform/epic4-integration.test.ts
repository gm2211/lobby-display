/**
 * Epic 4 Integration Tests — Payments, Violations, Consent
 *
 * Integration tests for platform API routes. Uses the real Express app with a
 * real test database. Auth agents are created via helpers.ts.
 *
 * NOTE: setup.ts runs a `beforeEach` that clears ALL database tables (including
 * sessions). Therefore each `it()` block must create its own agents and seed data,
 * OR each `describe` block uses `beforeEach` (not `beforeAll`) to recreate agents
 * before each test.
 *
 * PAYMENTS  — /api/platform/payments
 *   GET /         list (VIEWER sees own, EDITOR+ sees all)
 *   GET /summary  aggregation (EDITOR+ only)
 *   GET /:id      detail with items
 *   POST /        create (EDITOR+)
 *   PUT /:id      update status (EDITOR+)
 *
 * VIOLATIONS — /api/platform/violations
 *   GET /         list (VIEWER sees own, EDITOR+ sees all), filter by status
 *   GET /:id      detail with comments
 *   POST /        report violation (EDITOR+)
 *   PUT /:id      update / status workflow (EDITOR+)
 *   POST /:id/appeal   appeal (reporter only, CONFIRMED only)
 *   POST /:id/comments add comment (any auth user)
 *
 * CONSENT — /api/platform/consent
 *   GET /                  list forms (any auth), ?active filter, signature count
 *   GET /my-signatures     user's own signatures
 *   GET /:id               form detail with signatures
 *   POST /                 create form (EDITOR+)
 *   PUT /:id               update form (EDITOR+)
 *   DELETE /:id            delete with cascade (EDITOR+)
 *   POST /:id/sign         sign form (any auth), reject duplicate
 *   GET  /:id/signatures   list signatures (EDITOR+)
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import type { TestAgent } from 'supertest';
import app from '../../../server/app.js';
import { testPrisma } from '../../setup.js';
import {
  authenticatedPlatformAgent,
  createPlatformUserFixture,
} from './helpers.js';

// ─── Helper: build an authenticated agent for a specific fixture user ─────────
// Used for tests that need an agent logged in as a specific user (e.g. reporter).
async function agentForFixture(fixture: Awaited<ReturnType<typeof createPlatformUserFixture>>): Promise<TestAgent> {
  const agent = request.agent(app);
  await agent
    .post('/api/auth/login')
    .send({ username: fixture.username, password: fixture.password })
    .expect(200);
  const csrfRes = await agent.get('/api/auth/csrf').expect(200);
  const csrfToken = csrfRes.body?.token;
  const agentAny = agent as any;
  for (const method of ['post', 'put', 'delete', 'patch']) {
    const orig = agentAny[method].bind(agentAny);
    agentAny[method] = (...args: unknown[]) =>
      (orig(...args) as any).set('X-CSRF-Token', csrfToken);
  }
  return agent;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAYMENTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Payments API — GET /api/platform/payments', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/platform/payments');
    expect(res.status).toBe(401);
  });

  it('VIEWER-role dashboard user can GET (reads allowed)', async () => {
    const viewerAgent = await authenticatedPlatformAgent('RESIDENT', 'VIEWER');
    const res = await viewerAgent.get('/api/platform/payments');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('EDITOR+ can list all payments', async () => {
    // Seed a payment
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    await testPrisma.payment.create({
      data: {
        userId: fixture.platformUserId,
        amount: 500,
        currency: 'USD',
        description: 'Monthly maintenance fee',
        status: 'PENDING',
      },
    });
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent.get('/api/platform/payments');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it('payments include items array', async () => {
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    await testPrisma.payment.create({
      data: {
        userId: fixture.platformUserId,
        amount: 100,
        description: 'Test',
        status: 'PENDING',
      },
    });
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent.get('/api/platform/payments');
    expect(res.status).toBe(200);
    for (const p of res.body) {
      expect(Array.isArray(p.items)).toBe(true);
    }
  });
});

describe('Payments API — GET /api/platform/payments/summary', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/platform/payments/summary');
    expect(res.status).toBe(401);
  });

  it('returns 403 for VIEWER dashboard role', async () => {
    const viewerAgent = await authenticatedPlatformAgent('RESIDENT', 'VIEWER');
    const res = await viewerAgent.get('/api/platform/payments/summary');
    expect(res.status).toBe(403);
  });

  it('returns summary object for EDITOR+ with correct shape', async () => {
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    await testPrisma.payment.createMany({
      data: [
        { userId: fixture.platformUserId, amount: 200, description: 'Rent', status: 'PAID' },
        { userId: fixture.platformUserId, amount: 50, description: 'Utilities', status: 'PENDING' },
      ],
    });
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent.get('/api/platform/payments/summary');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('paid');
    expect(res.body).toHaveProperty('pending');
    expect(res.body).toHaveProperty('failed');
    expect(res.body).toHaveProperty('refunded');
    expect(res.body).toHaveProperty('count');
    expect(typeof res.body.total).toBe('number');
    expect(typeof res.body.count).toBe('number');
  });

  it('aggregates amounts correctly', async () => {
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    await testPrisma.payment.createMany({
      data: [
        { userId: fixture.platformUserId, amount: 200, description: 'Rent', status: 'PAID' },
        { userId: fixture.platformUserId, amount: 50, description: 'Utilities', status: 'PENDING' },
        { userId: fixture.platformUserId, amount: 30, description: 'Late fee', status: 'FAILED' },
      ],
    });
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent.get('/api/platform/payments/summary');
    expect(res.status).toBe(200);
    expect(res.body.paid).toBe(200);
    expect(res.body.pending).toBe(50);
    expect(res.body.failed).toBe(30);
    expect(res.body.count).toBe(3);
  });
});

describe('Payments API — GET /api/platform/payments/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const payment = await testPrisma.payment.create({
      data: { userId: fixture.platformUserId, amount: 100, description: 'Test', status: 'PENDING' },
    });
    const res = await request(app).get(`/api/platform/payments/${payment.id}`);
    expect(res.status).toBe(401);
  });

  it('returns 404 for nonexistent id', async () => {
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent.get('/api/platform/payments/nonexistent-uuid');
    expect(res.status).toBe(404);
  });

  it('returns payment with items for EDITOR', async () => {
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const payment = await testPrisma.payment.create({
      data: {
        userId: fixture.platformUserId,
        amount: 150,
        description: 'Parking fee',
        status: 'PENDING',
        items: {
          create: [
            { description: 'Monthly parking', amount: 150, category: 'parking' },
          ],
        },
      },
    });
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent.get(`/api/platform/payments/${payment.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(payment.id);
    expect(res.body.description).toBe('Parking fee');
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBe(1);
    expect(res.body.items[0].description).toBe('Monthly parking');
  });
});

describe('Payments API — POST /api/platform/payments (create)', () => {
  it('returns 401 when unauthenticated', async () => {
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const res = await request(app)
      .post('/api/platform/payments')
      .send({ userId: fixture.platformUserId, amount: 100, description: 'Fee' });
    expect(res.status).toBe(401);
  });

  it('returns 403 when VIEWER dashboard role tries to create', async () => {
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const viewerAgent = await authenticatedPlatformAgent('RESIDENT', 'VIEWER');
    const res = await viewerAgent
      .post('/api/platform/payments')
      .send({ userId: fixture.platformUserId, amount: 100, description: 'Fee' });
    expect(res.status).toBe(403);
  });

  it('returns 400 when required fields are missing', async () => {
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent
      .post('/api/platform/payments')
      .send({ userId: fixture.platformUserId }); // missing amount and description
    expect(res.status).toBe(400);
  });

  it('returns 404 when userId references a nonexistent platform user', async () => {
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent
      .post('/api/platform/payments')
      .send({ userId: 'nonexistent-uuid', amount: 100, description: 'Fee' });
    expect(res.status).toBe(404);
  });

  it('creates payment for EDITOR+ and returns 201', async () => {
    const targetFixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent
      .post('/api/platform/payments')
      .send({
        userId: targetFixture.platformUserId,
        amount: 250,
        description: 'Monthly maintenance',
        currency: 'USD',
      });
    expect(res.status).toBe(201);
    expect(res.body.description).toBe('Monthly maintenance');
    expect(res.body.status).toBe('PENDING');
    expect(typeof res.body.id).toBe('string');
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('creates payment with line items', async () => {
    const targetFixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent
      .post('/api/platform/payments')
      .send({
        userId: targetFixture.platformUserId,
        amount: 300,
        description: 'Combined charges',
        items: [
          { description: 'Base fee', amount: 200, category: 'maintenance' },
          { description: 'Utilities', amount: 100, category: 'utilities' },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0].description).toBe('Base fee');
    expect(res.body.items[1].description).toBe('Utilities');
  });

  it('persists the payment to the database', async () => {
    const targetFixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent
      .post('/api/platform/payments')
      .send({
        userId: targetFixture.platformUserId,
        amount: 75,
        description: 'Water bill',
      });
    expect(res.status).toBe(201);

    const db = await testPrisma.payment.findUnique({ where: { id: res.body.id } });
    expect(db).not.toBeNull();
    expect(db!.description).toBe('Water bill');
  });
});

describe('Payments API — PUT /api/platform/payments/:id (update status)', () => {
  it('returns 401 when unauthenticated', async () => {
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const payment = await testPrisma.payment.create({
      data: { userId: fixture.platformUserId, amount: 500, description: 'Rent', status: 'PENDING' },
    });
    const res = await request(app)
      .put(`/api/platform/payments/${payment.id}`)
      .send({ status: 'PAID' });
    expect(res.status).toBe(401);
  });

  it('returns 403 when VIEWER tries to update', async () => {
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const payment = await testPrisma.payment.create({
      data: { userId: fixture.platformUserId, amount: 500, description: 'Rent', status: 'PENDING' },
    });
    const viewerAgent = await authenticatedPlatformAgent('RESIDENT', 'VIEWER');
    const res = await viewerAgent
      .put(`/api/platform/payments/${payment.id}`)
      .send({ status: 'PAID' });
    expect(res.status).toBe(403);
  });

  it('returns 404 for nonexistent payment id', async () => {
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent
      .put('/api/platform/payments/nonexistent-uuid')
      .send({ status: 'PAID' });
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid status value', async () => {
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const payment = await testPrisma.payment.create({
      data: { userId: fixture.platformUserId, amount: 500, description: 'Rent', status: 'PENDING' },
    });
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent
      .put(`/api/platform/payments/${payment.id}`)
      .send({ status: 'INVALID_STATUS' });
    expect(res.status).toBe(400);
  });

  it('updates payment status to PAID', async () => {
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const payment = await testPrisma.payment.create({
      data: { userId: fixture.platformUserId, amount: 500, description: 'Rent', status: 'PENDING' },
    });
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent
      .put(`/api/platform/payments/${payment.id}`)
      .send({ status: 'PAID' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PAID');
  });

  it('auto-sets paidAt when marking as PAID', async () => {
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const payment = await testPrisma.payment.create({
      data: { userId: fixture.platformUserId, amount: 100, description: 'Late fee', status: 'PENDING' },
    });
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent
      .put(`/api/platform/payments/${payment.id}`)
      .send({ status: 'PAID' });
    expect(res.status).toBe(200);
    expect(res.body.paidAt).not.toBeNull();
  });

  it('updates payment to REFUNDED status', async () => {
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const payment = await testPrisma.payment.create({
      data: {
        userId: fixture.platformUserId,
        amount: 200,
        description: 'Overpayment',
        status: 'PAID',
        paidAt: new Date(),
      },
    });
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent
      .put(`/api/platform/payments/${payment.id}`)
      .send({ status: 'REFUNDED' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('REFUNDED');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// VIOLATIONS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Violations API — GET /api/platform/violations', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/platform/violations');
    expect(res.status).toBe(401);
  });

  it('VIEWER can access the violations list endpoint (200 OK)', async () => {
    const viewerAgent = await authenticatedPlatformAgent('RESIDENT', 'VIEWER');
    const res = await viewerAgent.get('/api/platform/violations');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('EDITOR+ can list all violations', async () => {
    const r1 = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const r2 = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    await testPrisma.violation.createMany({
      data: [
        {
          reportedBy: r1.platformUserId,
          unitNumber: '10A',
          category: 'NOISE',
          description: 'Loud music',
          severity: 'MEDIUM',
          status: 'REPORTED',
        },
        {
          reportedBy: r2.platformUserId,
          unitNumber: '10B',
          category: 'PETS',
          description: 'Unauthorized dog',
          severity: 'LOW',
          status: 'CONFIRMED',
        },
      ],
    });
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent.get('/api/platform/violations');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
  });

  it('filters violations by status query param', async () => {
    const r = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    await testPrisma.violation.createMany({
      data: [
        {
          reportedBy: r.platformUserId,
          unitNumber: '1A',
          category: 'NOISE',
          description: 'Reported violation',
          severity: 'LOW',
          status: 'REPORTED',
        },
        {
          reportedBy: r.platformUserId,
          unitNumber: '1B',
          category: 'NOISE',
          description: 'Confirmed violation',
          severity: 'HIGH',
          status: 'CONFIRMED',
        },
      ],
    });
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent.get('/api/platform/violations?status=CONFIRMED');
    expect(res.status).toBe(200);
    for (const v of res.body) {
      expect(v.status).toBe('CONFIRMED');
    }
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it('returns empty array for a status with no violations', async () => {
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent.get('/api/platform/violations?status=DISMISSED');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('Violations API — GET /api/platform/violations/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const v = await testPrisma.violation.create({
      data: {
        reportedBy: fixture.platformUserId,
        unitNumber: '5C',
        category: 'NOISE',
        description: 'Late-night party',
        severity: 'HIGH',
        status: 'REPORTED',
      },
    });
    const res = await request(app).get(`/api/platform/violations/${v.id}`);
    expect(res.status).toBe(401);
  });

  it('returns 404 for nonexistent id', async () => {
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent.get('/api/platform/violations/nonexistent-uuid');
    expect(res.status).toBe(404);
  });

  it('returns violation detail with comments', async () => {
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const v = await testPrisma.violation.create({
      data: {
        reportedBy: fixture.platformUserId,
        unitNumber: '5C',
        category: 'NOISE',
        description: 'Late-night party',
        severity: 'HIGH',
        status: 'REPORTED',
      },
    });
    await testPrisma.violationComment.create({
      data: {
        violationId: v.id,
        authorId: fixture.platformUserId,
        body: 'Under investigation',
        isInternal: false,
      },
    });

    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent.get(`/api/platform/violations/${v.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(v.id);
    expect(res.body.description).toBe('Late-night party');
    expect(Array.isArray(res.body.comments)).toBe(true);
    expect(res.body.comments.length).toBe(1);
    expect(res.body.comments[0].body).toBe('Under investigation');
  });
});

describe('Violations API — POST /api/platform/violations (report violation)', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app)
      .post('/api/platform/violations')
      .send({ unitNumber: '4B', category: 'NOISE', description: 'Test', severity: 'MEDIUM' });
    expect(res.status).toBe(401);
  });

  it('returns 403 when VIEWER tries to create', async () => {
    const viewerAgent = await authenticatedPlatformAgent('RESIDENT', 'VIEWER');
    const res = await viewerAgent
      .post('/api/platform/violations')
      .send({ unitNumber: '4B', category: 'NOISE', description: 'Test', severity: 'MEDIUM' });
    expect(res.status).toBe(403);
  });

  it('returns 400 when unitNumber is missing', async () => {
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent
      .post('/api/platform/violations')
      .send({ category: 'NOISE', description: 'Test', severity: 'MEDIUM' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when category is missing', async () => {
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent
      .post('/api/platform/violations')
      .send({ unitNumber: '4B', description: 'Test', severity: 'MEDIUM' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when severity is missing', async () => {
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent
      .post('/api/platform/violations')
      .send({ unitNumber: '4B', category: 'NOISE', description: 'Test' });
    expect(res.status).toBe(400);
  });

  it('creates violation with REPORTED status for EDITOR+', async () => {
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent
      .post('/api/platform/violations')
      .send({
        unitNumber: '7D',
        category: 'NOISE',
        description: 'Dog barking at night',
        severity: 'MEDIUM',
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('REPORTED');
    expect(res.body.unitNumber).toBe('7D');
    expect(typeof res.body.id).toBe('string');
  });

  it('accepts severity level LOW', async () => {
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent
      .post('/api/platform/violations')
      .send({ unitNumber: '3A', category: 'PARKING', description: 'Low test', severity: 'LOW' });
    expect(res.status).toBe(201);
    expect(res.body.severity).toBe('LOW');
  });

  it('accepts severity level HIGH', async () => {
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent
      .post('/api/platform/violations')
      .send({ unitNumber: '3B', category: 'NOISE', description: 'High test', severity: 'HIGH' });
    expect(res.status).toBe(201);
    expect(res.body.severity).toBe('HIGH');
  });

  it('persists the violation to the database', async () => {
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent
      .post('/api/platform/violations')
      .send({
        unitNumber: '9F',
        category: 'NOISE',
        description: 'Smoke in hallway',
        severity: 'HIGH',
      });
    expect(res.status).toBe(201);

    const db = await testPrisma.violation.findUnique({ where: { id: res.body.id } });
    expect(db).not.toBeNull();
    expect(db!.description).toBe('Smoke in hallway');
    expect(db!.status).toBe('REPORTED');
  });
});

describe('Violations API — PUT /api/platform/violations/:id (status workflow)', () => {
  async function createViolationForStatus(
    reporterPlatformUserId: string,
    status: string,
  ): Promise<string> {
    const v = await testPrisma.violation.create({
      data: {
        reportedBy: reporterPlatformUserId,
        unitNumber: '2B',
        category: 'NOISE',
        description: 'Test violation',
        severity: 'MEDIUM',
        status: status as never,
      },
    });
    return v.id;
  }

  it('returns 401 when unauthenticated', async () => {
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const id = await createViolationForStatus(fixture.platformUserId, 'REPORTED');
    const res = await request(app)
      .put(`/api/platform/violations/${id}`)
      .send({ status: 'UNDER_REVIEW' });
    expect(res.status).toBe(401);
  });

  it('returns 403 when VIEWER tries to update', async () => {
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const id = await createViolationForStatus(fixture.platformUserId, 'REPORTED');
    const viewerAgent = await authenticatedPlatformAgent('RESIDENT', 'VIEWER');
    const res = await viewerAgent
      .put(`/api/platform/violations/${id}`)
      .send({ status: 'UNDER_REVIEW' });
    expect(res.status).toBe(403);
  });

  it('returns 404 for nonexistent violation', async () => {
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent
      .put('/api/platform/violations/nonexistent-uuid')
      .send({ status: 'UNDER_REVIEW' });
    expect(res.status).toBe(404);
  });

  it('valid transition: REPORTED → UNDER_REVIEW', async () => {
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const id = await createViolationForStatus(fixture.platformUserId, 'REPORTED');
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent
      .put(`/api/platform/violations/${id}`)
      .send({ status: 'UNDER_REVIEW' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('UNDER_REVIEW');
  });

  it('valid transition: UNDER_REVIEW → CONFIRMED', async () => {
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const id = await createViolationForStatus(fixture.platformUserId, 'UNDER_REVIEW');
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent
      .put(`/api/platform/violations/${id}`)
      .send({ status: 'CONFIRMED' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CONFIRMED');
  });

  it('valid transition: CONFIRMED → RESOLVED', async () => {
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const id = await createViolationForStatus(fixture.platformUserId, 'CONFIRMED');
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent
      .put(`/api/platform/violations/${id}`)
      .send({ status: 'RESOLVED' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('RESOLVED');
  });

  it('valid transition: CONFIRMED → DISMISSED', async () => {
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const id = await createViolationForStatus(fixture.platformUserId, 'CONFIRMED');
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent
      .put(`/api/platform/violations/${id}`)
      .send({ status: 'DISMISSED' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('DISMISSED');
  });

  it('valid back-transition: APPEALED → UNDER_REVIEW', async () => {
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const id = await createViolationForStatus(fixture.platformUserId, 'APPEALED');
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent
      .put(`/api/platform/violations/${id}`)
      .send({ status: 'UNDER_REVIEW' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('UNDER_REVIEW');
  });

  it('invalid transition: REPORTED → CONFIRMED returns 400', async () => {
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const id = await createViolationForStatus(fixture.platformUserId, 'REPORTED');
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent
      .put(`/api/platform/violations/${id}`)
      .send({ status: 'CONFIRMED' });
    expect(res.status).toBe(400);
  });

  it('invalid transition: RESOLVED → REPORTED returns 400', async () => {
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const id = await createViolationForStatus(fixture.platformUserId, 'RESOLVED');
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent
      .put(`/api/platform/violations/${id}`)
      .send({ status: 'REPORTED' });
    expect(res.status).toBe(400);
  });

  it('invalid transition: DISMISSED → UNDER_REVIEW returns 400', async () => {
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const id = await createViolationForStatus(fixture.platformUserId, 'DISMISSED');
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent
      .put(`/api/platform/violations/${id}`)
      .send({ status: 'UNDER_REVIEW' });
    expect(res.status).toBe(400);
  });

  it('allows updating assignedTo without status change', async () => {
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const id = await createViolationForStatus(fixture.platformUserId, 'REPORTED');
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent
      .put(`/api/platform/violations/${id}`)
      .send({ assignedTo: 'staff-member-id' });
    expect(res.status).toBe(200);
    expect(res.body.assignedTo).toBe('staff-member-id');
  });
});

describe('Violations API — POST /api/platform/violations/:id/appeal', () => {
  it('returns 401 when unauthenticated', async () => {
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const v = await testPrisma.violation.create({
      data: {
        reportedBy: fixture.platformUserId,
        unitNumber: '3B',
        category: 'NOISE',
        description: 'Confirmed violation',
        severity: 'HIGH',
        status: 'CONFIRMED',
      },
    });
    const res = await request(app).post(`/api/platform/violations/${v.id}/appeal`);
    expect(res.status).toBe(401);
  });

  it('returns 404 when violation not found', async () => {
    // Appeal route requires authenticated user; platformProtect blocks VIEWER from POST,
    // so use EDITOR dashboard role to reach the route and get the correct 404.
    const reporterAgent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const res = await reporterAgent.post('/api/platform/violations/nonexistent/appeal');
    expect(res.status).toBe(404);
  });

  it('returns 403 when non-reporter tries to appeal', async () => {
    const reporterFixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const v = await testPrisma.violation.create({
      data: {
        reportedBy: reporterFixture.platformUserId,
        unitNumber: '3B',
        category: 'NOISE',
        description: 'Noise complaint',
        severity: 'HIGH',
        status: 'CONFIRMED',
      },
    });
    // A different user tries to appeal (also EDITOR so they get past platformProtect)
    const otherAgent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const res = await otherAgent.post(`/api/platform/violations/${v.id}/appeal`);
    expect(res.status).toBe(403);
  });

  it('returns 400 when violation is not in CONFIRMED status', async () => {
    // Use EDITOR dashboard role so the POST reaches the route handler
    const reporterFixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const v = await testPrisma.violation.create({
      data: {
        reportedBy: reporterFixture.platformUserId,
        unitNumber: '3B',
        category: 'NOISE',
        description: 'Not confirmed yet',
        severity: 'MEDIUM',
        status: 'REPORTED',
      },
    });
    const reporterAgent = await agentForFixture(reporterFixture);
    const res = await reporterAgent.post(`/api/platform/violations/${v.id}/appeal`);
    expect(res.status).toBe(400);
  });

  it('reporter can appeal a CONFIRMED violation, sets status to APPEALED', async () => {
    // Use EDITOR dashboard role so the POST reaches the route handler
    const reporterFixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const v = await testPrisma.violation.create({
      data: {
        reportedBy: reporterFixture.platformUserId,
        unitNumber: '3B',
        category: 'NOISE',
        description: 'Noise complaint',
        severity: 'HIGH',
        status: 'CONFIRMED',
      },
    });
    const reporterAgent = await agentForFixture(reporterFixture);
    const res = await reporterAgent.post(`/api/platform/violations/${v.id}/appeal`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('APPEALED');

    const db = await testPrisma.violation.findUnique({ where: { id: v.id } });
    expect(db!.status).toBe('APPEALED');
  });
});

describe('Violations API — POST /api/platform/violations/:id/comments', () => {
  it('returns 401 when unauthenticated', async () => {
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const v = await testPrisma.violation.create({
      data: {
        reportedBy: fixture.platformUserId,
        unitNumber: '6A',
        category: 'PETS',
        description: 'Cat without registration',
        severity: 'LOW',
        status: 'REPORTED',
      },
    });
    const res = await request(app)
      .post(`/api/platform/violations/${v.id}/comments`)
      .send({ body: 'Test comment' });
    expect(res.status).toBe(401);
  });

  it('returns 404 when violation not found', async () => {
    // POST comments requires EDITOR+ dashboard role (platformProtect blocks VIEWER from POST)
    const editorAgent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const res = await editorAgent
      .post('/api/platform/violations/nonexistent/comments')
      .send({ body: 'Test comment' });
    expect(res.status).toBe(404);
  });

  it('returns 400 when body is missing', async () => {
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const v = await testPrisma.violation.create({
      data: {
        reportedBy: fixture.platformUserId,
        unitNumber: '6A',
        category: 'PETS',
        description: 'Cat without registration',
        severity: 'LOW',
        status: 'REPORTED',
      },
    });
    // POST requires EDITOR+ (platformProtect blocks VIEWER from POST)
    const editorAgent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const res = await editorAgent
      .post(`/api/platform/violations/${v.id}/comments`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('any EDITOR+ user can add a comment', async () => {
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const v = await testPrisma.violation.create({
      data: {
        reportedBy: fixture.platformUserId,
        unitNumber: '6A',
        category: 'PETS',
        description: 'Cat without registration',
        severity: 'LOW',
        status: 'REPORTED',
      },
    });
    // POST requires EDITOR+ (platformProtect blocks VIEWER from POST)
    const editorAgent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const res = await editorAgent
      .post(`/api/platform/violations/${v.id}/comments`)
      .send({ body: 'Please investigate soon' });
    expect(res.status).toBe(201);
    expect(res.body.body).toBe('Please investigate soon');
    expect(typeof res.body.id).toBe('string');
  });

  it('EDITOR can add an internal comment (isInternal: true)', async () => {
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const v = await testPrisma.violation.create({
      data: {
        reportedBy: fixture.platformUserId,
        unitNumber: '6B',
        category: 'NOISE',
        description: 'Internal test',
        severity: 'MEDIUM',
        status: 'REPORTED',
      },
    });
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent
      .post(`/api/platform/violations/${v.id}/comments`)
      .send({ body: 'Staff note: forwarded to security', isInternal: true });
    expect(res.status).toBe(201);
    expect(res.body.isInternal).toBe(true);
  });

  it('comment is persisted to the database', async () => {
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const v = await testPrisma.violation.create({
      data: {
        reportedBy: fixture.platformUserId,
        unitNumber: '6C',
        category: 'PETS',
        description: 'Persistence test',
        severity: 'LOW',
        status: 'REPORTED',
      },
    });
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent
      .post(`/api/platform/violations/${v.id}/comments`)
      .send({ body: 'Documented and logged' });
    expect(res.status).toBe(201);

    const db = await testPrisma.violationComment.findUnique({ where: { id: res.body.id } });
    expect(db).not.toBeNull();
    expect(db!.body).toBe('Documented and logged');
    expect(db!.violationId).toBe(v.id);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONSENT
// ═══════════════════════════════════════════════════════════════════════════════

describe('Consent API — GET /api/platform/consent (list forms)', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/platform/consent');
    expect(res.status).toBe(401);
  });

  it('returns all forms for any authenticated user', async () => {
    const creator = await createPlatformUserFixture('MANAGER', 'EDITOR');
    await testPrisma.consentForm.createMany({
      data: [
        {
          title: 'Resident Agreement v1',
          body: 'I agree to the terms...',
          version: 1,
          requiredForRoles: [],
          active: true,
          createdBy: creator.platformUserId,
        },
        {
          title: 'Pet Policy',
          body: 'Pet rules...',
          version: 1,
          requiredForRoles: [],
          active: false,
          createdBy: creator.platformUserId,
        },
      ],
    });
    const viewerAgent = await authenticatedPlatformAgent('RESIDENT', 'VIEWER');
    const res = await viewerAgent.get('/api/platform/consent');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
  });

  it('filters by active=true', async () => {
    const creator = await createPlatformUserFixture('MANAGER', 'EDITOR');
    await testPrisma.consentForm.createMany({
      data: [
        {
          title: 'Active Form',
          body: 'Active body',
          version: 1,
          requiredForRoles: [],
          active: true,
          createdBy: creator.platformUserId,
        },
        {
          title: 'Inactive Form',
          body: 'Inactive body',
          version: 1,
          requiredForRoles: [],
          active: false,
          createdBy: creator.platformUserId,
        },
      ],
    });
    const viewerAgent = await authenticatedPlatformAgent('RESIDENT', 'VIEWER');
    const res = await viewerAgent.get('/api/platform/consent?active=true');
    expect(res.status).toBe(200);
    for (const form of res.body) {
      expect(form.active).toBe(true);
    }
  });

  it('filters by active=false', async () => {
    const creator = await createPlatformUserFixture('MANAGER', 'EDITOR');
    await testPrisma.consentForm.createMany({
      data: [
        {
          title: 'Active Form 2',
          body: 'Active body 2',
          version: 1,
          requiredForRoles: [],
          active: true,
          createdBy: creator.platformUserId,
        },
        {
          title: 'Inactive Form 2',
          body: 'Inactive body 2',
          version: 1,
          requiredForRoles: [],
          active: false,
          createdBy: creator.platformUserId,
        },
      ],
    });
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent.get('/api/platform/consent?active=false');
    expect(res.status).toBe(200);
    for (const form of res.body) {
      expect(form.active).toBe(false);
    }
  });

  it('includes signature count (_count.signatures)', async () => {
    const creator = await createPlatformUserFixture('MANAGER', 'EDITOR');
    await testPrisma.consentForm.create({
      data: {
        title: 'Count Test Form',
        body: 'Count test',
        version: 1,
        requiredForRoles: [],
        active: true,
        createdBy: creator.platformUserId,
      },
    });
    const viewerAgent = await authenticatedPlatformAgent('RESIDENT', 'VIEWER');
    const res = await viewerAgent.get('/api/platform/consent');
    expect(res.status).toBe(200);
    for (const form of res.body) {
      expect(form._count).toHaveProperty('signatures');
      expect(typeof form._count.signatures).toBe('number');
    }
  });
});

describe('Consent API — GET /api/platform/consent/my-signatures', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/platform/consent/my-signatures');
    expect(res.status).toBe(401);
  });

  it("returns the signer's own signatures", async () => {
    const creator = await createPlatformUserFixture('MANAGER', 'EDITOR');
    const form = await testPrisma.consentForm.create({
      data: {
        title: 'My Sigs Test Form',
        body: 'Agreement body',
        version: 1,
        requiredForRoles: [],
        active: true,
        createdBy: creator.platformUserId,
      },
    });
    const signerFixture = await createPlatformUserFixture('RESIDENT', 'VIEWER');
    await testPrisma.consentSignature.create({
      data: {
        formId: form.id,
        userId: signerFixture.platformUserId,
        ipAddress: '127.0.0.1',
        userAgent: 'TestBrowser',
      },
    });

    const signerAgent = await agentForFixture(signerFixture);
    const res = await signerAgent.get('/api/platform/consent/my-signatures');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const sig = res.body.find((s: any) => s.formId === form.id);
    expect(sig).toBeDefined();
  });

  it('includes form info in each signature', async () => {
    const creator = await createPlatformUserFixture('MANAGER', 'EDITOR');
    const form = await testPrisma.consentForm.create({
      data: {
        title: 'Form Info Test',
        body: 'Test body',
        version: 1,
        requiredForRoles: [],
        active: true,
        createdBy: creator.platformUserId,
      },
    });
    const signerFixture = await createPlatformUserFixture('RESIDENT', 'VIEWER');
    await testPrisma.consentSignature.create({
      data: {
        formId: form.id,
        userId: signerFixture.platformUserId,
        ipAddress: '127.0.0.1',
        userAgent: 'TestBrowser',
      },
    });

    const signerAgent = await agentForFixture(signerFixture);
    const res = await signerAgent.get('/api/platform/consent/my-signatures');
    expect(res.status).toBe(200);
    for (const sig of res.body) {
      expect(sig.form).toBeDefined();
      expect(sig.form).toHaveProperty('id');
      expect(sig.form).toHaveProperty('title');
    }
  });
});

describe('Consent API — GET /api/platform/consent/:id (form detail)', () => {
  it('returns 401 when unauthenticated', async () => {
    const creator = await createPlatformUserFixture('MANAGER', 'EDITOR');
    const form = await testPrisma.consentForm.create({
      data: {
        title: 'Pool Usage Agreement',
        body: 'Pool rules...',
        version: 2,
        requiredForRoles: [],
        active: true,
        createdBy: creator.platformUserId,
      },
    });
    const res = await request(app).get(`/api/platform/consent/${form.id}`);
    expect(res.status).toBe(401);
  });

  it('returns 404 for nonexistent form', async () => {
    const viewerAgent = await authenticatedPlatformAgent('RESIDENT', 'VIEWER');
    const res = await viewerAgent.get('/api/platform/consent/nonexistent-uuid');
    expect(res.status).toBe(404);
  });

  it('returns form detail with title, body, version', async () => {
    const creator = await createPlatformUserFixture('MANAGER', 'EDITOR');
    const form = await testPrisma.consentForm.create({
      data: {
        title: 'Pool Usage Agreement',
        body: 'Pool rules...',
        version: 2,
        requiredForRoles: ['RESIDENT'],
        active: true,
        createdBy: creator.platformUserId,
      },
    });
    const viewerAgent = await authenticatedPlatformAgent('RESIDENT', 'VIEWER');
    const res = await viewerAgent.get(`/api/platform/consent/${form.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(form.id);
    expect(res.body.title).toBe('Pool Usage Agreement');
    expect(res.body.version).toBe(2);
    expect(Array.isArray(res.body.signatures)).toBe(true);
  });
});

describe('Consent API — POST /api/platform/consent (create form)', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app)
      .post('/api/platform/consent')
      .send({ title: 'Test', body: 'Body', version: 1 });
    expect(res.status).toBe(401);
  });

  it('returns 403 for VIEWER dashboard role', async () => {
    const viewerAgent = await authenticatedPlatformAgent('RESIDENT', 'VIEWER');
    const res = await viewerAgent
      .post('/api/platform/consent')
      .send({ title: 'Test', body: 'Body', version: 1 });
    expect(res.status).toBe(403);
  });

  it('returns 400 when title is missing', async () => {
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent
      .post('/api/platform/consent')
      .send({ body: 'Body', version: 1 });
    expect(res.status).toBe(400);
  });

  it('returns 400 when body is missing', async () => {
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent
      .post('/api/platform/consent')
      .send({ title: 'Test', version: 1 });
    expect(res.status).toBe(400);
  });

  it('returns 400 when version is missing', async () => {
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent
      .post('/api/platform/consent')
      .send({ title: 'Test', body: 'Body' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when version is not a positive integer', async () => {
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent
      .post('/api/platform/consent')
      .send({ title: 'Test', body: 'Body', version: 0 });
    expect(res.status).toBe(400);
  });

  it('creates form for EDITOR+ and returns 201', async () => {
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent
      .post('/api/platform/consent')
      .send({ title: 'Gym Waiver', body: 'I waive liability...', version: 1 });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Gym Waiver');
    expect(res.body.active).toBe(true); // defaults to active
    expect(typeof res.body.id).toBe('string');
  });

  it('accepts requiredForRoles and active fields', async () => {
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent
      .post('/api/platform/consent')
      .send({
        title: 'Board Rules',
        body: 'I agree to board rules...',
        version: 3,
        active: false,
        requiredForRoles: ['BOARD_MEMBER'],
      });
    expect(res.status).toBe(201);
    expect(res.body.active).toBe(false);
    expect(res.body.requiredForRoles).toContain('BOARD_MEMBER');
  });

  it('persists form to the database', async () => {
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent
      .post('/api/platform/consent')
      .send({ title: 'Parking Agreement', body: 'Parking rules...', version: 1 });
    expect(res.status).toBe(201);

    const db = await testPrisma.consentForm.findUnique({ where: { id: res.body.id } });
    expect(db).not.toBeNull();
    expect(db!.title).toBe('Parking Agreement');
  });
});

describe('Consent API — PUT /api/platform/consent/:id (update form)', () => {
  it('returns 401 when unauthenticated', async () => {
    const creator = await createPlatformUserFixture('MANAGER', 'EDITOR');
    const form = await testPrisma.consentForm.create({
      data: {
        title: 'Original Title',
        body: 'Original body',
        version: 1,
        requiredForRoles: [],
        active: true,
        createdBy: creator.platformUserId,
      },
    });
    const res = await request(app)
      .put(`/api/platform/consent/${form.id}`)
      .send({ title: 'Updated' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for VIEWER dashboard role', async () => {
    const creator = await createPlatformUserFixture('MANAGER', 'EDITOR');
    const form = await testPrisma.consentForm.create({
      data: {
        title: 'Viewer Update Test',
        body: 'Body',
        version: 1,
        requiredForRoles: [],
        active: true,
        createdBy: creator.platformUserId,
      },
    });
    const viewerAgent = await authenticatedPlatformAgent('RESIDENT', 'VIEWER');
    const res = await viewerAgent
      .put(`/api/platform/consent/${form.id}`)
      .send({ title: 'Updated' });
    expect(res.status).toBe(403);
  });

  it('returns 404 for nonexistent form', async () => {
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent
      .put('/api/platform/consent/nonexistent-uuid')
      .send({ title: 'Updated' });
    expect(res.status).toBe(404);
  });

  it('returns 400 when version is invalid (non-positive)', async () => {
    const creator = await createPlatformUserFixture('MANAGER', 'EDITOR');
    const form = await testPrisma.consentForm.create({
      data: {
        title: 'Version Test',
        body: 'Body',
        version: 1,
        requiredForRoles: [],
        active: true,
        createdBy: creator.platformUserId,
      },
    });
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent
      .put(`/api/platform/consent/${form.id}`)
      .send({ version: -1 });
    expect(res.status).toBe(400);
  });

  it('updates the form for EDITOR+ and returns 200', async () => {
    const creator = await createPlatformUserFixture('MANAGER', 'EDITOR');
    const form = await testPrisma.consentForm.create({
      data: {
        title: 'Old Title',
        body: 'Old body',
        version: 1,
        requiredForRoles: [],
        active: true,
        createdBy: creator.platformUserId,
      },
    });
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent
      .put(`/api/platform/consent/${form.id}`)
      .send({ title: 'New Title', version: 2 });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('New Title');
    expect(res.body.version).toBe(2);
  });

  it('partially updates only provided fields', async () => {
    const creator = await createPlatformUserFixture('MANAGER', 'EDITOR');
    const form = await testPrisma.consentForm.create({
      data: {
        title: 'Partial Update Test',
        body: 'Body stays the same',
        version: 1,
        requiredForRoles: [],
        active: true,
        createdBy: creator.platformUserId,
      },
    });
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent
      .put(`/api/platform/consent/${form.id}`)
      .send({ active: false });
    expect(res.status).toBe(200);
    expect(res.body.active).toBe(false);
    // Title and body unchanged
    expect(res.body.title).toBe('Partial Update Test');
    expect(res.body.body).toBe('Body stays the same');
  });
});

describe('Consent API — DELETE /api/platform/consent/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const creator = await createPlatformUserFixture('MANAGER', 'EDITOR');
    const form = await testPrisma.consentForm.create({
      data: {
        title: 'Delete Unauth Test',
        body: 'To be deleted',
        version: 1,
        requiredForRoles: [],
        active: true,
        createdBy: creator.platformUserId,
      },
    });
    const res = await request(app).delete(`/api/platform/consent/${form.id}`);
    expect(res.status).toBe(401);
  });

  it('returns 403 for VIEWER dashboard role', async () => {
    const creator = await createPlatformUserFixture('MANAGER', 'EDITOR');
    const form = await testPrisma.consentForm.create({
      data: {
        title: 'Delete Viewer Test',
        body: 'Body',
        version: 1,
        requiredForRoles: [],
        active: true,
        createdBy: creator.platformUserId,
      },
    });
    const viewerAgent = await authenticatedPlatformAgent('RESIDENT', 'VIEWER');
    const res = await viewerAgent.delete(`/api/platform/consent/${form.id}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 for nonexistent form', async () => {
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent.delete('/api/platform/consent/nonexistent-uuid');
    expect(res.status).toBe(404);
  });

  it('deletes form and returns 204', async () => {
    const creator = await createPlatformUserFixture('MANAGER', 'EDITOR');
    const form = await testPrisma.consentForm.create({
      data: {
        title: 'Delete Me',
        body: 'To be deleted',
        version: 1,
        requiredForRoles: [],
        active: true,
        createdBy: creator.platformUserId,
      },
    });
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent.delete(`/api/platform/consent/${form.id}`);
    expect(res.status).toBe(204);

    const db = await testPrisma.consentForm.findUnique({ where: { id: form.id } });
    expect(db).toBeNull();
  });

  it('cascades to delete signatures before deleting form', async () => {
    const creator = await createPlatformUserFixture('MANAGER', 'EDITOR');
    const form = await testPrisma.consentForm.create({
      data: {
        title: 'Cascade Delete Test',
        body: 'Form with signatures',
        version: 1,
        requiredForRoles: [],
        active: true,
        createdBy: creator.platformUserId,
      },
    });
    const signerFixture = await createPlatformUserFixture('RESIDENT', 'VIEWER');
    const sig = await testPrisma.consentSignature.create({
      data: {
        formId: form.id,
        userId: signerFixture.platformUserId,
        ipAddress: '127.0.0.1',
        userAgent: 'Test',
      },
    });
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent.delete(`/api/platform/consent/${form.id}`);
    expect(res.status).toBe(204);

    // Both form and signature should be gone
    const dbSig = await testPrisma.consentSignature.findUnique({ where: { id: sig.id } });
    expect(dbSig).toBeNull();
    const dbForm = await testPrisma.consentForm.findUnique({ where: { id: form.id } });
    expect(dbForm).toBeNull();
  });
});

describe('Consent API — POST /api/platform/consent/:id/sign (sign form)', () => {
  it('returns 401 when unauthenticated', async () => {
    const creator = await createPlatformUserFixture('MANAGER', 'EDITOR');
    const form = await testPrisma.consentForm.create({
      data: {
        title: 'Sign Unauth Test',
        body: 'Sign me',
        version: 1,
        requiredForRoles: ['RESIDENT'],
        active: true,
        createdBy: creator.platformUserId,
      },
    });
    const res = await request(app).post(`/api/platform/consent/${form.id}/sign`);
    expect(res.status).toBe(401);
  });

  it('returns 404 when form not found', async () => {
    // POST /sign requires EDITOR+ dashboard role (platformProtect blocks VIEWER from POST)
    const signerAgent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const res = await signerAgent.post('/api/platform/consent/nonexistent-uuid/sign');
    expect(res.status).toBe(404);
  });

  it('signs the form and returns 201', async () => {
    const creator = await createPlatformUserFixture('MANAGER', 'EDITOR');
    const form = await testPrisma.consentForm.create({
      data: {
        title: 'Sign Test Form',
        body: 'I agree to terms',
        version: 1,
        requiredForRoles: ['RESIDENT'],
        active: true,
        createdBy: creator.platformUserId,
      },
    });
    // Use EDITOR dashboard role so POST is allowed through platformProtect
    const signerFixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const signerAgent = await agentForFixture(signerFixture);
    const res = await signerAgent.post(`/api/platform/consent/${form.id}/sign`);
    expect(res.status).toBe(201);
    expect(res.body.formId).toBe(form.id);
    expect(typeof res.body.id).toBe('string');
  });

  it('captures signedAt as signing audit trail', async () => {
    const creator = await createPlatformUserFixture('MANAGER', 'EDITOR');
    const form = await testPrisma.consentForm.create({
      data: {
        title: 'Audit Trail Form',
        body: 'I agree',
        version: 1,
        requiredForRoles: [],
        active: true,
        createdBy: creator.platformUserId,
      },
    });
    const signerFixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const signerAgent = await agentForFixture(signerFixture);
    const res = await signerAgent.post(`/api/platform/consent/${form.id}/sign`);
    expect(res.status).toBe(201);
    expect(res.body.signedAt).toBeDefined();
  });

  it('returns 400 when trying to sign a form twice (duplicate rejection)', async () => {
    const creator = await createPlatformUserFixture('MANAGER', 'EDITOR');
    const form = await testPrisma.consentForm.create({
      data: {
        title: 'Duplicate Sign Test',
        body: 'Sign once only',
        version: 1,
        requiredForRoles: [],
        active: true,
        createdBy: creator.platformUserId,
      },
    });
    // Use EDITOR dashboard role so POST is allowed through platformProtect
    const signerFixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    // Pre-seed a signature
    await testPrisma.consentSignature.create({
      data: {
        formId: form.id,
        userId: signerFixture.platformUserId,
        ipAddress: '127.0.0.1',
        userAgent: 'Test',
      },
    });
    const signerAgent = await agentForFixture(signerFixture);
    const res = await signerAgent.post(`/api/platform/consent/${form.id}/sign`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already signed/i);
  });

  it('a different user can sign the same form', async () => {
    const creator = await createPlatformUserFixture('MANAGER', 'EDITOR');
    const form = await testPrisma.consentForm.create({
      data: {
        title: 'Multi-signer Form',
        body: 'Everyone can sign',
        version: 1,
        requiredForRoles: [],
        active: true,
        createdBy: creator.platformUserId,
      },
    });
    // First signer
    const signer1 = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    await testPrisma.consentSignature.create({
      data: { formId: form.id, userId: signer1.platformUserId },
    });
    // Second signer (fresh agent, different user) — EDITOR role to get past platformProtect
    const signer2Fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const signer2Agent = await agentForFixture(signer2Fixture);
    const res = await signer2Agent.post(`/api/platform/consent/${form.id}/sign`);
    expect(res.status).toBe(201);
  });
});

describe('Consent API — GET /api/platform/consent/:id/signatures (audit trail)', () => {
  it('returns 401 when unauthenticated', async () => {
    const creator = await createPlatformUserFixture('MANAGER', 'EDITOR');
    const form = await testPrisma.consentForm.create({
      data: {
        title: 'Audit Unauth Test',
        body: 'Audit form',
        version: 1,
        requiredForRoles: [],
        active: true,
        createdBy: creator.platformUserId,
      },
    });
    const res = await request(app).get(`/api/platform/consent/${form.id}/signatures`);
    expect(res.status).toBe(401);
  });

  it('returns 403 for VIEWER dashboard role', async () => {
    const creator = await createPlatformUserFixture('MANAGER', 'EDITOR');
    const form = await testPrisma.consentForm.create({
      data: {
        title: 'Audit Viewer Test',
        body: 'Audit form',
        version: 1,
        requiredForRoles: [],
        active: true,
        createdBy: creator.platformUserId,
      },
    });
    const viewerAgent = await authenticatedPlatformAgent('RESIDENT', 'VIEWER');
    const res = await viewerAgent.get(`/api/platform/consent/${form.id}/signatures`);
    expect(res.status).toBe(403);
  });

  it('returns 404 when form not found', async () => {
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent.get('/api/platform/consent/nonexistent-uuid/signatures');
    expect(res.status).toBe(404);
  });

  it('returns all signatures for EDITOR+', async () => {
    const creator = await createPlatformUserFixture('MANAGER', 'EDITOR');
    const form = await testPrisma.consentForm.create({
      data: {
        title: 'Audit Form With Sigs',
        body: 'Audit trail test form',
        version: 1,
        requiredForRoles: [],
        active: true,
        createdBy: creator.platformUserId,
      },
    });
    const s1 = await createPlatformUserFixture('RESIDENT', 'VIEWER');
    const s2 = await createPlatformUserFixture('RESIDENT', 'VIEWER');
    await testPrisma.consentSignature.createMany({
      data: [
        { formId: form.id, userId: s1.platformUserId, ipAddress: '10.0.0.1', userAgent: 'Browser/1' },
        { formId: form.id, userId: s2.platformUserId, ipAddress: '10.0.0.2', userAgent: 'Browser/2' },
      ],
    });

    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent.get(`/api/platform/consent/${form.id}/signatures`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);
  });

  it('signature audit trail includes ipAddress, userAgent, signedAt', async () => {
    const creator = await createPlatformUserFixture('MANAGER', 'EDITOR');
    const form = await testPrisma.consentForm.create({
      data: {
        title: 'Audit Fields Form',
        body: 'Audit trail fields',
        version: 1,
        requiredForRoles: [],
        active: true,
        createdBy: creator.platformUserId,
      },
    });
    const s = await createPlatformUserFixture('RESIDENT', 'VIEWER');
    await testPrisma.consentSignature.create({
      data: { formId: form.id, userId: s.platformUserId, ipAddress: '10.0.0.1', userAgent: 'Browser/1' },
    });

    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const res = await editorAgent.get(`/api/platform/consent/${form.id}/signatures`);
    expect(res.status).toBe(200);
    for (const sig of res.body) {
      expect(sig).toHaveProperty('ipAddress');
      expect(sig).toHaveProperty('userAgent');
      expect(sig).toHaveProperty('signedAt');
      expect(sig).toHaveProperty('formId', form.id);
    }
  });

  it('role-required consent enforcement — consent forms can specify requiredForRoles', async () => {
    // Create a form restricted to MANAGER role using the API (editor agent has a real PlatformUser)
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const createRes = await editorAgent
      .post('/api/platform/consent')
      .send({
        title: 'Manager Consent Form',
        body: 'Manager-only consent',
        version: 1,
        requiredForRoles: ['MANAGER'],
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.requiredForRoles).toContain('MANAGER');

    // Any authenticated user can still read the form (enforcement is at the app level)
    const viewerAgent = await authenticatedPlatformAgent('RESIDENT', 'VIEWER');
    const viewRes = await viewerAgent.get(`/api/platform/consent/${createRes.body.id}`);
    expect(viewRes.status).toBe(200);
    expect(viewRes.body.requiredForRoles).toContain('MANAGER');
  });
});
