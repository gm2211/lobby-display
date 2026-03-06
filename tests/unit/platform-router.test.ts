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
  return app;
}

describe('Platform Router', () => {
  it('is mountable as an Express Router', () => {
    expect(() => buildTestApp()).not.toThrow();
  });

  it('GET /api/platform/announcements returns status ok', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/api/platform/announcements');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', module: 'announcements' });
  });

  it('GET /api/platform/maintenance returns status ok', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/api/platform/maintenance');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', module: 'maintenance' });
  });

  it('GET /api/platform/amenities returns status ok', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/api/platform/amenities');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', module: 'amenities' });
  });

  it('GET /api/platform/bookings is a real route (not a placeholder)', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/api/platform/bookings');
    // Bookings is now a real authenticated route (not the old placeholder that returned 200).
    // Without session middleware in this test app, the route returns a non-200 status.
    expect(res.status).not.toBe(200);
    // No placeholder JSON — route is real
    expect(res.body).not.toMatchObject({ status: 'ok', module: 'bookings' });
  });

  it('GET /api/platform/parcels returns status ok', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/api/platform/parcels');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', module: 'parcels' });
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
