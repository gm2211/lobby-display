import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';

const TEST_DB_URL = 'postgresql://postgres:postgres@localhost:5432/renzo_test';

const prisma = new PrismaClient({
  datasources: { db: { url: TEST_DB_URL } },
});

beforeEach(async () => {
  await prisma.searchIndex.deleteMany();
});

describe('SearchIndex model', () => {
  it('can create a SearchIndex entry', async () => {
    const entry = await prisma.searchIndex.create({
      data: {
        entityType: 'Event',
        entityId: 'evt-001',
        title: 'Building Lobby Renovation',
        body: 'The lobby renovation project starts Monday.',
      },
    });

    expect(entry.id).toBeDefined();
    expect(entry.entityType).toBe('Event');
    expect(entry.entityId).toBe('evt-001');
    expect(entry.title).toBe('Building Lobby Renovation');
    expect(entry.body).toBe('The lobby renovation project starts Monday.');
    expect(entry.metadata).toBeNull();
    expect(entry.createdAt).toBeInstanceOf(Date);
  });

  it('can store optional metadata as JSON', async () => {
    const metadata = { category: 'renovation', floor: 1 };
    const entry = await prisma.searchIndex.create({
      data: {
        entityType: 'Service',
        entityId: 'svc-42',
        title: 'Elevator Service',
        body: 'Elevator maintenance scheduled.',
        metadata,
      },
    });

    expect(entry.metadata).toEqual(metadata);
  });

  it('enforces unique constraint on entityType + entityId', async () => {
    await prisma.searchIndex.create({
      data: {
        entityType: 'Advisory',
        entityId: 'adv-1',
        title: 'Water Advisory',
        body: 'Water shut off tonight.',
      },
    });

    await expect(
      prisma.searchIndex.create({
        data: {
          entityType: 'Advisory',
          entityId: 'adv-1',
          title: 'Duplicate Entry',
          body: 'This should fail.',
        },
      }),
    ).rejects.toThrow();
  });

  it('allows same entityId with different entityType', async () => {
    await prisma.searchIndex.create({
      data: { entityType: 'Event', entityId: 'id-1', title: 'Event 1', body: 'Body A' },
    });

    const second = await prisma.searchIndex.create({
      data: { entityType: 'Service', entityId: 'id-1', title: 'Service 1', body: 'Body B' },
    });

    expect(second.entityType).toBe('Service');
  });

  it('can upsert by entityType + entityId', async () => {
    await prisma.searchIndex.create({
      data: { entityType: 'Event', entityId: 'evt-1', title: 'Original Title', body: 'Original Body' },
    });

    const updated = await prisma.searchIndex.upsert({
      where: { entityType_entityId: { entityType: 'Event', entityId: 'evt-1' } },
      update: { title: 'Updated Title', body: 'Updated Body' },
      create: { entityType: 'Event', entityId: 'evt-1', title: 'Updated Title', body: 'Updated Body' },
    });

    expect(updated.title).toBe('Updated Title');
    expect(updated.body).toBe('Updated Body');

    const count = await prisma.searchIndex.count({ where: { entityType: 'Event', entityId: 'evt-1' } });
    expect(count).toBe(1);
  });

  it('sets createdAt automatically on creation', async () => {
    const before = new Date();
    const entry = await prisma.searchIndex.create({
      data: { entityType: 'Event', entityId: 'evt-ts', title: 'Timestamp Test', body: 'Body' },
    });
    const after = new Date();

    expect(entry.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(entry.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('can delete an entry', async () => {
    const entry = await prisma.searchIndex.create({
      data: { entityType: 'Event', entityId: 'evt-del', title: 'To Delete', body: 'Body' },
    });

    await prisma.searchIndex.delete({ where: { id: entry.id } });

    const found = await prisma.searchIndex.findUnique({ where: { id: entry.id } });
    expect(found).toBeNull();
  });
});
