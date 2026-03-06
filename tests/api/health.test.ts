import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../server/app.js';

describe('Health Check', () => {
  it('GET /api/health returns 200 with status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('Version Check', () => {
  it('GET /api/version returns 200 with hash string', async () => {
    const res = await request(app).get('/api/version');
    expect(res.status).toBe(200);
    expect(typeof res.body.hash).toBe('string');
    expect(res.body.hash.length).toBeGreaterThan(0);
  });

  it('GET /api/version does not require auth', async () => {
    const res = await request(app).get('/api/version');
    expect(res.status).toBe(200);
  });
});
