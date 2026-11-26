import { describe, it, expect } from 'vitest';
import { testPrisma, authenticatedAgent } from '../setup.js';

type LatestEvent = { id: number; title: string; firstPublishedAt?: string | null; newInLastUpdate?: boolean };

async function latestEvents(agent: Awaited<ReturnType<typeof authenticatedAgent>>): Promise<LatestEvent[]> {
  const res = await agent.get('/api/snapshots/latest').expect(200);
  return res.body.events as LatestEvent[];
}

describe('NEW badge bookkeeping on publish', () => {
  it('stamps firstPublishedAt on first publish and keeps it on later publishes', async () => {
    await testPrisma.buildingConfig.create({ data: {} });
    const agent = await authenticatedAgent();
    await agent.post('/api/events').send({ title: 'A', details: [] }).expect(200);

    await agent.post('/api/snapshots').expect(200);
    const [first] = await latestEvents(agent);
    expect(first.firstPublishedAt).toBeTruthy();
    expect(first.newInLastUpdate).toBe(true);

    await agent.put(`/api/events/${first.id}`).send({ title: 'A edited' }).expect(200);
    await agent.post('/api/snapshots').expect(200);
    const [again] = await latestEvents(agent);
    expect(again.firstPublishedAt).toBe(first.firstPublishedAt);
    // Events list changed, but A was not added in this publish
    expect(again.newInLastUpdate).toBe(false);
  });

  it('keeps "new" flags when a publish does not change the events list', async () => {
    await testPrisma.buildingConfig.create({ data: {} });
    const agent = await authenticatedAgent();
    await agent.post('/api/events').send({ title: 'A', details: [] }).expect(200);
    await agent.post('/api/snapshots').expect(200);
    await agent.post('/api/events').send({ title: 'B', details: [] }).expect(200);
    await agent.post('/api/snapshots').expect(200);

    // Publish with only a service change
    await agent.post('/api/services').send({ name: 'HVAC', status: 'Operational' }).expect(200);
    await agent.post('/api/snapshots').expect(200);

    const byTitle = Object.fromEntries((await latestEvents(agent)).map(e => [e.title, e]));
    expect(byTitle.A.newInLastUpdate).toBe(false);
    expect(byTitle.B.newInLastUpdate).toBe(true);
  });

  it('backfills events from pre-badge snapshots without marking them new', async () => {
    await testPrisma.buildingConfig.create({ data: {} });
    const ev = await testPrisma.event.create({ data: { title: 'Old', details: '[]' } });
    const oldTime = new Date('2026-01-01T00:00:00Z');
    await testPrisma.publishedSnapshot.create({
      data: {
        version: 1,
        publishedAt: oldTime,
        data: JSON.stringify({ config: null, services: { items: [] }, events: { items: [{ id: ev.id, title: 'Old', subtitle: '', details: [], imageUrl: '', accentColor: '', sortOrder: 0 }] }, advisories: { items: [] } }),
      },
    });
    const agent = await authenticatedAgent();
    await agent.post('/api/events').send({ title: 'Fresh', details: [] }).expect(200);
    await agent.post('/api/snapshots').expect(200);

    const byTitle = Object.fromEntries((await latestEvents(agent)).map(e => [e.title, e]));
    expect(byTitle.Old.firstPublishedAt).toBe(oldTime.toISOString());
    expect(byTitle.Old.newInLastUpdate).toBe(false);
    expect(byTitle.Fresh.newInLastUpdate).toBe(true);
  });

  it('ignores firstPublishedAt sent by clients', async () => {
    await testPrisma.buildingConfig.create({ data: {} });
    const agent = await authenticatedAgent();
    const res = await agent.post('/api/events').send({ title: 'X', details: [], firstPublishedAt: '2020-01-01T00:00:00Z' }).expect(200);
    expect(res.body.firstPublishedAt).toBeNull();
  });

  it('validates badge config', async () => {
    const agent = await authenticatedAgent();
    await agent.put('/api/config').send({ newBadgeMode: 'forever' }).expect(400);
    await agent.put('/api/config').send({ newBadgeDays: 0 }).expect(400);
    const ok = await agent.put('/api/config').send({ newBadgeMode: 'untilNextUpdate', newBadgeDays: 14 }).expect(200);
    expect(ok.body.newBadgeMode).toBe('untilNextUpdate');
    expect(ok.body.newBadgeDays).toBe(14);
  });

  it('defaults the badge color to brand yellow and accepts only hex colors', async () => {
    const agent = await authenticatedAgent();
    const initial = await agent.get('/api/config').expect(200);
    expect(initial.body.newBadgeColor).toBe('#ffc72c');
    await agent.put('/api/config').send({ newBadgeColor: 'red; background:url(x)' }).expect(400);
    const ok = await agent.put('/api/config').send({ newBadgeColor: '#123456' }).expect(200);
    expect(ok.body.newBadgeColor).toBe('#123456');
    await agent.post('/api/snapshots').expect(200);
    const latest = await agent.get('/api/snapshots/latest').expect(200);
    expect(latest.body.config.newBadgeColor).toBe('#123456');
  });

  it('draft-status is unchanged right after publish', async () => {
    await testPrisma.buildingConfig.create({ data: {} });
    const agent = await authenticatedAgent();
    await agent.post('/api/events').send({ title: 'A', details: [] }).expect(200);
    await agent.post('/api/snapshots').expect(200);
    const res = await agent.get('/api/snapshots/draft-status').expect(200);
    expect(res.body.sectionChanges).toEqual({ config: false, services: false, events: false, advisories: false });
  });
});
