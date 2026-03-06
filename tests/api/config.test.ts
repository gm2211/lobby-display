import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../server/app.js';
import { testPrisma, authenticatedAgent } from '../setup.js';

describe('Config API', () => {
  it('GET /api/config returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/config');
    expect(res.status).toBe(401);
  });

  it('GET /api/config creates default config if none exists', async () => {
    const agent = await authenticatedAgent();
    const res = await agent.get('/api/config');
    expect(res.status).toBe(200);
    expect(res.body.dashboardTitle).toBe('Building Updates');
  });

  it('GET /api/config returns existing config', async () => {
    const agent = await authenticatedAgent();
    await testPrisma.buildingConfig.create({
      data: { dashboardTitle: 'Custom Building' },
    });

    const res = await agent.get('/api/config');
    expect(res.status).toBe(200);
    expect(res.body.dashboardTitle).toBe('Custom Building');
  });

  it('PUT /api/config returns 401 when unauthenticated', async () => {
    const res = await request(app)
      .put('/api/config')
      .send({ dashboardTitle: 'Hacked' });
    expect(res.status).toBe(401);
  });

  it('PUT /api/config updates existing config', async () => {
    const agent = await authenticatedAgent();
    await testPrisma.buildingConfig.create({
      data: { dashboardTitle: 'Renzo' },
    });

    const res = await agent
      .put('/api/config')
      .send({ dashboardTitle: 'Updated Name', scrollSpeed: 20 });

    expect(res.status).toBe(200);
    expect(res.body.dashboardTitle).toBe('Updated Name');
    expect(res.body.scrollSpeed).toBe(20);
  });

  it('PUT /api/config creates config if none exists', async () => {
    const agent = await authenticatedAgent();
    const res = await agent
      .put('/api/config')
      .send({ dashboardTitle: 'New Building' });

    expect(res.status).toBe(200);
    expect(res.body.dashboardTitle).toBe('New Building');
  });
});
