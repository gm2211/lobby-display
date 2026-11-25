/**
 * sync-prod-to-staging.ts — Copy prod's live (published) dashboard content into staging.
 *
 * READ-ONLY ON PROD:
 *   Prod is only ever reached through its public HTTPS API (never its database —
 *   see CLAUDE.md "Production database"). The script logs in with a read-only
 *   VIEWER account, does a single GET /api/snapshots/latest, and logs out.
 *   No POST/PUT/DELETE is sent to any prod data endpoint.
 *
 * WRITES ONLY TO STAGING:
 *   Writes go straight to the staging Postgres (STAGING_DATABASE_URL). The script
 *   refuses to run unless that URL's database name contains "staging".
 *   It replaces staging's services/events/advisories/config with prod's published
 *   state and records it as a new published snapshot (publishedBy "prod-sync").
 *   Staging users/sessions are untouched.
 *
 * IMAGES:
 *   Uploaded images live on prod's disk, so /images/uploads/* URLs are rewritten
 *   to absolute prod URLs (those paths are served publicly, read-only).
 *
 * USAGE:
 *   PROD_URL=https://seven7-hudson-dashboard-r8ib.onrender.com \
 *   PROD_SYNC_USER=<viewer> PROD_SYNC_PASS=<pass> \
 *   STAGING_DATABASE_URL=<staging external connection string> \
 *   npx tsx scripts/sync-prod-to-staging.ts [--apply]
 *
 *   Without --apply it is a dry run: it fetches prod and prints what it would write.
 *   Also runnable from GitHub Actions: .github/workflows/sync-prod-to-staging.yml
 */
import type { SnapshotData } from '../server/routes/snapshots.js';

const DEFAULT_PROD_URL = 'https://seven7-hudson-dashboard-r8ib.onrender.com';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Error: ${name} is required`);
    process.exit(1);
  }
  return v;
}

/** Minimal cookie jar: keep the session cookie between requests. */
class ProdClient {
  private cookie = '';
  constructor(private base: string) {}

  async request(method: 'GET' | 'POST', path: string, body?: unknown, csrf?: string) {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.cookie) headers.Cookie = this.cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (csrf) headers['x-csrf-token'] = csrf;
    const res = await fetch(this.base + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    });
    const setCookie = res.headers.getSetCookie?.() ?? [];
    if (setCookie.length) this.cookie = setCookie.map(c => c.split(';')[0]).join('; ');
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  }
}

/** /api/snapshots/latest returns a flat API shape; convert back to snapshot sections. */
interface LatestApi {
  services: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  advisories: Array<Record<string, unknown>>;
  config: Record<string, unknown> | null;
}

export function toSnapshotData(api: LatestApi, prodBase: string): SnapshotData {
  const abs = (url: unknown) =>
    typeof url === 'string' && url.startsWith('/images/uploads/') ? prodBase + url : url;
  const c = (api.config ?? {}) as Record<string, any>;
  const live = <T extends Record<string, unknown>>(items: T[]) => items.filter(i => !i.markedForDeletion);

  const customLogos = (() => {
    if (typeof c.customLogos !== 'string' || !c.customLogos) return c.customLogos;
    try {
      const parsed = JSON.parse(c.customLogos);
      return JSON.stringify(
        Array.isArray(parsed)
          ? parsed.map(l => (l && typeof l === 'object' ? { ...l, url: abs(l.url) } : abs(l)))
          : parsed,
      );
    } catch {
      return c.customLogos;
    }
  })();

  return {
    config: api.config
      ? {
          dashboardTitle: c.dashboardTitle,
          titleFontSize: c.titleFontSize,
          timezone: c.timezone,
          logoUrl: abs(c.logoUrl) as string,
          customLogos,
          themePreset: c.themePreset,
          fontFamily: c.fontFamily,
          fontScale: c.fontScale,
          colorPrimary: c.colorPrimary,
          colorSecondary: c.colorSecondary,
        }
      : null,
    services: {
      items: live(api.services) as any,
      scrollSpeed: c.servicesScrollSpeed,
      servicesFontSize: c.servicesFontSize,
      notesFontSize: c.notesFontSize,
      notesFontWeight: c.notesFontWeight,
    },
    events: {
      items: live(api.events).map(e => ({ ...e, imageUrl: abs(e.imageUrl) })) as any,
      scrollSpeed: c.scrollSpeed,
    },
    advisories: { items: live(api.advisories) as any, tickerSpeed: c.tickerSpeed },
  };
}

export function assertStagingUrl(url: string): void {
  let dbName = '';
  try {
    dbName = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch {
    throw new Error('STAGING_DATABASE_URL is not a valid URL');
  }
  if (!/staging/i.test(dbName)) {
    throw new Error(`Refusing to write: database "${dbName}" is not a staging database`);
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  const prodBase = (process.env.PROD_URL || DEFAULT_PROD_URL).replace(/\/$/, '');
  const user = requireEnv('PROD_SYNC_USER');
  const pass = requireEnv('PROD_SYNC_PASS');
  const stagingUrl = apply ? requireEnv('STAGING_DATABASE_URL') : process.env.STAGING_DATABASE_URL;
  if (stagingUrl) assertStagingUrl(stagingUrl);

  // ── 1. Read prod (API only) ───────────────────────────────
  console.log(`Reading published content from ${prodBase} (read-only)…`);
  const prod = new ProdClient(prodBase);
  const me = await prod.request('POST', '/api/auth/login', { username: user, password: pass });
  if (me?.role !== 'VIEWER') {
    console.warn(`Warning: PROD_SYNC_USER has role ${me?.role}; a VIEWER account is recommended.`);
  }
  let latest: LatestApi;
  try {
    latest = await prod.request('GET', '/api/snapshots/latest');
  } finally {
    // Log out so no session is left behind on prod.
    try {
      const { token } = await prod.request('GET', '/api/auth/csrf');
      await prod.request('POST', '/api/auth/logout', {}, token);
    } catch (err) {
      console.warn('Warning: prod logout failed (session will expire on its own):', (err as Error).message);
    }
  }

  const data = toSnapshotData(latest, prodBase);
  console.log(
    `Prod published state: ${data.services?.items?.length ?? 0} services, ` +
      `${data.events?.items?.length ?? 0} events, ${data.advisories?.items?.length ?? 0} advisories, ` +
      `config: ${data.config ? `"${data.config.dashboardTitle}"` : 'none'}`,
  );

  if (!apply) {
    console.log('\nDry run — nothing written. Re-run with --apply to write to staging.');
    return;
  }

  // ── 2. Write staging (DB) ─────────────────────────────────
  process.env.DATABASE_URL = stagingUrl!;
  const { default: prisma } = await import('../server/db.js');
  const { restoreFromSnapshot } = await import('../server/routes/snapshots.js');
  try {
    if (!(await prisma.buildingConfig.findFirst())) await prisma.buildingConfig.create({ data: {} });
    await restoreFromSnapshot(data);
    const last = await prisma.publishedSnapshot.findFirst({ orderBy: { version: 'desc' } });
    const version = (last?.version ?? 0) + 1;
    await prisma.publishedSnapshot.create({
      data: { version, data: JSON.stringify(data), publishedBy: 'prod-sync' },
    });
    console.log(`Staging updated and published as snapshot v${version}.`);
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('Sync failed:', err.message);
    process.exit(1);
  });
}
