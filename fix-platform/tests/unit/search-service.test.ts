import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma before importing the service
vi.mock('../../server/db.js', () => ({
  default: {
    searchIndex: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import prisma from '../../server/db.js';
import { indexEntity, removeIndex, searchEntities } from '../../server/services/search.js';

const mockPrisma = prisma as {
  searchIndex: {
    upsert: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('indexEntity', () => {
  it('calls prisma.searchIndex.upsert with correct args', async () => {
    const mockEntry = {
      id: 'abc-123',
      entityType: 'Event',
      entityId: 'evt-1',
      title: 'Test Event',
      body: 'Event body text',
      metadata: null,
      createdAt: new Date(),
    };
    mockPrisma.searchIndex.upsert.mockResolvedValue(mockEntry);

    const result = await indexEntity('Event', 'evt-1', 'Test Event', 'Event body text');

    expect(mockPrisma.searchIndex.upsert).toHaveBeenCalledWith({
      where: { entityType_entityId: { entityType: 'Event', entityId: 'evt-1' } },
      update: { title: 'Test Event', body: 'Event body text', metadata: undefined },
      create: { entityType: 'Event', entityId: 'evt-1', title: 'Test Event', body: 'Event body text', metadata: undefined },
    });
    expect(result).toBe(mockEntry);
  });

  it('passes metadata when provided', async () => {
    const metadata = { category: 'maintenance', priority: 'high' };
    mockPrisma.searchIndex.upsert.mockResolvedValue({} as any);

    await indexEntity('Service', 'svc-5', 'Elevator', 'Elevator desc', metadata);

    expect(mockPrisma.searchIndex.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ metadata }),
        create: expect.objectContaining({ metadata }),
      }),
    );
  });

  it('passes undefined for metadata when not provided', async () => {
    mockPrisma.searchIndex.upsert.mockResolvedValue({} as any);

    await indexEntity('Advisory', 'adv-1', 'Advisory Title', 'Advisory body');

    const call = mockPrisma.searchIndex.upsert.mock.calls[0][0];
    expect(call.update.metadata).toBeUndefined();
    expect(call.create.metadata).toBeUndefined();
  });
});

describe('removeIndex', () => {
  it('calls prisma.searchIndex.deleteMany with correct where clause', async () => {
    mockPrisma.searchIndex.deleteMany.mockResolvedValue({ count: 1 });

    const result = await removeIndex('Event', 'evt-99');

    expect(mockPrisma.searchIndex.deleteMany).toHaveBeenCalledWith({
      where: { entityType: 'Event', entityId: 'evt-99' },
    });
    expect(result).toEqual({ count: 1 });
  });

  it('returns count of 0 when no entries matched', async () => {
    mockPrisma.searchIndex.deleteMany.mockResolvedValue({ count: 0 });

    const result = await removeIndex('Event', 'non-existent');

    expect(result).toEqual({ count: 0 });
  });
});

describe('searchEntities', () => {
  it('searches title and body with LIKE for a query', async () => {
    const mockResults = [
      { id: '1', entityType: 'Event', entityId: 'evt-1', title: 'Lobby Renovation', body: 'Starts Monday', metadata: null, createdAt: new Date() },
    ];
    mockPrisma.searchIndex.findMany.mockResolvedValue(mockResults);

    const results = await searchEntities('lobby');

    expect(mockPrisma.searchIndex.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { title: { contains: 'lobby', mode: 'insensitive' } },
          { body: { contains: 'lobby', mode: 'insensitive' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(results).toBe(mockResults);
  });

  it('filters by entityType when provided', async () => {
    mockPrisma.searchIndex.findMany.mockResolvedValue([]);

    await searchEntities('water', 'Advisory');

    expect(mockPrisma.searchIndex.findMany).toHaveBeenCalledWith({
      where: {
        entityType: 'Advisory',
        OR: [
          { title: { contains: 'water', mode: 'insensitive' } },
          { body: { contains: 'water', mode: 'insensitive' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('does not add entityType filter when not provided', async () => {
    mockPrisma.searchIndex.findMany.mockResolvedValue([]);

    await searchEntities('maintenance');

    const call = mockPrisma.searchIndex.findMany.mock.calls[0][0];
    expect(call.where.entityType).toBeUndefined();
  });

  it('returns empty array when no matches', async () => {
    mockPrisma.searchIndex.findMany.mockResolvedValue([]);

    const results = await searchEntities('nonexistentterm');

    expect(results).toEqual([]);
  });

  it('orders results by createdAt descending', async () => {
    mockPrisma.searchIndex.findMany.mockResolvedValue([]);

    await searchEntities('test');

    const call = mockPrisma.searchIndex.findMany.mock.calls[0][0];
    expect(call.orderBy).toEqual({ createdAt: 'desc' });
  });
});
