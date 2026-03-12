/**
 * Unit tests for AI Context Retrieval Service.
 *
 * Uses vi.mock to mock Prisma so no database calls are needed.
 * Tests follow TDD (Red phase): written before the implementation.
 *
 * Service: server/services/aiContext.ts
 * Function: getRelevantContext(query: string): Promise<ContextResult>
 *
 * Searches across:
 * - Announcements (title + body)
 * - Amenities (name + description)
 * - Documents (title + description)
 * - Policies (documents in policy-related categories)
 *
 * Returns: { announcements: [], amenities: [], documents: [], policies: [] }
 * Limits results to top 5 per category.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma before importing the service
vi.mock('../../server/db.js', () => ({
  default: {
    announcement: {
      findMany: vi.fn(),
    },
    amenity: {
      findMany: vi.fn(),
    },
    document: {
      findMany: vi.fn(),
    },
  },
}));

import prisma from '../../server/db.js';
import { getRelevantContext } from '../../server/services/aiContext.js';
import type { ContextResult } from '../../server/services/aiContext.js';

// Type helpers for mocked Prisma functions
const mockPrisma = prisma as {
  announcement: { findMany: ReturnType<typeof vi.fn> };
  amenity: { findMany: ReturnType<typeof vi.fn> };
  document: { findMany: ReturnType<typeof vi.fn> };
};

// ─── Sample fixtures ──────────────────────────────────────────────────────────

const sampleAnnouncements = [
  {
    id: 'ann-uuid-1',
    title: 'Pool Closure Notice',
    body: 'The rooftop pool will be closed for maintenance this weekend.',
    pinned: false,
    priority: 0,
    publishedAt: new Date('2026-02-01'),
    expiresAt: null,
    createdBy: 'user-1',
    buildingId: null,
    markedForDeletion: false,
    createdAt: new Date('2026-02-01'),
    updatedAt: new Date('2026-02-01'),
  },
  {
    id: 'ann-uuid-2',
    title: 'Gym Equipment Update',
    body: 'New treadmills have been installed in the gym on floor 3.',
    pinned: true,
    priority: 1,
    publishedAt: new Date('2026-02-02'),
    expiresAt: null,
    createdBy: 'user-1',
    buildingId: null,
    markedForDeletion: false,
    createdAt: new Date('2026-02-02'),
    updatedAt: new Date('2026-02-02'),
  },
];

const sampleAmenities = [
  {
    id: 'amenity-uuid-1',
    name: 'Rooftop Pool',
    description: 'Olympic-size rooftop pool with stunning city views. Open daily.',
    location: 'Floor 30',
    capacity: 50,
    requiresApproval: false,
    pricePerHour: null,
    currency: 'USD',
    availableFrom: '06:00',
    availableTo: '22:00',
    daysAvailable: [1, 2, 3, 4, 5, 6, 7],
    minAdvanceHours: 0,
    maxAdvanceHours: 720,
    maxDurationHours: 4,
    active: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  },
  {
    id: 'amenity-uuid-2',
    name: 'Fitness Center',
    description: 'Fully equipped gym with cardio and weight training equipment.',
    location: 'Floor 3',
    capacity: 30,
    requiresApproval: false,
    pricePerHour: null,
    currency: 'USD',
    availableFrom: '05:00',
    availableTo: '23:00',
    daysAvailable: [1, 2, 3, 4, 5, 6, 7],
    minAdvanceHours: 0,
    maxAdvanceHours: 720,
    maxDurationHours: 2,
    active: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  },
];

const sampleDocuments = [
  {
    id: 'doc-uuid-1',
    title: 'Building Rules and Regulations',
    description: 'Official building policies covering noise, guests, and amenity usage.',
    categoryId: 'cat-uuid-1',
    category: { id: 'cat-uuid-1', name: 'Building Policies', description: null, sortOrder: 0 },
    uploadedBy: 'user-1',
    active: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  },
  {
    id: 'doc-uuid-2',
    title: 'Amenity Usage FAQ',
    description: 'Frequently asked questions about using building amenities.',
    categoryId: 'cat-uuid-2',
    category: { id: 'cat-uuid-2', name: 'FAQ', description: null, sortOrder: 1 },
    uploadedBy: 'user-1',
    active: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  },
];

// ─── getRelevantContext ────────────────────────────────────────────────────────

describe('getRelevantContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: return empty arrays
    mockPrisma.announcement.findMany.mockResolvedValue([]);
    mockPrisma.amenity.findMany.mockResolvedValue([]);
    mockPrisma.document.findMany.mockResolvedValue([]);
  });

  // ─── Return shape ──────────────────────────────────────────────────────────

  it('returns a ContextResult with all four categories', async () => {
    const result = await getRelevantContext('pool');

    expect(result).toHaveProperty('announcements');
    expect(result).toHaveProperty('amenities');
    expect(result).toHaveProperty('documents');
    expect(result).toHaveProperty('policies');
  });

  it('returns arrays for all four categories', async () => {
    const result = await getRelevantContext('pool');

    expect(Array.isArray(result.announcements)).toBe(true);
    expect(Array.isArray(result.amenities)).toBe(true);
    expect(Array.isArray(result.documents)).toBe(true);
    expect(Array.isArray(result.policies)).toBe(true);
  });

  // ─── Empty query ───────────────────────────────────────────────────────────

  it('returns empty arrays for an empty query string', async () => {
    const result = await getRelevantContext('');

    expect(result.announcements).toEqual([]);
    expect(result.amenities).toEqual([]);
    expect(result.documents).toEqual([]);
    expect(result.policies).toEqual([]);
    // Should not hit the database at all
    expect(mockPrisma.announcement.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.amenity.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.document.findMany).not.toHaveBeenCalled();
  });

  it('returns empty arrays for a whitespace-only query', async () => {
    const result = await getRelevantContext('   ');

    expect(result.announcements).toEqual([]);
    expect(result.amenities).toEqual([]);
    expect(result.documents).toEqual([]);
    expect(result.policies).toEqual([]);
    expect(mockPrisma.announcement.findMany).not.toHaveBeenCalled();
  });

  // ─── No results ────────────────────────────────────────────────────────────

  it('returns empty arrays when nothing matches the query', async () => {
    mockPrisma.announcement.findMany.mockResolvedValue([]);
    mockPrisma.amenity.findMany.mockResolvedValue([]);
    mockPrisma.document.findMany.mockResolvedValue([]);

    const result = await getRelevantContext('zzznomatch');

    expect(result.announcements).toEqual([]);
    expect(result.amenities).toEqual([]);
    expect(result.documents).toEqual([]);
    expect(result.policies).toEqual([]);
  });

  // ─── Keyword matching — announcements ─────────────────────────────────────

  it('searches announcements with case-insensitive keyword matching', async () => {
    mockPrisma.announcement.findMany.mockResolvedValue([sampleAnnouncements[0]]);

    await getRelevantContext('pool');

    expect(mockPrisma.announcement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          markedForDeletion: false,
          OR: expect.arrayContaining([
            expect.objectContaining({ title: expect.objectContaining({ contains: 'pool', mode: 'insensitive' }) }),
            expect.objectContaining({ body: expect.objectContaining({ contains: 'pool', mode: 'insensitive' }) }),
          ]),
        }),
      })
    );
  });

  it('returns matching announcements in the announcements array', async () => {
    mockPrisma.announcement.findMany.mockResolvedValue([sampleAnnouncements[0]]);

    const result = await getRelevantContext('pool');

    expect(result.announcements).toHaveLength(1);
    expect(result.announcements[0].id).toBe('ann-uuid-1');
    expect(result.announcements[0].title).toBe('Pool Closure Notice');
  });

  // ─── Keyword matching — amenities ─────────────────────────────────────────

  it('searches amenities with case-insensitive keyword matching', async () => {
    mockPrisma.amenity.findMany.mockResolvedValue([sampleAmenities[0]]);

    await getRelevantContext('pool');

    expect(mockPrisma.amenity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          active: true,
          OR: expect.arrayContaining([
            expect.objectContaining({ name: expect.objectContaining({ contains: 'pool', mode: 'insensitive' }) }),
            expect.objectContaining({ description: expect.objectContaining({ contains: 'pool', mode: 'insensitive' }) }),
          ]),
        }),
      })
    );
  });

  it('returns matching amenities in the amenities array', async () => {
    mockPrisma.amenity.findMany.mockResolvedValue([sampleAmenities[0]]);

    const result = await getRelevantContext('pool');

    expect(result.amenities).toHaveLength(1);
    expect(result.amenities[0].id).toBe('amenity-uuid-1');
    expect(result.amenities[0].name).toBe('Rooftop Pool');
  });

  // ─── Keyword matching — documents ─────────────────────────────────────────

  it('searches documents with case-insensitive keyword matching', async () => {
    mockPrisma.document.findMany.mockResolvedValue([sampleDocuments[0]]);

    await getRelevantContext('rules');

    expect(mockPrisma.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          active: true,
          OR: expect.arrayContaining([
            expect.objectContaining({ title: expect.objectContaining({ contains: 'rules', mode: 'insensitive' }) }),
            expect.objectContaining({ description: expect.objectContaining({ contains: 'rules', mode: 'insensitive' }) }),
          ]),
        }),
      })
    );
  });

  it('returns matching documents in the documents array', async () => {
    // Use a document with a non-policy category so it lands in documents (not policies)
    const generalDoc = {
      ...sampleDocuments[0],
      category: { id: 'cat-uuid-general', name: 'General Information', description: null, sortOrder: 0 },
    };
    mockPrisma.document.findMany.mockResolvedValue([generalDoc]);

    const result = await getRelevantContext('building rules');

    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].id).toBe('doc-uuid-1');
    expect(result.documents[0].title).toBe('Building Rules and Regulations');
  });

  // ─── Policies (FAQ-tagged documents) ──────────────────────────────────────

  it('includes documents from policy/FAQ categories in policies', async () => {
    const policyDoc = {
      ...sampleDocuments[0],
      category: { id: 'cat-uuid-1', name: 'Building Policies', description: null, sortOrder: 0 },
    };
    mockPrisma.document.findMany.mockResolvedValue([policyDoc]);

    const result = await getRelevantContext('noise policy');

    expect(result.policies).toHaveLength(1);
    expect(result.policies[0].id).toBe('doc-uuid-1');
  });

  it('separates policy documents from general documents', async () => {
    // Policy doc has category name matching policy keywords
    const policyDoc = {
      ...sampleDocuments[0],
      category: { id: 'cat-uuid-1', name: 'Building Policies', description: null, sortOrder: 0 },
    };
    const generalDoc = {
      ...sampleDocuments[1],
      category: { id: 'cat-uuid-2', name: 'FAQ', description: null, sortOrder: 1 },
    };
    mockPrisma.document.findMany.mockResolvedValue([policyDoc, generalDoc]);

    const result = await getRelevantContext('amenity');

    // Both policy and FAQ documents go into policies
    expect(result.policies.length).toBeGreaterThanOrEqual(1);
    // Non-policy documents go into documents
    const policyIds = result.policies.map((p: { id: string }) => p.id);
    const documentIds = result.documents.map((d: { id: string }) => d.id);
    // Each doc should appear in either policies or documents, not both
    policyIds.forEach((id: string) => {
      expect(documentIds).not.toContain(id);
    });
  });

  // ─── Multi-category search ─────────────────────────────────────────────────

  it('searches across all categories for a query', async () => {
    mockPrisma.announcement.findMany.mockResolvedValue([sampleAnnouncements[1]]);
    mockPrisma.amenity.findMany.mockResolvedValue([sampleAmenities[1]]);
    mockPrisma.document.findMany.mockResolvedValue([sampleDocuments[0]]);

    const result = await getRelevantContext('gym');

    expect(result.announcements).toHaveLength(1);
    expect(result.amenities).toHaveLength(1);
  });

  // ─── Result limiting ───────────────────────────────────────────────────────

  it('limits announcements to top 5 results', async () => {
    expect(mockPrisma.announcement.findMany).not.toHaveBeenCalled();

    await getRelevantContext('building');

    const call = mockPrisma.announcement.findMany.mock.calls[0]?.[0];
    expect(call?.take).toBe(5);
  });

  it('limits amenities to top 5 results', async () => {
    await getRelevantContext('amenity');

    const call = mockPrisma.amenity.findMany.mock.calls[0]?.[0];
    expect(call?.take).toBe(5);
  });

  it('limits documents to top 5 results', async () => {
    await getRelevantContext('policy');

    const call = mockPrisma.document.findMany.mock.calls[0]?.[0];
    expect(call?.take).toBe(5);
  });

  // ─── Query trimming ────────────────────────────────────────────────────────

  it('trims whitespace from the query before searching', async () => {
    await getRelevantContext('  pool  ');

    const announcementCall = mockPrisma.announcement.findMany.mock.calls[0]?.[0];
    const whereOr = announcementCall?.where?.OR ?? [];
    // The actual search term should be trimmed
    const titleCondition = whereOr.find((c: Record<string, unknown>) => 'title' in c);
    expect(titleCondition?.title?.contains).toBe('pool');
  });
});

// ─── ContextResult type shape ─────────────────────────────────────────────────

describe('ContextResult type', () => {
  it('result has announcements with id and title fields', async () => {
    mockPrisma.announcement.findMany.mockResolvedValue([sampleAnnouncements[0]]);
    mockPrisma.amenity.findMany.mockResolvedValue([]);
    mockPrisma.document.findMany.mockResolvedValue([]);

    const result: ContextResult = await getRelevantContext('pool');

    expect(result.announcements[0]).toHaveProperty('id');
    expect(result.announcements[0]).toHaveProperty('title');
  });

  it('result has amenities with id and name fields', async () => {
    mockPrisma.announcement.findMany.mockResolvedValue([]);
    mockPrisma.amenity.findMany.mockResolvedValue([sampleAmenities[0]]);
    mockPrisma.document.findMany.mockResolvedValue([]);

    const result: ContextResult = await getRelevantContext('pool');

    expect(result.amenities[0]).toHaveProperty('id');
    expect(result.amenities[0]).toHaveProperty('name');
  });

  it('result has documents with id and title fields', async () => {
    // Use a non-policy category so the document lands in documents (not policies)
    const generalDoc = {
      ...sampleDocuments[0],
      category: { id: 'cat-uuid-general', name: 'General Information', description: null, sortOrder: 0 },
    };
    mockPrisma.announcement.findMany.mockResolvedValue([]);
    mockPrisma.amenity.findMany.mockResolvedValue([]);
    mockPrisma.document.findMany.mockResolvedValue([generalDoc]);

    const result: ContextResult = await getRelevantContext('rules');

    expect(result.documents[0]).toHaveProperty('id');
    expect(result.documents[0]).toHaveProperty('title');
  });
});
