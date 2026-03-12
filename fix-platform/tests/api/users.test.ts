import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../server/app.js';
import { testPrisma, authenticatedAgent } from '../setup.js';

describe('Users API — RBAC enforcement', () => {
  describe('unauthenticated', () => {
    it('GET /api/users returns 401', async () => {
      const res = await request(app).get('/api/users');
      expect(res.status).toBe(401);
    });

    it('POST /api/users returns 401', async () => {
      const res = await request(app)
        .post('/api/users')
        .send({ username: 'newuser', password: 'pass123' });
      expect(res.status).toBe(401);
    });
  });

  describe('VIEWER role', () => {
    it('GET /api/users returns 403', async () => {
      const agent = await authenticatedAgent('VIEWER');
      const res = await agent.get('/api/users');
      expect(res.status).toBe(403);
    });

    it('POST /api/users returns 403', async () => {
      const agent = await authenticatedAgent('VIEWER');
      const res = await agent
        .post('/api/users')
        .send({ username: 'newuser', password: 'pass123' });
      expect(res.status).toBe(403);
    });
  });

  describe('EDITOR role', () => {
    it('GET /api/users returns 403', async () => {
      const agent = await authenticatedAgent('EDITOR');
      const res = await agent.get('/api/users');
      expect(res.status).toBe(403);
    });

    it('POST /api/users returns 403', async () => {
      const agent = await authenticatedAgent('EDITOR');
      const res = await agent
        .post('/api/users')
        .send({ username: 'newuser', password: 'pass123' });
      expect(res.status).toBe(403);
    });
  });

  describe('ADMIN role', () => {
    it('GET /api/users returns 200', async () => {
      const agent = await authenticatedAgent();
      const res = await agent.get('/api/users');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('POST /api/users creates a user (201)', async () => {
      const agent = await authenticatedAgent();
      const res = await agent
        .post('/api/users')
        .send({ username: 'neweditor', password: 'pass123', role: 'EDITOR' });
      expect(res.status).toBe(201);
      expect(res.body.username).toBe('neweditor');
      expect(res.body.role).toBe('EDITOR');
      expect(res.body.passwordHash).toBeUndefined();
    });

    it('PUT /api/users/:id updates a user (200)', async () => {
      const agent = await authenticatedAgent();

      // Create a user to edit
      const created = await agent
        .post('/api/users')
        .send({ username: 'toedit', password: 'pass123', role: 'EDITOR' });
      expect(created.status).toBe(201);

      const res = await agent
        .put(`/api/users/${created.body.id}`)
        .send({ username: 'edited' });
      expect(res.status).toBe(200);
      expect(res.body.username).toBe('edited');
    });

    it('POST /api/users rejects invalid role with 400', async () => {
      const agent = await authenticatedAgent();
      const res = await agent
        .post('/api/users')
        .send({ username: 'badrole', password: 'pass12345', role: 'SUPERADMIN' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/invalid role/i);
    });

    it('PUT /api/users/:id rejects invalid role with 400', async () => {
      const agent = await authenticatedAgent();
      const created = await agent
        .post('/api/users')
        .send({ username: 'roletest', password: 'pass12345', role: 'VIEWER' });
      expect(created.status).toBe(201);

      const res = await agent
        .put(`/api/users/${created.body.id}`)
        .send({ role: 'BOGUS' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/invalid role/i);
    });

    it('DELETE /api/users/:id deletes a user (200)', async () => {
      const agent = await authenticatedAgent();

      // Create a user to delete
      const created = await agent
        .post('/api/users')
        .send({ username: 'todelete', password: 'pass123', role: 'VIEWER' });
      expect(created.status).toBe(201);

      const res = await agent.delete(`/api/users/${created.body.id}`);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      // Verify user is gone
      const list = await agent.get('/api/users');
      const usernames = list.body.map((u: { username: string }) => u.username);
      expect(usernames).not.toContain('todelete');
    });
  });
});
