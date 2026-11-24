import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../server/app.js';
import { testPrisma, authenticatedAgent } from '../setup.js';

describe('Events API', () => {
  it('GET /api/events returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/events');
    expect(res.status).toBe(401);
  });

  it('GET /api/events returns empty array when no events', async () => {
    const agent = await authenticatedAgent();
    const res = await agent.get('/api/events');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('POST /api/events returns 401 when unauthenticated', async () => {
    const res = await request(app)
      .post('/api/events')
      .send({ title: 'Yoga Class', subtitle: '', details: [], sortOrder: 0 });
    expect(res.status).toBe(401);
  });

  it('POST /api/events creates an event with JSON details', async () => {
    const agent = await authenticatedAgent();
    const res = await agent
      .post('/api/events')
      .send({
        title: 'Yoga Class',
        subtitle: 'Weekly yoga',
        details: ['Tuesday at 7 AM', 'Studio, 10th Floor'],
        imageUrl: '/images/yoga.jpg',
        accentColor: '#e91e63',
        sortOrder: 0,
      });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Yoga Class');
    // details should come back as parsed array, not JSON string
    expect(res.body.details).toEqual(['Tuesday at 7 AM', 'Studio, 10th Floor']);
  });

  it('GET /api/events returns events with parsed details', async () => {
    const agent = await authenticatedAgent();
    await testPrisma.event.create({
      data: {
        title: 'Brunch',
        subtitle: 'Community event',
        details: JSON.stringify(['Saturday 10 AM', 'Free for all']),
        sortOrder: 0,
      },
    });

    const res = await agent.get('/api/events');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].details).toEqual(['Saturday 10 AM', 'Free for all']);
    expect(typeof res.body[0].details).not.toBe('string');
  });

  it('PUT /api/events/:id updates event and stringifies details', async () => {
    const agent = await authenticatedAgent();
    const event = await testPrisma.event.create({
      data: {
        title: 'Old Title',
        subtitle: 'Sub',
        details: JSON.stringify(['detail1']),
        sortOrder: 0,
      },
    });

    const res = await agent
      .put(`/api/events/${event.id}`)
      .send({ title: 'New Title', details: ['detail1', 'detail2'] });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('New Title');
    expect(res.body.details).toEqual(['detail1', 'detail2']);

    // Verify DB stores as JSON string
    const dbEvent = await testPrisma.event.findUnique({ where: { id: event.id } });
    expect(typeof dbEvent!.details).toBe('string');
    expect(JSON.parse(dbEvent!.details)).toEqual(['detail1', 'detail2']);
  });

  it('PUT /api/events/:id without details preserves existing details', async () => {
    const agent = await authenticatedAgent();
    const event = await testPrisma.event.create({
      data: {
        title: 'Title',
        subtitle: 'Sub',
        details: JSON.stringify(['keep this']),
        sortOrder: 0,
      },
    });

    const res = await agent
      .put(`/api/events/${event.id}`)
      .send({ title: 'Updated Title' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated Title');
    expect(res.body.details).toEqual(['keep this']);
  });

  it('DELETE /api/events/:id marks event for deletion', async () => {
    const agent = await authenticatedAgent();
    const event = await testPrisma.event.create({
      data: {
        title: 'To Delete',
        subtitle: 'Sub',
        details: '[]',
        sortOrder: 0,
      },
    });

    const res = await agent.delete(`/api/events/${event.id}`);
    expect(res.status).toBe(200);

    const listRes = await agent.get('/api/events');
    expect(listRes.body[0].markedForDeletion).toBe(true);
  });

  it('returns events sorted by sortOrder', async () => {
    const agent = await authenticatedAgent();
    await testPrisma.event.createMany({
      data: [
        { title: 'Second', subtitle: '', details: '[]', sortOrder: 1 },
        { title: 'First', subtitle: '', details: '[]', sortOrder: 0 },
        { title: 'Third', subtitle: '', details: '[]', sortOrder: 2 },
      ],
    });

    const res = await agent.get('/api/events');
    expect(res.body.map((e: { title: string }) => e.title)).toEqual(['First', 'Second', 'Third']);
  });

  describe('POST /api/events/reorder', () => {
    async function seed() {
      return Promise.all(
        ['A', 'B', 'C'].map((title, i) =>
          testPrisma.event.create({ data: { title, subtitle: '', details: '[]', sortOrder: i } }),
        ),
      );
    }

    it('persists the new order as sortOrder 0..n-1', async () => {
      const agent = await authenticatedAgent('EDITOR');
      const [a, b, c] = await seed();

      const res = await agent.post('/api/events/reorder').send({ ids: [c.id, a.id, b.id] });
      expect(res.status).toBe(200);

      const list = await agent.get('/api/events');
      expect(list.body.map((e: { title: string }) => e.title)).toEqual(['C', 'A', 'B']);
      expect(list.body.map((e: { sortOrder: number }) => e.sortOrder)).toEqual([0, 1, 2]);
    });

    it('marks the events section as changed in draft-status', async () => {
      const agent = await authenticatedAgent();
      const [a, b, c] = await seed();
      await testPrisma.buildingConfig.create({ data: { dashboardTitle: 'Building Updates' } });
      await agent.post('/api/snapshots').send({});
      const before = await agent.get('/api/snapshots/draft-status');
      expect(before.body.sectionChanges.events).toBe(false);

      await agent.post('/api/events/reorder').send({ ids: [b.id, c.id, a.id] });
      const after = await agent.get('/api/snapshots/draft-status');
      expect(after.body.sectionChanges.events).toBe(true);
    });

    it('rejects invalid payloads with 400', async () => {
      const agent = await authenticatedAgent();
      const [a] = await seed();
      for (const ids of [undefined, [], ['x'], [a.id, a.id], [1.5]]) {
        const res = await agent.post('/api/events/reorder').send({ ids });
        expect(res.status).toBe(400);
      }
    });

    it('returns 404 when an id does not exist', async () => {
      const agent = await authenticatedAgent();
      const [a] = await seed();
      const res = await agent.post('/api/events/reorder').send({ ids: [a.id, 999999] });
      expect(res.status).toBe(404);
    });

    it('is forbidden for viewers', async () => {
      const agent = await authenticatedAgent('VIEWER');
      const [a, b] = await seed();
      const res = await agent.post('/api/events/reorder').send({ ids: [b.id, a.id] });
      expect(res.status).toBe(403);
    });
  });
});
