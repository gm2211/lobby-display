/**
 * Marketplace API Routes - Resident-to-resident marketplace for listing items.
 *
 * ROUTES:
 * - GET  /api/platform/marketplace/categories  - List distinct categories from listings (any auth). NOTE: before /:id
 * - GET  /api/platform/marketplace             - List active listings, filterable + paginated
 * - GET  /api/platform/marketplace/:id         - Listing detail with images (any auth)
 * - POST /api/platform/marketplace             - Create listing (any auth user with platform user record)
 * - PUT  /api/platform/marketplace/:id         - Update own listing, or EDITOR+ can update any
 * - DELETE /api/platform/marketplace/:id       - Delete own listing, or EDITOR+ can remove any
 *
 * AUTH MODEL:
 * - All GETs require authentication (any role)
 * - POST requires authentication AND a platform user record (req.platformUser)
 * - PUT/:id and DELETE/:id require ownership OR EDITOR+ system role
 *
 * FILTERS (GET /):
 * - ?category=  filter by category (exact match)
 * - ?minPrice=  filter by minimum price (inclusive)
 * - ?maxPrice=  filter by maximum price (inclusive)
 * - ?page=      page number (default 1)
 * - ?pageSize=  items per page (default 20)
 *
 * GOTCHAS:
 * - /categories MUST be mounted BEFORE /:id to avoid route shadowing
 * - MarketplaceListing uses UUID strings as IDs — do NOT use validateId()
 * - req.platformUser is attached by the calling context (platformProtectStrict or test middleware)
 * - Ownership check: listing.sellerId must match req.platformUser?.id
 * - EDITOR+ system role bypass: checked via ROLE_LEVEL on req.session.user.role
 *
 * RELATED FILES:
 * - server/middleware/auth.ts           - requireAuth, ROLE_LEVEL
 * - server/middleware/errorHandler.ts   - asyncHandler, NotFoundError, ValidationError
 * - server/middleware/platformAuth.ts   - platformProtectStrict, PlatformAuthorizationError
 * - prisma/schema.prisma                - MarketplaceListing, ListingImage, ListingStatus models
 * - tests/unit/marketplace-routes.test.ts - unit tests (Prisma mocked)
 */
import { Router } from 'express';
import prisma from '../../db.js';
import {
  asyncHandler,
  NotFoundError,
  ValidationError,
} from '../../middleware/errorHandler.js';
import { requireAuth, ROLE_LEVEL, AuthorizationError } from '../../middleware/auth.js';
import { PlatformAuthorizationError, platformProtectStrict } from '../../middleware/platformAuth.js';

const router = Router();

const DEFAULT_PAGE_SIZE = 20;

/** Returns true if the user has EDITOR or higher system role. */
function isEditorOrAbove(role: string | undefined): boolean {
  return (ROLE_LEVEL[role ?? ''] ?? 0) >= (ROLE_LEVEL['EDITOR'] ?? 1);
}

// ─── GET /categories ──────────────────────────────────────────────────────────
// List distinct categories from existing listings (any auth).
// NOTE: Must be defined BEFORE /:id to avoid route shadowing.

router.get(
  '/categories',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const rows = await prisma.marketplaceListing.groupBy({
      by: ['category'],
      orderBy: { category: 'asc' },
    });

    const categories = rows.map((r: { category: string }) => r.category);
    res.json(categories);
  })
);

// ─── GET /favorites ──────────────────────────────────────────────────────────
// List current user's favorited listings. (REQ-4.17-2)
// NOTE: Must be defined BEFORE /:id to avoid route shadowing.

router.get(
  '/favorites',
  requireAuth,
  platformProtectStrict,
  asyncHandler(async (req, res) => {
    const userId = req.platformUser!.id;

    const favorites = await prisma.listingFavorite.findMany({
      where: { userId },
      include: {
        listing: {
          include: { images: { orderBy: { sortOrder: 'asc' } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(favorites.map((f: { listing: unknown; createdAt: unknown }) => ({
      ...f.listing,
      favoritedAt: f.createdAt,
    })));
  })
);

// ─── GET / ────────────────────────────────────────────────────────────────────
// List active listings. Supports ?category=, ?minPrice=, ?maxPrice=, ?page=, ?pageSize=.

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { category, minPrice, maxPrice } = req.query;
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10) || 1);
    const pageSize = Math.max(1, parseInt((req.query.pageSize as string) || String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE);

    const where: Record<string, unknown> = { status: 'ACTIVE' };

    if (category && typeof category === 'string') {
      where.category = category;
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      const priceFilter: Record<string, number> = {};
      if (minPrice !== undefined) {
        const min = parseFloat(minPrice as string);
        if (!isNaN(min)) priceFilter.gte = min;
      }
      if (maxPrice !== undefined) {
        const max = parseFloat(maxPrice as string);
        if (!isNaN(max)) priceFilter.lte = max;
      }
      if (Object.keys(priceFilter).length > 0) {
        where.price = priceFilter;
      }
    }

    const [listings, total] = await Promise.all([
      prisma.marketplaceListing.findMany({
        where,
        include: { images: { orderBy: { sortOrder: 'asc' } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.marketplaceListing.findMany({ where, select: { id: true } }).then((r: { id: string }[]) => r.length),
    ]);

    res.json({
      listings,
      pagination: {
        page,
        pageSize,
        total,
      },
    });
  })
);

// ─── GET /:id ─────────────────────────────────────────────────────────────────
// Listing detail with images (any auth).

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const listing = await prisma.marketplaceListing.findUnique({
      where: { id },
      include: { images: { orderBy: { sortOrder: 'asc' } } },
    });

    if (!listing) {
      throw new NotFoundError(`MarketplaceListing ${id} not found`);
    }

    res.json(listing);
  })
);

// ─── POST / ───────────────────────────────────────────────────────────────────
// Create a listing (any authenticated user with a platform user record).

router.post(
  '/',
  requireAuth,
  platformProtectStrict,
  asyncHandler(async (req, res) => {
    const { title, description, category, price, condition } = req.body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      throw new ValidationError('title is required');
    }
    if (!description || typeof description !== 'string' || !description.trim()) {
      throw new ValidationError('description is required');
    }
    if (!category || typeof category !== 'string' || !category.trim()) {
      throw new ValidationError('category is required');
    }

    const listing = await prisma.marketplaceListing.create({
      data: {
        sellerId: req.platformUser.id,
        title: title.trim(),
        description: description.trim(),
        category: category.trim(),
        price: price !== undefined && price !== null ? price : undefined,
        condition: condition !== undefined ? condition : undefined,
        status: 'ACTIVE',
      },
      include: { images: true },
    });

    res.status(201).json(listing);
  })
);

// ─── PUT /:id ─────────────────────────────────────────────────────────────────
// Update a listing. Owner can update their own listing. EDITOR+ can update any.

router.put(
  '/:id',
  requireAuth,
  platformProtectStrict,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const existing = await prisma.marketplaceListing.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError(`MarketplaceListing ${id} not found`);
    }

    // Authorization: owner or EDITOR+
    const userRole = req.session.user!.role;
    const platformUserId = req.platformUser!.id;
    const isOwner = platformUserId !== undefined && existing.sellerId === platformUserId;
    const isPrivileged = isEditorOrAbove(userRole);

    if (!isOwner && !isPrivileged) {
      throw new AuthorizationError('You can only update your own listings');
    }

    const { title, description, category, price, condition, status } = req.body;

    const data: Record<string, unknown> = {};
    if (title !== undefined) data.title = typeof title === 'string' ? title.trim() : title;
    if (description !== undefined) data.description = typeof description === 'string' ? description.trim() : description;
    if (category !== undefined) data.category = typeof category === 'string' ? category.trim() : category;
    if (price !== undefined) data.price = price;
    if (condition !== undefined) data.condition = condition;
    if (status !== undefined) data.status = status;

    const updated = await prisma.marketplaceListing.update({
      where: { id },
      data,
      include: { images: { orderBy: { sortOrder: 'asc' } } },
    });

    res.json(updated);
  })
);

// ─── DELETE /:id ──────────────────────────────────────────────────────────────
// Delete a listing. Owner can delete their own. EDITOR+ can delete any.

router.delete(
  '/:id',
  requireAuth,
  platformProtectStrict,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const existing = await prisma.marketplaceListing.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError(`MarketplaceListing ${id} not found`);
    }

    // Authorization: owner or EDITOR+
    const userRole = req.session.user!.role;
    const platformUserId = req.platformUser!.id;
    const isOwner = existing.sellerId === platformUserId;
    const isPrivileged = isEditorOrAbove(userRole);

    if (!isOwner && !isPrivileged) {
      throw new AuthorizationError('You can only delete your own listings');
    }

    await prisma.marketplaceListing.delete({ where: { id } });

    res.status(204).send();
  })
);

// ─── POST /:id/favorite ──────────────────────────────────────────────────────
// Favorite a listing (any authenticated user). (REQ-4.17-2)

router.post(
  '/:id/favorite',
  requireAuth,
  platformProtectStrict,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const listing = await prisma.marketplaceListing.findUnique({ where: { id } });
    if (!listing) {
      throw new NotFoundError(`MarketplaceListing ${id} not found`);
    }

    const userId = req.platformUser!.id;

    // Upsert — idempotent
    const favorite = await prisma.listingFavorite.upsert({
      where: { listingId_userId: { listingId: id, userId } },
      create: { listingId: id, userId },
      update: {},
    });

    res.status(201).json(favorite);
  })
);

// ─── DELETE /:id/favorite ────────────────────────────────────────────────────
// Unfavorite a listing (any authenticated user). (REQ-4.17-2)

router.delete(
  '/:id/favorite',
  requireAuth,
  platformProtectStrict,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.platformUser!.id;

    const existing = await prisma.listingFavorite.findUnique({
      where: { listingId_userId: { listingId: id, userId } },
    });

    if (!existing) {
      throw new NotFoundError('You have not favorited this listing');
    }

    await prisma.listingFavorite.delete({
      where: { listingId_userId: { listingId: id, userId } },
    });

    res.status(204).send();
  })
);

export default router;
