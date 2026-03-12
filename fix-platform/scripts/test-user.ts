/**
 * Test user management script for local dev and CI.
 *
 * Manages a deterministic test user in the local database for use by
 * Playwright screenshot scripts, dev workflows, and CI pipelines.
 *
 * Creates both a public-schema User (role: ADMIN) and a platform-schema
 * PlatformUser (role: MANAGER) so the test user has full access.
 *
 * Subcommands:
 *   create  — Upserts the test user (idempotent)
 *   delete  — Removes the test user
 *   login   — Logs in via /api/auth/login and prints the session cookie
 *
 * Default credentials (overridable via env vars):
 *   Username: TEST_USER  (default: "admin")
 *   Password: TEST_PASS  (default: "admin")
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." npx tsx scripts/test-user.ts create
 *   DATABASE_URL="postgresql://..." npx tsx scripts/test-user.ts delete
 *   DATABASE_URL="postgresql://..." npx tsx scripts/test-user.ts login
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

if (process.env.NODE_ENV === 'production') {
  console.error('ABORT: test-user.ts must not run in production.');
  process.exit(1);
}

const TEST_USERNAME = process.env.TEST_USER ?? 'admin';
const TEST_PASSWORD = process.env.TEST_PASS ?? 'admin';
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

const prisma = new PrismaClient();

async function create(): Promise<void> {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);

  const user = await prisma.user.upsert({
    where: { username: TEST_USERNAME },
    update: {
      passwordHash,
      role: 'ADMIN',
    },
    create: {
      username: TEST_USERNAME,
      passwordHash,
      role: 'ADMIN',
    },
  });

  // Also create a PlatformUser (MANAGER role) so the test user has full platform access
  const platformUser = await prisma.platformUser.upsert({
    where: { userId: user.id },
    update: { role: 'MANAGER' },
    create: {
      userId: user.id,
      role: 'MANAGER',
      preferences: {
        displayName: 'Test Admin',
        notifications: { email: false, push: false, announcements: false, maintenanceUpdates: false },
      },
    },
  });

  console.log(`Test user upserted: ${user.username} (id=${user.id}, role=${user.role})`);
  console.log(`PlatformUser upserted: ${platformUser.id} (role=${platformUser.role})`);
}

async function deleteUser(): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { username: TEST_USERNAME } });

  if (!existing) {
    console.log(`Test user "${TEST_USERNAME}" not found — nothing to delete.`);
    return;
  }

  // Delete PlatformUser first (FK constraint)
  await prisma.platformUser.deleteMany({ where: { userId: existing.id } });
  await prisma.user.delete({ where: { username: TEST_USERNAME } });
  console.log(`Test user "${TEST_USERNAME}" and associated PlatformUser deleted.`);
}

async function login(): Promise<void> {
  // First, get CSRF token
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`, {
    method: 'GET',
    credentials: 'include',
  });

  if (!csrfRes.ok) {
    throw new Error(`Failed to get CSRF token: ${csrfRes.status} ${csrfRes.statusText}`);
  }

  const setCookieHeader = csrfRes.headers.get('set-cookie') ?? '';
  const csrfData = await csrfRes.json() as { token: string };
  const csrfToken = csrfData.token;

  // Extract session cookie from CSRF response
  const sessionCookie = setCookieHeader
    .split(',')
    .map(c => c.trim().split(';')[0])
    .find(c => c.startsWith('connect.sid=')) ?? '';

  // Now login with the session cookie and CSRF token
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrfToken,
      ...(sessionCookie ? { 'Cookie': sessionCookie } : {}),
    },
    body: JSON.stringify({ username: TEST_USERNAME, password: TEST_PASSWORD }),
  });

  if (!loginRes.ok) {
    const body = await loginRes.text();
    throw new Error(`Login failed: ${loginRes.status} ${loginRes.statusText} — ${body}`);
  }

  const loginSetCookie = loginRes.headers.get('set-cookie') ?? '';
  const newSessionCookie = loginSetCookie
    .split(',')
    .map(c => c.trim().split(';')[0])
    .find(c => c.startsWith('connect.sid=')) ?? sessionCookie;

  const userData = await loginRes.json();
  console.log(`Logged in as: ${(userData as { username: string }).username} (role=${(userData as { role: string }).role})`);
  console.log(`SESSION_COOKIE=${newSessionCookie}`);
}

async function main(): Promise<void> {
  const subcommand = process.argv[2];

  try {
    switch (subcommand) {
      case 'create':
        await create();
        break;
      case 'delete':
        await deleteUser();
        break;
      case 'login':
        await login();
        break;
      default:
        console.error(`Unknown subcommand: "${subcommand}"`);
        console.error('Usage: tsx scripts/test-user.ts <create|delete|login>');
        process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
