/**
 * Regression tests for the security/data-integrity audit fixes.
 * Each block names the hole it keeps closed.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../../server/app.js';
import { testPrisma, authenticatedAgent } from '../setup.js';
import { resetLoginRateLimit } from '../../server/routes/auth.js';
import { getThemeStyleBlock, invalidateThemeCache } from '../../server/themeCSS.js';
import { restoreFromSnapshot } from '../../server/routes/snapshots.js';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function createUser(username: string, password: string, role: 'ADMIN' | 'EDITOR' | 'VIEWER') {
  return testPrisma.user.create({
    data: { username, passwordHash: await bcrypt.hash(password, 4), role },
  });
}

async function login(username: string, password: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ username, password });
  const csrf = (await agent.get('/api/auth/csrf')).body?.token as string;
  return { agent, res, csrf };
}

beforeEach(() => {
  resetLoginRateLimit();
  invalidateThemeCache();
});

describe('theme values cannot inject markup', () => {
  it('PUT /api/config rejects a fontFamily that could close the <style> block', async () => {
    const agent = await authenticatedAgent('EDITOR');
    const res = await agent
      .put('/api/config')
      .send({ fontFamily: 'x}</style><script>alert(1)</script>' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/fontFamily/);
  });

  it('PUT /api/config rejects non-hex colors and accepts the built-in fonts', async () => {
    const agent = await authenticatedAgent('EDITOR');
    expect((await agent.put('/api/config').send({ colorPrimary: 'red;}' })).status).toBe(400);
    const ok = await agent
      .put('/api/config')
      .send({ fontFamily: "'Open Sans', sans-serif", colorPrimary: '#1a2b3c', colorSecondary: '' });
    expect(ok.status).toBe(200);
    expect(ok.body.fontFamily).toBe("'Open Sans', sans-serif");
  });

  it('PUT /api/config ignores unknown fields instead of failing', async () => {
    const agent = await authenticatedAgent('EDITOR');
    const res = await agent.put('/api/config').send({ id: 999, dashboardTitle: 'Lobby', bogus: true });
    expect(res.status).toBe(200);
    expect(res.body.dashboardTitle).toBe('Lobby');
    expect(res.body.id).not.toBe(999);
  });

  it('an unsafe value already in the database is not rendered into the page', async () => {
    await testPrisma.buildingConfig.create({
      data: { fontFamily: '</style><script>alert(1)</script>', colorPrimary: '</style><b>' },
    });
    const block = await getThemeStyleBlock();
    expect(block).not.toContain('<script>');
    expect(block).not.toContain('<b>');
    expect(block.match(/<\/style>/g)).toHaveLength(1);
  });
});

describe('uploads', () => {
  it('stores the file with an image extension, whatever the uploaded filename says', async () => {
    const agent = await authenticatedAgent('EDITOR');
    const body = Buffer.concat([PNG_MAGIC, Buffer.from('<script>alert(1)</script>')]);
    const res = await agent
      .post('/api/upload')
      .attach('file', body, { filename: 'evil.html', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/^\/images\/uploads\/[\w-]+\.png$/);
  });

  it('serves uploaded images from /images/uploads as images', async () => {
    const agent = await authenticatedAgent('EDITOR');
    const up = await agent
      .post('/api/upload')
      .attach('file', PNG_MAGIC, { filename: 'photo.png', contentType: 'image/png' });
    const res = await request(app).get(up.body.url);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('returns 404 (not the app page) for a missing upload', async () => {
    const res = await request(app).get('/images/uploads/nope.png');
    expect(res.status).toBe(404);
  });
});

describe('sessions follow the user table', () => {
  it('a deleted user is logged out immediately', async () => {
    const victim = await createUser('gone', 'password123', 'EDITOR');
    const { agent, csrf } = await login('gone', 'password123');
    expect((await agent.get('/api/auth/me')).body?.username).toBe('gone');

    await testPrisma.user.delete({ where: { id: victim.id } });

    expect((await agent.get('/api/auth/me')).body).toBeNull();
    const write = await agent.post('/api/advisories').set('X-CSRF-Token', csrf).send({ message: 'x' });
    expect(write.status).toBe(401);
  });

  it('a demoted user loses write access without logging in again', async () => {
    const user = await createUser('demoted', 'password123', 'EDITOR');
    const { agent, csrf } = await login('demoted', 'password123');

    await testPrisma.user.update({ where: { id: user.id }, data: { role: 'VIEWER' } });

    const write = await agent.post('/api/advisories').set('X-CSRF-Token', csrf).send({ message: 'x' });
    expect(write.status).toBe(403);
    expect((await agent.get('/api/auth/me')).body?.role).toBe('VIEWER');
  });

  it('changing a password signs out that user\'s other sessions, but not the admin doing it', async () => {
    const admin = await authenticatedAgent('ADMIN');
    const other = await createUser('other', 'password123', 'EDITOR');
    const otherSession = await login('other', 'password123');

    await admin.put(`/api/users/${other.id}`).send({ password: 'new-password-1' }).expect(200);
    expect((await otherSession.agent.get('/api/auth/me')).body).toBeNull();

    const me = (await admin.get('/api/auth/me')).body;
    await admin.put(`/api/users/${me.id}`).send({ password: 'my-new-password' }).expect(200);
    expect((await admin.get('/api/auth/me')).body?.username).toBe(me.username);
  });
});

describe('lobby screen (VIEWER) sessions', () => {
  it('get a cookie that lasts about a year from login', async () => {
    await createUser('lobby', 'password123', 'VIEWER');
    const { res } = await login('lobby', 'password123');
    const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find(c => c.startsWith('connect.sid='));
    const expires = new Date(/Expires=([^;]+)/.exec(cookie ?? '')?.[1] ?? 0).getTime();
    const days = (expires - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(360);
  });

  it('have the cookie re-sent once the last refresh is over a day old', async () => {
    await createUser('lobby', 'password123', 'VIEWER');
    const { agent } = await login('lobby', 'password123');

    // Fresh login: nothing to refresh yet
    expect((await agent.get('/api/auth/me')).headers['set-cookie']).toBeUndefined();

    // Age the stored session by two days
    const row = (await testPrisma.session.findMany())[0];
    const data = JSON.parse(row.data);
    data.lastRefreshAt = Date.now() - 2 * 86_400_000;
    await testPrisma.session.update({ where: { id: row.id }, data: { data: JSON.stringify(data) } });

    const res = await agent.get('/api/auth/me');
    expect(String(res.headers['set-cookie'])).toContain('connect.sid=');
  });
});

describe('login hardening', () => {
  it('rejects non-string credentials with 400 instead of a database error', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: { not: 'x' }, password: 'y' });
    expect(res.status).toBe(400);
  });

  it('locks a username after repeated failures', async () => {
    await createUser('target', 'password123', 'ADMIN');
    let last = 0;
    for (let i = 0; i < 21; i++) {
      resetIpOnly();
      last = (await request(app).post('/api/auth/login').send({ username: 'target', password: 'wrong' })).status;
    }
    expect(last).toBe(429);
    // Even the right password is refused while locked
    resetIpOnly();
    expect((await request(app).post('/api/auth/login').send({ username: 'target', password: 'password123' })).status).toBe(429);
  });
});

/** Clear only the per-IP counter, as if each attempt came from a different address. */
function resetIpOnly() {
  resetLoginRateLimit('ip');
}

describe('error responses', () => {
  it('a duplicate username gives a readable 409, not Prisma internals', async () => {
    const admin = await authenticatedAgent('ADMIN');
    await admin.post('/api/users').send({ username: 'dup', password: 'password123' }).expect(201);
    const res = await admin.post('/api/users').send({ username: 'dup', password: 'password123' });
    expect(res.status).toBe(409);
    expect(res.body.message).not.toMatch(/prisma|invocation/i);
  });

  it('updating a missing item gives 404', async () => {
    const agent = await authenticatedAgent('EDITOR');
    expect((await agent.put('/api/advisories/999999').send({ message: 'x' })).status).toBe(404);
  });

  it('unknown fields on an item give 400 without leaking the schema', async () => {
    const agent = await authenticatedAgent('EDITOR');
    const res = await agent.post('/api/services').send({ name: 'Lift', nope: 1 });
    expect(res.status).toBe(400);
    expect(res.body.message).not.toMatch(/prisma|invocation|sortOrder/i);
  });

  it('unknown /api routes return JSON 404', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/json/);
  });
});

describe('user management guards', () => {
  it('the only admin cannot be demoted', async () => {
    const admin = await authenticatedAgent('ADMIN');
    const me = (await admin.get('/api/auth/me')).body;
    const res = await admin.put(`/api/users/${me.id}`).send({ role: 'EDITOR' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/only admin/i);
  });

  it('new users need a password of at least 8 characters', async () => {
    const admin = await authenticatedAgent('ADMIN');
    expect((await admin.post('/api/users').send({ username: 'short', password: 'abc' })).status).toBe(400);
  });
});

describe('restoring snapshots', () => {
  it('discard keeps service status history', async () => {
    const agent = await authenticatedAgent('EDITOR');
    const svc = (await agent.post('/api/services').send({ name: 'Elevator', status: 'Operational' })).body;
    await agent.post('/api/snapshots').expect(200);
    await agent.put(`/api/services/${svc.id}`).send({ status: 'Outage' }).expect(200);
    expect(await testPrisma.serviceStatusLog.count()).toBe(2);

    await agent.post('/api/snapshots/discard').expect(200);

    expect(await testPrisma.serviceStatusLog.count()).toBe(2);
    expect((await testPrisma.service.findUnique({ where: { id: svc.id } }))?.status).toBe('Operational');
  });

  it('discard still removes draft-only services and un-marks deletions', async () => {
    const agent = await authenticatedAgent('EDITOR');
    const kept = (await agent.post('/api/services').send({ name: 'Kept' })).body;
    await agent.post('/api/snapshots').expect(200);
    await agent.post('/api/services').send({ name: 'Draft only' }).expect(200);
    await agent.delete(`/api/services/${kept.id}`).expect(200);

    await agent.post('/api/snapshots/discard').expect(200);

    const rows = await testPrisma.service.findMany();
    expect(rows.map(r => r.name)).toEqual(['Kept']);
    expect(rows[0].markedForDeletion).toBe(false);
  });

  it('restores old flat-format snapshots instead of emptying the draft', async () => {
    await restoreFromSnapshot({
      services: [{ id: 1, name: 'Legacy svc', status: 'Operational', sortOrder: 0, lastChecked: new Date().toISOString() }],
      events: [{ id: 1, title: 'Legacy event', subtitle: '', details: ['a'], imageUrl: '', accentColor: '', sortOrder: 0 }],
      advisories: [{ id: 1, message: 'Legacy advisory', active: true }],
    } as never);
    expect(await testPrisma.service.count()).toBe(1);
    expect(await testPrisma.event.count()).toBe(1);
    expect(await testPrisma.advisory.count()).toBe(1);
  });
});
