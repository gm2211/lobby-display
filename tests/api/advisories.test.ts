import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../server/app.js';
import { testPrisma, authenticatedAgent } from '../setup.js';

describe('Advisories API', () => {
  it('GET /api/advisories returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/advisories');
    expect(res.status).toBe(401);
  });

  it('GET /api/advisories returns empty array', async () => {
    const agent = await authenticatedAgent();
    const res = await agent.get('/api/advisories');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('POST /api/advisories returns 401 when unauthenticated', async () => {
    const res = await request(app)
      .post('/api/advisories')
      .send({ message: 'Test', active: true });
    expect(res.status).toBe(401);
  });

  it('POST /api/advisories creates an advisory', async () => {
    const agent = await authenticatedAgent();
    const res = await agent
      .post('/api/advisories')
      .send({ message: 'Water shutoff tonight', active: true });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Water shutoff tonight');
    expect(res.body.active).toBe(true);
  });

  it('PUT /api/advisories/:id updates an advisory', async () => {
    const agent = await authenticatedAgent();
    const advisory = await testPrisma.advisory.create({
      data: { message: 'Old message', active: true },
    });

    const res = await agent
      .put(`/api/advisories/${advisory.id}`)
      .send({ message: 'Updated message', active: false });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Updated message');
    expect(res.body.active).toBe(false);
  });

  it('DELETE /api/advisories/:id marks for deletion', async () => {
    const agent = await authenticatedAgent();
    const advisory = await testPrisma.advisory.create({
      data: { message: 'Test', active: true },
    });

    await agent.delete(`/api/advisories/${advisory.id}`);

    const dbAdvisory = await testPrisma.advisory.findUnique({ where: { id: advisory.id } });
    expect(dbAdvisory!.markedForDeletion).toBe(true);
  });

  it('POST /api/advisories/:id/unmark removes deletion mark', async () => {
    const agent = await authenticatedAgent();
    const advisory = await testPrisma.advisory.create({
      data: { message: 'Test', active: true, markedForDeletion: true },
    });

    const res = await agent.post(`/api/advisories/${advisory.id}/unmark`);
    expect(res.status).toBe(200);

    const dbAdvisory = await testPrisma.advisory.findUnique({ where: { id: advisory.id } });
    expect(dbAdvisory!.markedForDeletion).toBe(false);
  });
});
