/**
 * ensure-e2e-users.ts — Make sure the E2E test accounts exist on staging.
 *
 * The E2E workflow logs in as E2E_ADMIN_USER / E2E_EDITOR_USER / E2E_VIEWER_USER.
 * When staging's database is recreated (the free Render DB expires), those users
 * vanish and every E2E run fails at login. This script runs before the tests and
 * creates the three users, or fixes their role/password, from the same GitHub
 * secrets the tests use. Nobody has to recreate them by hand.
 *
 * SAFETY:
 *   - Writes only to STAGING_DATABASE_URL, and refuses any database whose name
 *     lacks "staging" (same guard as sync-prod-to-staging.ts). Never touches prod.
 *   - Only touches the three named users. A password is rewritten only when it
 *     no longer matches, so existing sessions are not logged out needlessly.
 *   - Never prints passwords.
 *
 * USAGE:
 *   STAGING_DATABASE_URL=<staging external connection string> \
 *   E2E_ADMIN_USER=… E2E_ADMIN_PASS=… E2E_EDITOR_USER=… E2E_EDITOR_PASS=… \
 *   E2E_VIEWER_USER=… E2E_VIEWER_PASS=… \
 *   npx tsx scripts/ensure-e2e-users.ts
 */
import bcrypt from 'bcryptjs';
import { assertStagingUrl } from './sync-prod-to-staging.js';

type Role = 'ADMIN' | 'EDITOR' | 'VIEWER';

export interface E2EAccount {
  username: string;
  password: string;
  role: Role;
}

/** Read the three accounts from env. Accounts with a missing user or password are skipped. */
export function accountsFromEnv(env: NodeJS.ProcessEnv): { accounts: E2EAccount[]; missing: string[] } {
  const accounts: E2EAccount[] = [];
  const missing: string[] = [];
  for (const role of ['ADMIN', 'EDITOR', 'VIEWER'] as const) {
    const username = env[`E2E_${role}_USER`];
    const password = env[`E2E_${role}_PASS`];
    if (username && password) accounts.push({ username, password, role });
    else missing.push(role);
  }
  return { accounts, missing };
}

async function main() {
  const url = process.env.STAGING_DATABASE_URL;
  if (!url) {
    console.log('STAGING_DATABASE_URL is not set; skipping E2E user setup.');
    return;
  }
  assertStagingUrl(url);

  const { accounts, missing } = accountsFromEnv(process.env);
  if (missing.length) console.warn(`Warning: no credentials for E2E ${missing.join(', ')} user(s); skipping those.`);
  if (!accounts.length) return;

  process.env.DATABASE_URL = url;
  const { default: prisma } = await import('../server/db.js');
  try {
    for (const a of accounts) {
      const existing = await prisma.user.findUnique({ where: { username: a.username } });
      if (!existing) {
        await prisma.user.create({
          data: { username: a.username, passwordHash: await bcrypt.hash(a.password, 10), role: a.role },
        });
        console.log(`Created ${a.role} test user.`);
        continue;
      }
      const data: { role?: Role; passwordHash?: string } = {};
      if (existing.role !== a.role) data.role = a.role;
      if (!(await bcrypt.compare(a.password, existing.passwordHash))) {
        data.passwordHash = await bcrypt.hash(a.password, 10);
      }
      if (Object.keys(data).length) {
        await prisma.user.update({ where: { id: existing.id }, data });
        console.log(`Updated ${a.role} test user (${Object.keys(data).join(', ').replace('passwordHash', 'password')}).`);
      } else {
        console.log(`${a.role} test user already up to date.`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('E2E user setup failed:', err.message);
    process.exit(1);
  });
}
