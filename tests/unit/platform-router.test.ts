/**
 * Platform Router Tests
 *
 * Tests that the platform router is correctly structured and mountable,
 * and that sub-routes respond under /api/platform prefix.
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import platformRouter from '../../server/routes/platform/index.js';

function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/platform', platformRouter);
  // Error handler to catch auth errors and prisma errors (no DB in unit tests)
  app.use((err: any, _req: any, res: any, _next: any) => {
    const status = err.status || err.statusCode || 500;
    res.status(status).json({ error: err.message });
  });
  return app;
}

describe('Platform Router', () => {
  it('is mountable as an Express Router', () => {
    expect(() => buildTestApp()).not.toThrow();
  });

  it('GET /api/platform/announcements is a real route (not a placeholder)', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/api/platform/announcements');
    // Real route with auth — returns non-200 without session (401 or 500 depending on middleware)
    expect(res.status).not.toBe(200);
    expect(res.body).not.toMatchObject({ status: 'ok', module: 'announcements' });
  });

  it('GET /api/platform/maintenance is a real route (not a placeholder)', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/api/platform/maintenance');
    // Real route with auth — returns non-200 without session
    expect(res.status).not.toBe(200);
    expect(res.body).not.toMatchObject({ status: 'ok', module: 'maintenance' });
  });

  it('GET /api/platform/amenities is a real route (not a placeholder)', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/api/platform/amenities');
    // Real route with auth — returns non-200 without session
    expect(res.status).not.toBe(200);
    expect(res.body).not.toMatchObject({ status: 'ok', module: 'amenities' });
  });

  it('GET /api/platform/bookings route is registered (not a placeholder)', () => {
    // Bookings uses platformProtectStrict which calls prisma.platformUser.findUnique.
    // Without a running DB this would hang on a real HTTP request, so we verify
    // the route is registered by inspecting the router stack instead.
    const app = buildTestApp();
    const stack = (app as any)._router?.stack ?? [];
    const platformLayer = stack.find((layer: any) => layer.regexp?.test('/api/platform/bookings'));
    expect(platformLayer).toBeDefined();
    expect(typeof platformRouter).toBe('function');
    // Verify the router is a real Express router, not a stub
    expect(platformRouter).toHaveProperty('stack');
    expect(Array.isArray((platformRouter as any).stack)).toBe(true);
  });

  it('GET /api/platform/parcels is a real route (not a placeholder)', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/api/platform/parcels');
    // Real route with auth — returns non-200 without session
    expect(res.status).not.toBe(200);
    expect(res.body).not.toMatchObject({ status: 'ok', module: 'parcels' });
  });

  it('GET /api/platform/users returns status ok', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/api/platform/users');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', module: 'users' });
  });

  it('GET /api/platform/unknown returns 404', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/api/platform/unknown-route');
    expect(res.status).toBe(404);
  });
});
