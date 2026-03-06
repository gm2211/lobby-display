import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../server/app.js';
import { testPrisma, authenticatedAgent } from '../setup.js';

describe('Services API', () => {
  it('GET /api/services returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/services');
    expect(res.status).toBe(401);
  });

  it('GET /api/services returns empty array when no services', async () => {
    const agent = await authenticatedAgent();
    const res = await agent.get('/api/services');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('POST /api/services returns 401 when unauthenticated', async () => {
    const res = await request(app)
      .post('/api/services')
      .send({ name: 'HVAC', status: 'Operational', sortOrder: 0 });
    expect(res.status).toBe(401);
  });

  it('POST /api/services creates a service', async () => {
    const agent = await authenticatedAgent();
    const res = await agent
      .post('/api/services')
      .send({ name: 'HVAC', status: 'Operational', sortOrder: 0 });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('HVAC');
    expect(res.body.status).toBe('Operational');
    expect(res.body.id).toBeDefined();
  });

  it('GET /api/services returns created services sorted by sortOrder', async () => {
    const agent = await authenticatedAgent();
    await testPrisma.service.createMany({
      data: [
        { name: 'Elevators', status: 'Operational', sortOrder: 1 },
        { name: 'HVAC', status: 'Operational', sortOrder: 0 },
      ],
    });

    const res = await agent.get('/api/services');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].name).toBe('HVAC');
    expect(res.body[1].name).toBe('Elevators');
  });

  it('PUT /api/services/:id updates a service', async () => {
    const agent = await authenticatedAgent();
    const service = await testPrisma.service.create({
      data: { name: 'HVAC', status: 'Operational', sortOrder: 0 },
    });

    const res = await agent
      .put(`/api/services/${service.id}`)
      .send({ status: 'Maintenance' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Maintenance');
    expect(res.body.name).toBe('HVAC');
  });

  it('DELETE /api/services/:id marks service for deletion', async () => {
    const agent = await authenticatedAgent();
    const service = await testPrisma.service.create({
      data: { name: 'HVAC', status: 'Operational', sortOrder: 0 },
    });

    const res = await agent.delete(`/api/services/${service.id}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Still appears in list (soft delete, not hard delete)
    const listRes = await agent.get('/api/services');
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].markedForDeletion).toBe(true);
  });

  it('POST /api/services/:id/unmark removes deletion mark', async () => {
    const agent = await authenticatedAgent();
    const service = await testPrisma.service.create({
      data: { name: 'HVAC', status: 'Operational', sortOrder: 0, markedForDeletion: true },
    });

    const res = await agent.post(`/api/services/${service.id}/unmark`);
    expect(res.status).toBe(200);

    const listRes = await agent.get('/api/services');
    expect(listRes.body[0].markedForDeletion).toBe(false);
  });

  it('PUT /api/services/invalid returns 400', async () => {
    const agent = await authenticatedAgent();
    const res = await agent
      .put('/api/services/abc')
      .send({ status: 'Operational' });

    expect(res.status).toBe(400);
  });

  it('returns all services regardless of deletedAt field', async () => {
    const agent = await authenticatedAgent();
    await testPrisma.service.create({
      data: { name: 'First', status: 'Operational', sortOrder: 0, deletedAt: new Date() },
    });
    await testPrisma.service.create({
      data: { name: 'Second', status: 'Operational', sortOrder: 1 },
    });

    const res = await agent.get('/api/services');
    // deletedAt is vestigial — markedForDeletion is the real soft-delete mechanism
    expect(res.body).toHaveLength(2);
  });

  it('sets Cache-Control: no-store on API responses', async () => {
    const agent = await authenticatedAgent();
    const res = await agent.get('/api/services');
    expect(res.headers['cache-control']).toBe('no-store');
  });
});
