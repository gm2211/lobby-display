import { describe, it, expect } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { testPrisma, authenticatedAgent } from '../setup.js';
import app from '../../server/app.js';

describe('Platform API', () => {
  describe('Authentication', () => {
    it('GET /api/platform/profile returns 401 when unauthenticated', async () => {
      await request(app).get('/api/platform/profile').expect(401);
    });

    it('PUT /api/platform/profile returns 401 when unauthenticated', async () => {
      // requireAuth middleware runs before CSRF check on the inner route
      // but the platform router uses requireAuth at the router level
      // so the auth check fires first
      await request(app).put('/api/platform/profile').expect(401);
    });

    it('GET /api/platform/notifications returns 401 when unauthenticated', async () => {
      await request(app).get('/api/platform/notifications').expect(401);
    });
  });

  describe('GET /api/platform/profile', () => {
    it('returns the current user profile', async () => {
      const agent = await authenticatedAgent('ADMIN');
      const res = await agent.get('/api/platform/profile').expect(200);
      expect(res.body).toMatchObject({
        username: 'testadmin',
        role: 'ADMIN',
        displayName: '',
        phone: '',
        emergencyContact: '',
        unitNumber: '',
        unitFloor: '',
      });
      expect(res.body.id).toBeDefined();
      // Should not expose password hash
      expect(res.body.passwordHash).toBeUndefined();
    });

    it('works for VIEWER role', async () => {
      const agent = await authenticatedAgent('VIEWER');
      const res = await agent.get('/api/platform/profile').expect(200);
      expect(res.body.role).toBe('VIEWER');
    });

    it('returns populated fields when they exist', async () => {
      const passwordHash = await bcrypt.hash('pass1234', 4);
      await testPrisma.user.create({
        data: {
          username: 'profileuser',
          passwordHash,
          role: 'EDITOR',
          displayName: 'Profile User',
          phone: '(555) 000-9999',
          emergencyContact: 'Emergency Contact',
          unitNumber: '5A',
          unitFloor: '5',
        },
      });

      const agent = request.agent(app);
      await agent.post('/api/auth/login').send({ username: 'profileuser', password: 'pass1234' }).expect(200);
      const csrf = await agent.get('/api/auth/csrf').expect(200);
      (agent as any).post = (url: string) => (request.agent(app) as any).post(url).set('X-CSRF-Token', csrf.body.token);

      const res = await agent.get('/api/platform/profile').expect(200);
      expect(res.body).toMatchObject({
        displayName: 'Profile User',
        phone: '(555) 000-9999',
        emergencyContact: 'Emergency Contact',
        unitNumber: '5A',
        unitFloor: '5',
      });
    });
  });

  describe('PUT /api/platform/profile', () => {
    it('updates profile fields', async () => {
      const agent = await authenticatedAgent('ADMIN');
      const res = await agent.put('/api/platform/profile').send({
        displayName: 'Updated Name',
        phone: '(555) 111-2222',
        emergencyContact: 'Jane Doe',
      }).expect(200);

      expect(res.body).toMatchObject({
        displayName: 'Updated Name',
        phone: '(555) 111-2222',
        emergencyContact: 'Jane Doe',
      });
    });

    it('rejects displayName longer than 100 characters', async () => {
      const agent = await authenticatedAgent('ADMIN');
      await agent.put('/api/platform/profile').send({
        displayName: 'a'.repeat(101),
      }).expect(400);
    });

    it('rejects phone longer than 30 characters', async () => {
      const agent = await authenticatedAgent('ADMIN');
      await agent.put('/api/platform/profile').send({
        phone: '1'.repeat(31),
      }).expect(400);
    });

    it('rejects emergencyContact longer than 200 characters', async () => {
      const agent = await authenticatedAgent('ADMIN');
      await agent.put('/api/platform/profile').send({
        emergencyContact: 'x'.repeat(201),
      }).expect(400);
    });

    it('accepts partial updates (only some fields)', async () => {
      const agent = await authenticatedAgent('ADMIN');
      // Only update displayName
      const res = await agent.put('/api/platform/profile').send({
        displayName: 'Only This Field',
      }).expect(200);
      expect(res.body.displayName).toBe('Only This Field');
      expect(res.body.phone).toBe('');
    });
  });

  describe('POST /api/platform/change-password', () => {
    it('changes password with correct current password', async () => {
      const agent = await authenticatedAgent('ADMIN');
      const res = await agent.post('/api/platform/change-password').send({
        currentPassword: 'testpassword123',
        newPassword: 'newpassword456',
      }).expect(200);
      expect(res.body.ok).toBe(true);

      // Verify can login with new password
      const loginRes = await request(app).post('/api/auth/login').send({
        username: 'testadmin',
        password: 'newpassword456',
      }).expect(200);
      expect(loginRes.body.username).toBe('testadmin');
    });

    it('rejects incorrect current password', async () => {
      const agent = await authenticatedAgent('ADMIN');
      await agent.post('/api/platform/change-password').send({
        currentPassword: 'wrongpassword',
        newPassword: 'newpassword456',
      }).expect(400);
    });

    it('rejects new password shorter than 8 characters', async () => {
      const agent = await authenticatedAgent('ADMIN');
      await agent.post('/api/platform/change-password').send({
        currentPassword: 'testpassword123',
        newPassword: 'short',
      }).expect(400);
    });

    it('requires both currentPassword and newPassword', async () => {
      const agent = await authenticatedAgent('ADMIN');
      await agent.post('/api/platform/change-password').send({
        currentPassword: 'testpassword123',
      }).expect(400);

      await agent.post('/api/platform/change-password').send({
        newPassword: 'newpassword456',
      }).expect(400);
    });
  });

  describe('GET /api/platform/notifications', () => {
    it('returns default notification prefs when none set', async () => {
      const agent = await authenticatedAgent('ADMIN');
      const res = await agent.get('/api/platform/notifications').expect(200);
      expect(res.body).toMatchObject({
        emailEvents: true,
        emailAdvisories: true,
        emailMaintenance: true,
        pushEvents: false,
        pushAdvisories: false,
        pushMaintenance: false,
      });
    });
  });

  describe('PUT /api/platform/notifications', () => {
    it('updates notification preferences', async () => {
      const agent = await authenticatedAgent('ADMIN');
      const prefs = {
        emailEvents: false,
        emailAdvisories: true,
        emailMaintenance: false,
        pushEvents: true,
        pushAdvisories: false,
        pushMaintenance: true,
      };
      const putRes = await agent.put('/api/platform/notifications').send(prefs).expect(200);
      expect(putRes.body.ok).toBe(true);

      // Verify the saved prefs
      const getRes = await agent.get('/api/platform/notifications').expect(200);
      expect(getRes.body).toMatchObject(prefs);
    });

    it('rejects non-boolean values', async () => {
      const agent = await authenticatedAgent('ADMIN');
      await agent.put('/api/platform/notifications').send({
        emailEvents: 'yes',
      }).expect(400);
    });

    it('accepts partial preference updates', async () => {
      const agent = await authenticatedAgent('ADMIN');
      await agent.put('/api/platform/notifications').send({
        emailEvents: false,
      }).expect(200);

      const getRes = await agent.get('/api/platform/notifications').expect(200);
      // emailEvents was updated
      expect(getRes.body.emailEvents).toBe(false);
      // Others remain at defaults
      expect(getRes.body.emailAdvisories).toBe(true);
    });
  });
});
