/**
 * Platform Auth Middleware Integration Tests
 *
 * Tests the platformAuth middleware stack against a real Express app with a real DB.
 *
 * Covers:
 * - platformProtect (mounted globally on /api/platform in app.ts)
 *   - Unauthenticated requests → 401
 *   - Authenticated VIEWER on GET → 200
 *   - Authenticated VIEWER on POST → 403 (EDITOR gate)
 *   - Authenticated EDITOR on GET/POST → allowed (passes to route)
 *
 * - platformProtectStrict (loads PlatformUser record, tested via mini-app)
 *   - Unauthenticated request → 401
 *   - Authenticated user with no PlatformUser record → 403
 *   - Authenticated user WITH PlatformUser record → req.platformUser attached, next() called
 *
 * - requirePlatformRole (role-based access within platform, tested via mini-app)
 *   - Correct role → 200
 *   - Wrong role → 403
 *   - Missing platformUser → 401
 *
 * - CSRF token validation (via csrfMiddleware in app.ts)
 *   - POST without CSRF token → 403 (when logged in)
 *   - POST with correct CSRF token → allowed
 *   - POST with wrong CSRF token → 403
 *   - DELETE without CSRF → 403
 *   - PUT without CSRF → 403
 *
 * RELATED FILES:
 * - server/middleware/platformAuth.ts  - the middleware under test
 * - server/app.ts                      - mounts platformProtect at /api/platform
 * - tests/api/platform/helpers.ts      - test fixtures and agent factories
 * - tests/setup.ts                     - base setup / teardown
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import app from '../../../server/app.js';
import { testPrisma } from '../../setup.js';
import {
  authenticatedPlatformAgent,
  authenticatedDashboardOnlyAgent,
  createPlatformUserFixture,
} from './helpers.js';
import {
  platformProtectStrict,
  requirePlatformRole,
} from '../../../server/middleware/platformAuth.js';
import { csrfMiddleware } from '../../../server/middleware/csrf.js';

// ─── platformProtect (session-level guard) ────────────────────────────────────

describe('platformProtect — unauthenticated requests', () => {
  it('GET /api/platform/announcements returns 401 when not logged in', async () => {
    const res = await request(app).get('/api/platform/announcements');
    expect(res.status).toBe(401);
  });

  it('POST /api/platform/announcements returns 401 when not logged in', async () => {
    const res = await request(app)
      .post('/api/platform/announcements')
      .send({ title: 'Test', body: 'Body' });
    expect(res.status).toBe(401);
  });

  it('GET /api/platform/maintenance returns 401 when not logged in', async () => {
    const res = await request(app).get('/api/platform/maintenance');
    expect(res.status).toBe(401);
  });

  it('GET /api/platform/marketplace returns 401 when not logged in', async () => {
    const res = await request(app).get('/api/platform/marketplace');
    expect(res.status).toBe(401);
  });
});

describe('platformProtect — authenticated VIEWER role (dashboard role gate)', () => {
  it('GET /api/platform/announcements returns 200 for dashboard VIEWER (reads allowed)', async () => {
    // VIEWER dashboard role can read (GET is allowed through platformProtect)
    const agent = await authenticatedPlatformAgent('RESIDENT', 'VIEWER');
    const res = await agent.get('/api/platform/announcements');
    // 200: platformProtect allows GETs from any authenticated user
    expect(res.status).toBe(200);
  });

  it('POST /api/platform/announcements returns 403 for dashboard VIEWER role', async () => {
    // VIEWER dashboard role cannot perform mutations via platformProtect
    const agent = await authenticatedPlatformAgent('MANAGER', 'VIEWER');
    const res = await agent
      .post('/api/platform/announcements')
      .send({ title: 'Test announcement', body: 'Body text' });
    // platformProtect blocks mutations for roles below EDITOR
    expect(res.status).toBe(403);
  });

  it('GET /api/platform/marketplace returns 200 for VIEWER (reads allowed)', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'VIEWER');
    const res = await agent.get('/api/platform/marketplace');
    expect(res.status).toBe(200);
  });
});

describe('platformProtect — authenticated EDITOR/ADMIN role', () => {
  it('GET /api/platform/announcements returns 200 for EDITOR', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const res = await agent.get('/api/platform/announcements');
    expect(res.status).toBe(200);
  });

  it('GET /api/platform/announcements returns 200 for ADMIN', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'ADMIN');
    const res = await agent.get('/api/platform/announcements');
    expect(res.status).toBe(200);
  });

  it('GET /api/platform/marketplace returns 200 for EDITOR', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const res = await agent.get('/api/platform/marketplace');
    expect(res.status).toBe(200);
  });
});

// ─── platformProtectStrict — tested via mini Express app ─────────────────────
//
// platformProtectStrict is not currently mounted globally in app.ts — it must
// be applied per-route.  We test it using a small Express app that mirrors the
// session setup of the real app.

function buildStrictTestApp() {
  const testApp = express();
  testApp.use(express.json());
  testApp.use(
    session({
      secret: 'test-secret',
      resave: false,
      saveUninitialized: false,
    })
  );

  // A mock login endpoint for the test app
  testApp.post('/test/login', async (req, res) => {
    const { userId, username, role } = req.body;
    (req.session as any).user = { id: userId, username, role };
    (req.session as any).csrfToken = 'test-csrf-token';
    await new Promise<void>((resolve, reject) =>
      req.session.save((err) => (err ? reject(err) : resolve()))
    );
    res.json({ ok: true });
  });

  // Protected endpoint: requires platformProtectStrict
  testApp.get('/test/platform-strict', platformProtectStrict, (_req, res) => {
    res.json({ ok: true, platformUserId: (res as any).req.platformUser?.id });
  });

  return testApp;
}

describe('platformProtectStrict — PlatformUser record lookup', () => {
  it('returns 401 when no session user is present', async () => {
    const strictApp = buildStrictTestApp();
    const res = await request(strictApp).get('/test/platform-strict');
    expect(res.status).toBe(401);
  });

  it('returns 403 when session user has no PlatformUser record', async () => {
    const strictApp = buildStrictTestApp();
    const agent = request.agent(strictApp);

    // Create a User but no PlatformUser
    const { userId, username } = await authenticatedDashboardOnlyAgent('EDITOR').then(
      async () => {
        // Use testPrisma to get the user we just created
        const users = await testPrisma.user.findMany({ orderBy: { id: 'desc' }, take: 1 });
        return { userId: users[0].id, username: users[0].username };
      }
    );

    await agent.post('/test/login').send({ userId, username, role: 'EDITOR' }).expect(200);
    const res = await agent.get('/test/platform-strict');
    expect(res.status).toBe(403);
  });

  it('passes through and attaches platformUser when record exists', async () => {
    const strictApp = buildStrictTestApp();
    const agent = request.agent(strictApp);

    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    await agent
      .post('/test/login')
      .send({ userId: fixture.userId, username: fixture.username, role: 'EDITOR' })
      .expect(200);

    const res = await agent.get('/test/platform-strict');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.platformUserId).toBe(fixture.platformUserId);
  });
});

// ─── requirePlatformRole — tested via mini Express app ───────────────────────

function buildRoleTestApp() {
  const testApp = express();
  testApp.use(express.json());
  testApp.use(
    session({
      secret: 'test-secret',
      resave: false,
      saveUninitialized: false,
    })
  );

  testApp.post('/test/login', async (req, res) => {
    const { userId, username, role, platformUserId, platformRole } = req.body;
    (req.session as any).user = { id: userId, username, role };
    await new Promise<void>((resolve, reject) =>
      req.session.save((err) => (err ? reject(err) : resolve()))
    );
    res.json({ ok: true });
  });

  // Inject platformUser into request for testing requirePlatformRole without DB lookup
  testApp.use('/test/role-protected', (req, _res, next) => {
    const { platformUserId, platformRole } = (req.query as any);
    if (platformUserId && platformRole) {
      (req as any).platformUser = { id: platformUserId, role: platformRole };
    }
    next();
  });

  testApp.get(
    '/test/role-protected/manager',
    requirePlatformRole('MANAGER', 'BOARD_MEMBER'),
    (_req, res) => res.json({ ok: true })
  );

  testApp.get(
    '/test/role-protected/any',
    requirePlatformRole('RESIDENT', 'BOARD_MEMBER', 'MANAGER', 'SECURITY', 'CONCIERGE'),
    (_req, res) => res.json({ ok: true })
  );

  return testApp;
}

describe('requirePlatformRole — role-based access control', () => {
  it('allows MANAGER to access MANAGER|BOARD_MEMBER endpoint', async () => {
    const testApp = buildRoleTestApp();
    const res = await request(testApp).get(
      '/test/role-protected/manager?platformUserId=123&platformRole=MANAGER'
    );
    expect(res.status).toBe(200);
  });

  it('allows BOARD_MEMBER to access MANAGER|BOARD_MEMBER endpoint', async () => {
    const testApp = buildRoleTestApp();
    const res = await request(testApp).get(
      '/test/role-protected/manager?platformUserId=123&platformRole=BOARD_MEMBER'
    );
    expect(res.status).toBe(200);
  });

  it('rejects RESIDENT from accessing MANAGER|BOARD_MEMBER endpoint with 403', async () => {
    const testApp = buildRoleTestApp();
    const res = await request(testApp).get(
      '/test/role-protected/manager?platformUserId=123&platformRole=RESIDENT'
    );
    expect(res.status).toBe(403);
  });

  it('rejects SECURITY from accessing MANAGER|BOARD_MEMBER endpoint with 403', async () => {
    const testApp = buildRoleTestApp();
    const res = await request(testApp).get(
      '/test/role-protected/manager?platformUserId=123&platformRole=SECURITY'
    );
    expect(res.status).toBe(403);
  });

  it('returns 401 when platformUser is not attached (missing from request)', async () => {
    const testApp = buildRoleTestApp();
    // No platformUserId/platformRole query params → platformUser is undefined
    const res = await request(testApp).get('/test/role-protected/manager');
    expect(res.status).toBe(401);
  });

  it('allows all roles to access an endpoint that accepts all roles', async () => {
    const testApp = buildRoleTestApp();
    const roles = ['RESIDENT', 'BOARD_MEMBER', 'MANAGER', 'SECURITY', 'CONCIERGE'];
    for (const role of roles) {
      const res = await request(testApp).get(
        `/test/role-protected/any?platformUserId=123&platformRole=${role}`
      );
      expect(res.status).toBe(200);
    }
  });
});

// ─── CSRF token validation ────────────────────────────────────────────────────

describe('CSRF token validation on state-changing platform requests', () => {
  it('POST without X-CSRF-Token header returns 403 for authenticated user', async () => {
    const fixture = await createPlatformUserFixture('MANAGER', 'EDITOR');
    const rawAgent = request.agent(app);
    await rawAgent
      .post('/api/auth/login')
      .send({ username: fixture.username, password: fixture.password })
      .expect(200);

    // Post WITHOUT injecting CSRF token
    const res = await rawAgent
      .post('/api/platform/announcements')
      .send({ title: 'No CSRF', body: 'Body' });
    expect(res.status).toBe(403);
  });

  it('POST with wrong X-CSRF-Token header returns 403', async () => {
    const fixture = await createPlatformUserFixture('MANAGER', 'EDITOR');
    const rawAgent = request.agent(app);
    await rawAgent
      .post('/api/auth/login')
      .send({ username: fixture.username, password: fixture.password })
      .expect(200);

    const res = await rawAgent
      .post('/api/platform/announcements')
      .set('X-CSRF-Token', 'totally-wrong-token')
      .send({ title: 'Bad CSRF', body: 'Body' });
    expect(res.status).toBe(403);
  });

  it('POST with correct X-CSRF-Token passes CSRF check', async () => {
    // authenticatedPlatformAgent patches POST with correct CSRF token
    const agent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');

    // Should NOT be 403 from CSRF (may be 2xx or validation error from route, not CSRF)
    const res = await agent
      .post('/api/platform/announcements')
      .send({ title: 'Valid CSRF', body: 'Body text' });
    expect(res.status).not.toBe(403);
  });

  it('DELETE without X-CSRF-Token returns 403 for authenticated user', async () => {
    const fixture = await createPlatformUserFixture('MANAGER', 'EDITOR');
    const rawAgent = request.agent(app);
    await rawAgent
      .post('/api/auth/login')
      .send({ username: fixture.username, password: fixture.password })
      .expect(200);

    const res = await rawAgent.delete('/api/platform/announcements/1');
    expect(res.status).toBe(403);
  });

  it('PUT without X-CSRF-Token returns 403 for authenticated user', async () => {
    const fixture = await createPlatformUserFixture('MANAGER', 'EDITOR');
    const rawAgent = request.agent(app);
    await rawAgent
      .post('/api/auth/login')
      .send({ username: fixture.username, password: fixture.password })
      .expect(200);

    const res = await rawAgent
      .put('/api/platform/announcements/1')
      .send({ title: 'No CSRF update' });
    expect(res.status).toBe(403);
  });
});

// ─── Platform user fixture helpers ───────────────────────────────────────────

describe('createPlatformUserFixture — test data helpers', () => {
  it('creates a User and PlatformUser record in the database', async () => {
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');

    const user = await testPrisma.user.findUnique({ where: { id: fixture.userId } });
    expect(user).not.toBeNull();
    expect(user!.role).toBe('EDITOR');

    const platformUser = await testPrisma.platformUser.findUnique({
      where: { id: fixture.platformUserId },
    });
    expect(platformUser).not.toBeNull();
    expect(platformUser!.role).toBe('RESIDENT');
    expect(platformUser!.userId).toBe(fixture.userId);
  });

  it('creates platform users with different roles', async () => {
    const roles: Array<import('@prisma/client').PlatformRole> = [
      'RESIDENT',
      'BOARD_MEMBER',
      'MANAGER',
      'SECURITY',
      'CONCIERGE',
    ];

    for (const role of roles) {
      const fixture = await createPlatformUserFixture(role);
      const platformUser = await testPrisma.platformUser.findUnique({
        where: { id: fixture.platformUserId },
      });
      expect(platformUser!.role).toBe(role);
    }
  });

  it('creates unique usernames for each fixture', async () => {
    const fixture1 = await createPlatformUserFixture('RESIDENT');
    const fixture2 = await createPlatformUserFixture('RESIDENT');
    expect(fixture1.username).not.toBe(fixture2.username);
    expect(fixture1.userId).not.toBe(fixture2.userId);
  });
});
