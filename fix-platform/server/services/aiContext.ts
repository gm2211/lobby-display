/**
 * AI Context Retrieval Service - Keyword-based context search for the AI assistant.
 *
 * PURPOSE:
 * Provides relevant building context to the AI assistant by performing simple
 * case-insensitive keyword matching against platform data. No RAG/vector search —
 * just substring matching via Prisma's `contains` + `mode: 'insensitive'`.
 *
 * EXPORTS:
 * - ContextResult: Shape of the returned context object
 * - getRelevantContext(query): Searches across announcements, amenities, documents, policies
 *
 * SEARCH CATEGORIES:
 * - announcements: Active (not deleted) announcements matching title or body
 * - amenities:     Active amenities matching name or description
 * - documents:     Active documents matching title or description (non-policy)
 * - policies:      Active documents in policy/FAQ-related categories
 *
 * POLICY CATEGORY DETECTION:
 * Documents are classified as "policies" when their category name contains any of
 * the policy keywords: ['policy', 'policies', 'rules', 'regulations', 'faq', 'guidelines'].
 * All other matching documents go into the general `documents` bucket.
 *
 * LIMITS:
 * Each category returns at most 5 results (enforced via Prisma `take: 5`).
 *
 * EMPTY QUERY:
 * An empty or whitespace-only query returns empty arrays without touching the DB.
 *
 * USAGE:
 * ```typescript
 * import { getRelevantContext } from './aiContext.js';
 *
 * const context = await getRelevantContext('pool booking rules');
 * // context.announcements — relevant announcements
 * // context.amenities     — relevant amenities
 * // context.documents     — relevant general documents
 * // context.policies      — relevant policy/FAQ documents
 * ```
 *
 * RELATED FILES:
 * - server/routes/platform/assistant.ts  - AI assistant routes (consumer)
 * - server/services/llmProvider.ts       - LLM provider (context is injected here)
 * - tests/unit/aiContext.test.ts         - unit tests
 * - prisma/schema.prisma                 - Announcement, Amenity, Document models
 */
import prisma from '../db.js';

/** Keywords that identify a document category as policy/FAQ content. */
const POLICY_CATEGORY_KEYWORDS = ['policy', 'policies', 'rules', 'regulations', 'faq', 'guidelines'];

/** Maximum results returned per category. */
const MAX_RESULTS_PER_CATEGORY = 5;

/** Shape of a single announcement result. */
export interface AnnouncementContext {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  priority: number;
  publishedAt: Date | null;
  expiresAt: Date | null;
}

/** Shape of a single amenity result. */
export interface AmenityContext {
  id: string;
  name: string;
  description: string;
  location: string | null;
  capacity: number | null;
  availableFrom: string;
  availableTo: string;
}

/** Shape of a single document result (general or policy). */
export interface DocumentContext {
  id: string;
  title: string;
  description: string | null;
  category: {
    id: string;
    name: string;
  };
}

/** Structured context result returned by getRelevantContext(). */
export interface ContextResult {
  announcements: AnnouncementContext[];
  amenities: AmenityContext[];
  documents: DocumentContext[];
  policies: DocumentContext[];
}

/**
 * Retrieve relevant context for the AI assistant by keyword matching.
 *
 * @param query - The user's query string. Empty/whitespace returns empty arrays.
 * @returns Structured context grouped by category (max 5 per bucket).
 */
export async function getRelevantContext(query: string): Promise<ContextResult> {
  const trimmed = query.trim();

  // Return empty result for blank queries — no DB calls needed
  if (!trimmed) {
    return {
      announcements: [],
      amenities: [],
      documents: [],
      policies: [],
    };
  }

  const keyword = trimmed;
  const matchCondition = { contains: keyword, mode: 'insensitive' as const };

  // Run all three searches in parallel for performance
  const [announcements, amenities, allDocuments] = await Promise.all([
    // Search announcements by title or body
    prisma.announcement.findMany({
      where: {
        markedForDeletion: false,
        OR: [
          { title: matchCondition },
          { body: matchCondition },
        ],
      },
      select: {
        id: true,
        title: true,
        body: true,
        pinned: true,
        priority: true,
        publishedAt: true,
        expiresAt: true,
      },
      orderBy: [{ pinned: 'desc' }, { priority: 'desc' }, { createdAt: 'desc' }],
      take: MAX_RESULTS_PER_CATEGORY,
    }),

    // Search amenities by name or description (active only)
    prisma.amenity.findMany({
      where: {
        active: true,
        OR: [
          { name: matchCondition },
          { description: matchCondition },
        ],
      },
      select: {
        id: true,
        name: true,
        description: true,
        location: true,
        capacity: true,
        availableFrom: true,
        availableTo: true,
      },
      orderBy: { name: 'asc' },
      take: MAX_RESULTS_PER_CATEGORY,
    }),

    // Search documents by title or description (active only), include category for policy detection
    prisma.document.findMany({
      where: {
        active: true,
        OR: [
          { title: matchCondition },
          { description: matchCondition },
        ],
      },
      select: {
        id: true,
        title: true,
        description: true,
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_RESULTS_PER_CATEGORY,
    }),
  ]);

  // Partition documents into policies vs general based on category name keywords
  const documents: DocumentContext[] = [];
  const policies: DocumentContext[] = [];

  for (const doc of allDocuments) {
    const categoryNameLower = doc.category.name.toLowerCase();
    const isPolicy = POLICY_CATEGORY_KEYWORDS.some(kw => categoryNameLower.includes(kw));

    if (isPolicy) {
      policies.push(doc);
    } else {
      documents.push(doc);
    }
  }

  return {
    announcements,
    amenities,
    documents,
    policies,
  };
}
