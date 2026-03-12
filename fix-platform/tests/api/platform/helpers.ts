/**
 * Test helpers for platform API tests.
 *
 * Provides utilities for:
 * - Creating PlatformUser test fixtures (with role assignments)
 * - Authenticating as different platform roles (RESIDENT, BOARD_MEMBER, MANAGER, ADMIN, etc.)
 * - CSRF token handling for state-changing requests
 * - Express app setup for supertest-style testing
 *
 * RELATED FILES:
 * - tests/setup.ts               - base test setup and authenticatedAgent for dashboard auth
 * - server/middleware/platformAuth.ts - platformProtect / platformProtectStrict / requirePlatformRole
 * - server/middleware/csrf.ts    - CSRF token middleware
 */
import bcrypt from 'bcryptjs';
import request from 'supertest';
import type { TestAgent } from 'supertest';
import type { PlatformRole } from '@prisma/client';
import app from '../../../server/app.js';
import { testPrisma } from '../../setup.js';

/** Counter for generating unique usernames in tests */
let userCounter = 0;

/**
 * Reset the user counter (call in beforeEach if you need deterministic names).
 */
export function resetUserCounter(): void {
  userCounter = 0;
}

export interface PlatformUserFixture {
  userId: number;
  platformUserId: string;
  username: string;
  password: string;
}

/**
 * Create a User + PlatformUser record in the test database.
 *
 * @param platformRole - The PlatformRole to assign (defaults to RESIDENT)
 * @param dashboardRole - The dashboard Role for the User record (defaults to EDITOR so
 *   mutations are allowed through the `platformProtect` EDITOR gate)
 * @param unitNumber - Optional unit number for the platform user
 * @returns fixture object with userId, platformUserId, username and plaintext password
 */
export async function createPlatformUserFixture(
  platformRole: PlatformRole = 'RESIDENT',
  dashboardRole: 'VIEWER' | 'EDITOR' | 'ADMIN' = 'EDITOR',
  unitNumber?: string,
): Promise<PlatformUserFixture> {
  userCounter += 1;
  const username = `platform_test_user_${userCounter}_${Date.now()}`;
  const password = 'testpassword123';
  const passwordHash = await bcrypt.hash(password, 4); // low rounds for speed

  const user = await testPrisma.user.create({
    data: { username, passwordHash, role: dashboardRole },
  });

  const platformUser = await testPrisma.platformUser.create({
    data: {
      userId: user.id,
      role: platformRole,
      unitNumber: unitNumber ?? `${userCounter}A`,
    },
  });

  return {
    userId: user.id,
    platformUserId: platformUser.id,
    username,
    password,
  };
}

/**
 * Create an authenticated supertest agent for a platform user with the given role.
 *
 * The returned agent:
 * - Maintains cookies (session) across requests
 * - Automatically injects the CSRF token on POST, PUT, PATCH, DELETE requests
 *
 * @param platformRole - The PlatformRole to assign (defaults to RESIDENT)
 * @param dashboardRole - The dashboard Role (defaults to EDITOR so mutations pass through
 *   the top-level `platformProtect` check)
 */
export async function authenticatedPlatformAgent(
  platformRole: PlatformRole = 'RESIDENT',
  dashboardRole: 'VIEWER' | 'EDITOR' | 'ADMIN' = 'EDITOR',
): Promise<TestAgent> {
  const fixture = await createPlatformUserFixture(platformRole, dashboardRole);

  const agent = request.agent(app);
  await agent
    .post('/api/auth/login')
    .send({ username: fixture.username, password: fixture.password })
    .expect(200);

  const csrfRes = await agent.get('/api/auth/csrf').expect(200);
  const csrfToken: string | undefined = csrfRes.body?.token;
  if (!csrfToken) {
    throw new Error('Missing CSRF token for platform test agent');
  }

  // Patch mutating methods to inject CSRF header automatically
  const agentAny = agent as TestAgent & Record<string, (...args: unknown[]) => unknown>;
  for (const method of ['post', 'put', 'delete', 'patch']) {
    const original = agentAny[method].bind(agentAny);
    agentAny[method] = (...args: unknown[]) =>
      (original(...args) as ReturnType<typeof agent.post>).set('X-CSRF-Token', csrfToken);
  }

  return agent;
}

/**
 * Create a dashboard-authenticated agent (no PlatformUser record) with the
 * given dashboard role.  Useful for testing that requests WITHOUT a
 * PlatformUser record are rejected by platformProtectStrict.
 */
export async function authenticatedDashboardOnlyAgent(
  dashboardRole: 'VIEWER' | 'EDITOR' | 'ADMIN' = 'EDITOR',
): Promise<TestAgent> {
  userCounter += 1;
  const username = `dashboard_only_${userCounter}_${Date.now()}`;
  const password = 'testpassword123';
  const passwordHash = await bcrypt.hash(password, 4);

  await testPrisma.user.create({
    data: { username, passwordHash, role: dashboardRole },
  });

  const agent = request.agent(app);
  await agent
    .post('/api/auth/login')
    .send({ username, password })
    .expect(200);

  const csrfRes = await agent.get('/api/auth/csrf').expect(200);
  const csrfToken: string | undefined = csrfRes.body?.token;
  if (!csrfToken) {
    throw new Error('Missing CSRF token for dashboard-only test agent');
  }

  const agentAny = agent as TestAgent & Record<string, (...args: unknown[]) => unknown>;
  for (const method of ['post', 'put', 'delete', 'patch']) {
    const original = agentAny[method].bind(agentAny);
    agentAny[method] = (...args: unknown[]) =>
      (original(...args) as ReturnType<typeof agent.post>).set('X-CSRF-Token', csrfToken);
  }

  return agent;
}
