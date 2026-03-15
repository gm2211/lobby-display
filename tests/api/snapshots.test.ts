import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type { TestAgent } from 'supertest';
import app from '../../server/app.js';
import { testPrisma, authenticatedAgent } from '../setup.js';

/** Helper: seed some test data into the DB */
async function seedTestData() {
  await testPrisma.service.createMany({
    data: [
      { name: 'HVAC', status: 'Operational', sortOrder: 0 },
      { name: 'Elevators', status: 'Maintenance', sortOrder: 1 },
    ],
  });

  await testPrisma.event.createMany({
    data: [
      {
        title: 'Yoga Class',
        subtitle: 'Weekly yoga',
        details: JSON.stringify(['Tuesday 7 AM', 'Studio']),
        imageUrl: '/images/yoga.jpg',
        accentColor: '#e91e63',
        sortOrder: 0,
      },
      {
        title: 'Brunch',
        subtitle: 'Community brunch',
        details: JSON.stringify(['Saturday 10 AM']),
        imageUrl: '/images/brunch.jpg',
        accentColor: '#00bcd4',
        sortOrder: 1,
      },
    ],
  });

  await testPrisma.advisory.create({
    data: { message: 'Water shutoff tonight', active: true },
  });

  await testPrisma.buildingConfig.create({
    data: { dashboardTitle: 'Building Updates' },
  });
}

describe('Snapshots API', () => {
  it('POST /api/snapshots returns 401 when unauthenticated', async () => {
    const res = await request(app).post('/api/snapshots');
    expect(res.status).toBe(401);
  });

  it('GET /api/snapshots/latest returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/snapshots/latest');
    expect(res.status).toBe(401);
  });

  describe('Publish workflow', () => {
    it('POST /api/snapshots publishes current state as a snapshot', async () => {
      await seedTestData();
      const agent = await authenticatedAgent();

      const res = await agent.post('/api/snapshots');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.version).toBe(1);
      expect(res.body.publishedBy).toBe('testadmin');
      expect(res.body.state.services).toHaveLength(2);
      expect(res.body.state.events).toHaveLength(2);
      expect(res.body.state.advisories).toHaveLength(1);
      expect(res.body.state.config).toBeDefined();
      expect(res.body.state.config.dashboardTitle).toBe('Building Updates');
    });

    it('publishing hard-deletes items marked for deletion', async () => {
      await seedTestData();
      const agent = await authenticatedAgent();
      // Mark one event for deletion
      const events = await testPrisma.event.findMany();
      await testPrisma.event.update({
        where: { id: events[0].id },
        data: { markedForDeletion: true },
      });

      const res = await agent.post('/api/snapshots');
      expect(res.body.state.events).toHaveLength(1);
      expect(res.body.state.events[0].title).toBe('Brunch');

      // Verify hard-deleted from DB
      const remaining = await testPrisma.event.findMany();
      expect(remaining).toHaveLength(1);
    });

    it('publish increments version number', async () => {
      await seedTestData();
      const agent = await authenticatedAgent();

      const res1 = await agent.post('/api/snapshots');
      expect(res1.body.version).toBe(1);

      const res2 = await agent.post('/api/snapshots');
      expect(res2.body.version).toBe(2);
    });
  });

  describe('GET /api/snapshots/latest', () => {
    it('returns current state when no snapshots exist', async () => {
      await seedTestData();
      const agent = await authenticatedAgent();

      const res = await agent.get('/api/snapshots/latest');
      expect(res.status).toBe(200);
      expect(res.body.services).toHaveLength(2);
      expect(res.body.events).toHaveLength(2);
    });

    it('returns published snapshot data in flat format', async () => {
      await seedTestData();
      const agent = await authenticatedAgent();
      await agent.post('/api/snapshots'); // publish

      const res = await agent.get('/api/snapshots/latest');
      expect(res.status).toBe(200);
      // Should have flat format (not nested section format)
      expect(Array.isArray(res.body.services)).toBe(true);
      expect(Array.isArray(res.body.events)).toBe(true);
      expect(Array.isArray(res.body.advisories)).toBe(true);
      expect(res.body.config).toBeDefined();
      expect(res.body.config.dashboardTitle).toBe('Building Updates');
      expect(res.body.config.scrollSpeed).toBeDefined();
      expect(res.body.config.tickerSpeed).toBeDefined();
      expect(res.body.config.servicesScrollSpeed).toBeDefined();
    });

    it('returns updated data after delete + publish (the original bug)', async () => {
      await seedTestData();
      const agent = await authenticatedAgent();

      // First publish
      await agent.post('/api/snapshots');
      const latestBefore = await agent.get('/api/snapshots/latest');
      expect(latestBefore.body.events).toHaveLength(2);

      // Mark one event for deletion and publish
      const events = await testPrisma.event.findMany();
      await testPrisma.event.update({
        where: { id: events[0].id },
        data: { markedForDeletion: true },
      });
      await agent.post('/api/snapshots');

      // Latest should reflect the deletion
      const latestAfter = await agent.get('/api/snapshots/latest');
      expect(latestAfter.body.events).toHaveLength(1);
    });
  });

  describe('Legacy snapshot format backward compatibility', () => {
    it('handles old flat-format snapshots gracefully', async () => {
      const agent = await authenticatedAgent();
      // Simulate an old-format snapshot (flat arrays, not nested sections)
      const legacyData = {
        services: [{ id: 1, name: 'HVAC', status: 'Operational', sortOrder: 0 }],
        events: [{ id: 1, title: 'Yoga', subtitle: 'Sub', details: ['d1'], sortOrder: 0 }],
        advisories: [{ id: 1, message: 'Test', active: true }],
        config: { dashboardTitle: 'Building Updates' },
      };

      await testPrisma.publishedSnapshot.create({
        data: { version: 1, data: JSON.stringify(legacyData) },
      });

      const res = await agent.get('/api/snapshots/latest');
      expect(res.status).toBe(200);
      // Should return the data without crashing
      expect(res.body.services).toHaveLength(1);
      expect(res.body.events).toHaveLength(1);
      expect(res.body.advisories).toHaveLength(1);
      expect(res.body.config.dashboardTitle).toBe('Building Updates');
    });
  });

  describe('GET /api/snapshots/:version', () => {
    it('returns a specific snapshot version', async () => {
      await seedTestData();
      const agent = await authenticatedAgent();
      await agent.post('/api/snapshots');

      const res = await agent.get('/api/snapshots/1');
      expect(res.status).toBe(200);
      expect(res.body.version).toBe(1);
      expect(res.body.services).toBeDefined();
    });

    it('returns 404 for non-existent version', async () => {
      const agent = await authenticatedAgent();
      const res = await agent.get('/api/snapshots/999');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/snapshots', () => {
    it('lists all snapshots', async () => {
      await seedTestData();
      const agent = await authenticatedAgent();
      await agent.post('/api/snapshots');
      await agent.post('/api/snapshots');

      const res = await agent.get('/api/snapshots');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      // Should be ordered desc
      expect(res.body[0].version).toBe(2);
      expect(res.body[1].version).toBe(1);
      // Should include publishedBy
      expect(res.body[0].publishedBy).toBe('testadmin');
      expect(res.body[1].publishedBy).toBe('testadmin');
    });
  });

  describe('Draft status', () => {
    it('GET /api/snapshots/draft-status shows changes when no published snapshot', async () => {
      await seedTestData();
      const agent = await authenticatedAgent();

      const res = await agent.get('/api/snapshots/draft-status');
      expect(res.status).toBe(200);
      expect(res.body.hasChanges).toBe(true);
    });

    it('GET /api/snapshots/draft-status shows no changes after publish', async () => {
      await seedTestData();
      const agent = await authenticatedAgent();
      await agent.post('/api/snapshots');

      const res = await agent.get('/api/snapshots/draft-status');
      expect(res.status).toBe(200);
      expect(res.body.hasChanges).toBe(false);
    });

    it('GET /api/snapshots/draft-status detects new changes after publish', async () => {
      await seedTestData();
      const agent = await authenticatedAgent();
      await agent.post('/api/snapshots');

      // Make a change
      await testPrisma.service.create({
        data: { name: 'New Service', status: 'Operational', sortOrder: 99 },
      });

      const res = await agent.get('/api/snapshots/draft-status');
      expect(res.body.hasChanges).toBe(true);
      expect(res.body.sectionChanges.services).toBe(true);
    });

    it('detects marked-for-deletion as a change', async () => {
      await seedTestData();
      const agent = await authenticatedAgent();
      await agent.post('/api/snapshots');

      const services = await testPrisma.service.findMany();
      await testPrisma.service.update({
        where: { id: services[0].id },
        data: { markedForDeletion: true },
      });

      const res = await agent.get('/api/snapshots/draft-status');
      expect(res.body.hasChanges).toBe(true);
      expect(res.body.sectionChanges.services).toBe(true);
    });
  });

  describe('Discard', () => {
    it('POST /api/snapshots/discard restores to last published state', async () => {
      await seedTestData();
      const agent = await authenticatedAgent();
      await agent.post('/api/snapshots');

      // Delete a service (not just mark)
      const services = await testPrisma.service.findMany();
      await testPrisma.service.delete({ where: { id: services[0].id } });

      // Add a new one
      await testPrisma.service.create({
        data: { name: 'New Service', status: 'Operational', sortOrder: 99 },
      });

      // Discard
      const res = await agent.post('/api/snapshots/discard');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      // Should be back to original 2 services
      const serviceList = await testPrisma.service.findMany();
      expect(serviceList).toHaveLength(2);
    });
  });

  describe('DELETE /api/snapshots/:version', () => {
    it('deletes a specific snapshot version', async () => {
      await seedTestData();
      const agent = await authenticatedAgent();
      await agent.post('/api/snapshots');
      await agent.post('/api/snapshots');

      const res = await agent.delete('/api/snapshots/1');
      expect(res.status).toBe(200);

      const list = await agent.get('/api/snapshots');
      expect(list.body).toHaveLength(1);
      expect(list.body[0].version).toBe(2);
    });

    it('cannot delete the only remaining snapshot', async () => {
      await seedTestData();
      const agent = await authenticatedAgent();
      await agent.post('/api/snapshots');

      const res = await agent.delete('/api/snapshots/1');
      expect(res.status).toBe(400);
    });
  });

  describe('Purge', () => {
    it('DELETE /api/snapshots purges all but latest', async () => {
      await seedTestData();
      const agent = await authenticatedAgent();
      await agent.post('/api/snapshots');
      await agent.post('/api/snapshots');
      await agent.post('/api/snapshots');

      const res = await agent.delete('/api/snapshots');
      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(2);

      const list = await agent.get('/api/snapshots');
      expect(list.body).toHaveLength(1);
      expect(list.body[0].version).toBe(3);
    });
  });

  describe('Restore', () => {
    it('POST /api/snapshots/restore/:version restores to a version', async () => {
      await seedTestData();
      const agent = await authenticatedAgent();
      await agent.post('/api/snapshots'); // v1: 2 services

      // Add a service and publish again
      await testPrisma.service.create({
        data: { name: 'New', status: 'Operational', sortOrder: 99 },
      });
      await agent.post('/api/snapshots'); // v2: 3 services

      // Restore to v1
      const res = await agent.post('/api/snapshots/restore/1');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      // Should now have 2 services again
      const services = await testPrisma.service.findMany();
      expect(services).toHaveLength(2);
    });

    it('returns 404 for non-existent version', async () => {
      const agent = await authenticatedAgent();
      const res = await agent.post('/api/snapshots/restore/999');
      expect(res.status).toBe(404);
    });
  });

  describe('Selective restore (restore-items)', () => {
    it('restores a single service from a snapshot', async () => {
      await seedTestData();
      const agent = await authenticatedAgent();
      await agent.post('/api/snapshots'); // v1

      // Modify the service
      const services = await testPrisma.service.findMany();
      await testPrisma.service.update({
        where: { id: services[0].id },
        data: { status: 'Outage' },
      });

      // Selectively restore just that service from v1
      const res = await agent
        .post('/api/snapshots/restore-items')
        .send({ sourceVersion: 1, items: { services: [services[0].id] } });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.restored.services).toContain(services[0].id);

      // Verify the service was restored
      const restored = await testPrisma.service.findUnique({ where: { id: services[0].id } });
      expect(restored?.status).toBe('Operational');
    });

    it('restores a single event from a snapshot', async () => {
      await seedTestData();
      const agent = await authenticatedAgent();
      await agent.post('/api/snapshots'); // v1

      const events = await testPrisma.event.findMany();
      await testPrisma.event.update({
        where: { id: events[0].id },
        data: { title: 'Changed Title' },
      });

      const res = await agent
        .post('/api/snapshots/restore-items')
        .send({ sourceVersion: 1, items: { events: [events[0].id] } });

      expect(res.status).toBe(200);
      expect(res.body.restored.events).toContain(events[0].id);

      const restored = await testPrisma.event.findUnique({ where: { id: events[0].id } });
      expect(restored?.title).toBe('Yoga Class');
    });

    it('restores a single advisory from a snapshot', async () => {
      await seedTestData();
      const agent = await authenticatedAgent();
      await agent.post('/api/snapshots'); // v1

      const advisories = await testPrisma.advisory.findMany();
      await testPrisma.advisory.update({
        where: { id: advisories[0].id },
        data: { message: 'Changed message' },
      });

      const res = await agent
        .post('/api/snapshots/restore-items')
        .send({ sourceVersion: 1, items: { advisories: [advisories[0].id] } });

      expect(res.status).toBe(200);
      expect(res.body.restored.advisories).toContain(advisories[0].id);

      const restored = await testPrisma.advisory.findUnique({ where: { id: advisories[0].id } });
      expect(restored?.message).toBe('Water shutoff tonight');
    });

    it('returns 400 when sourceVersion is missing', async () => {
      const agent = await authenticatedAgent();
      const res = await agent
        .post('/api/snapshots/restore-items')
        .send({ items: { services: [1] } });
      expect(res.status).toBe(400);
    });
  });

  describe('Diff endpoint', () => {
    it('returns correct diff between two snapshots', async () => {
      await seedTestData();
      const agent = await authenticatedAgent();
      await agent.post('/api/snapshots'); // v1: 2 services

      // Add a service and publish v2
      await testPrisma.service.create({
        data: { name: 'New Service', status: 'Operational', sortOrder: 99 },
      });
      await agent.post('/api/snapshots'); // v2: 3 services

      const res = await agent.get('/api/snapshots/1/diff/2');
      expect(res.status).toBe(200);
      expect(res.body.services.added).toHaveLength(1);
      expect(res.body.services.added[0].name).toBe('New Service');
      expect(res.body.services.removed).toHaveLength(0);
    });

    it('returns empty diff when comparing same version', async () => {
      await seedTestData();
      const agent = await authenticatedAgent();
      await agent.post('/api/snapshots'); // v1

      const res = await agent.get('/api/snapshots/1/diff/1');
      expect(res.status).toBe(200);
      expect(res.body.services.added).toHaveLength(0);
      expect(res.body.services.removed).toHaveLength(0);
      expect(res.body.services.changed).toHaveLength(0);
      expect(res.body.events.added).toHaveLength(0);
      expect(res.body.advisories.added).toHaveLength(0);
    });

    it('returns 404 for non-existent version', async () => {
      const agent = await authenticatedAgent();
      const res = await agent.get('/api/snapshots/999/diff/1');
      expect(res.status).toBe(404);
    });

    it('supports draft comparison', async () => {
      await seedTestData();
      const agent = await authenticatedAgent();
      await agent.post('/api/snapshots'); // v1

      // Modify draft state
      await testPrisma.service.create({
        data: { name: 'Draft Service', status: 'Operational', sortOrder: 99 },
      });

      const res = await agent.get('/api/snapshots/1/diff/draft');
      expect(res.status).toBe(200);
      expect(res.body.services.added).toHaveLength(1);
      expect(res.body.services.added[0].name).toBe('Draft Service');
    });
  });

  describe('Draft status — per-section detection', () => {
    it('detects services changed but events unchanged', async () => {
      await seedTestData();
      const agent = await authenticatedAgent();
      await agent.post('/api/snapshots');

      // Only modify a service
      const services = await testPrisma.service.findMany();
      await testPrisma.service.update({
        where: { id: services[0].id },
        data: { status: 'Outage' },
      });

      const res = await agent.get('/api/snapshots/draft-status');
      expect(res.body.sectionChanges.services).toBe(true);
      expect(res.body.sectionChanges.events).toBe(false);
      expect(res.body.sectionChanges.advisories).toBe(false);
    });

    it('detects new draft items', async () => {
      await seedTestData();
      const agent = await authenticatedAgent();
      await agent.post('/api/snapshots');

      // Add a new event
      await testPrisma.event.create({
        data: {
          title: 'New Event',
          subtitle: '',
          details: JSON.stringify([]),
          imageUrl: '',
          accentColor: '',
          sortOrder: 99,
        },
      });

      const res = await agent.get('/api/snapshots/draft-status');
      expect(res.body.sectionChanges.events).toBe(true);
      expect(res.body.sectionChanges.services).toBe(false);
    });

    it('detects marked-for-deletion items as changes', async () => {
      await seedTestData();
      const agent = await authenticatedAgent();
      await agent.post('/api/snapshots');

      const advisories = await testPrisma.advisory.findMany();
      await testPrisma.advisory.update({
        where: { id: advisories[0].id },
        data: { markedForDeletion: true },
      });

      const res = await agent.get('/api/snapshots/draft-status');
      expect(res.body.sectionChanges.advisories).toBe(true);
    });
  });

  describe('Discard — edge cases', () => {
    it('handles discard with no published snapshot gracefully', async () => {
      const agent = await authenticatedAgent();
      // No data at all — no snapshots
      const res = await agent.post('/api/snapshots/discard');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });
});
