/**
 * Directory API Routes - Building directory entries for residents and staff.
 *
 * Entries are auto-created from PlatformUser — no POST/DELETE routes.
 *
 * ROUTES:
 * - GET /api/platform/directory              - List directory entries (any auth)
 * - GET /api/platform/directory/:id          - Single entry detail (any auth)
 * - PUT /api/platform/directory/:id          - Update own profile or MANAGER+ can update any
 *
 * QUERY PARAMS (GET /):
 * - name        (optional) - case-insensitive search on displayName
 * - unit        (optional) - filter by unitNumber (on related PlatformUser)
 * - boardMember (optional) - 'true' to return only board member entries
 *
 * AUTH MODEL:
 * - All GETs require authentication (any role)
 * - Hidden entries (visible=false) are returned only to: the entry owner or MANAGER+
 * - PUT requires auth; users can update their own entry; MANAGER+ can update any
 * - boardMember flag is computed from user.role === 'BOARD_MEMBER'
 *
 * GOTCHAS:
 * - DirectoryEntry uses UUID strings as IDs
 * - req.platformUser is attached by platformProtectStrict (called at router level)
 *   but here we check req.platformUser inline for the visibility/permission logic
 * - The visible privacy flag hides entries from list/detail for non-owners and non-MANAGER+
 *
 * RELATED FILES:
 * - server/middleware/auth.ts          - requireAuth
 * - server/middleware/errorHandler.ts  - asyncHandler, NotFoundError, ForbiddenError
 * - server/routes/platform/index.ts   - mounts this router at /directory
 * - prisma/schema.prisma               - DirectoryEntry, PlatformUser, PlatformRole models
 * - tests/unit/directory-routes.test.ts - unit tests (Prisma mocked)
 */
import { Router } from 'express';
import type { PlatformRole } from '@prisma/client';
import prisma from '../../db.js';
import {
  asyncHandler,
  NotFoundError,
} from '../../middleware/errorHandler.js';
import { requireAuth, AuthorizationError } from '../../middleware/auth.js';

const router = Router();

/** PlatformRoles that can see hidden entries and update any entry */
const PRIVILEGED_ROLES: PlatformRole[] = ['MANAGER'];

function isPrivileged(role: PlatformRole | undefined): boolean {
  return role !== undefined && PRIVILEGED_ROLES.includes(role);
}

/** Attach boardMember flag computed from user.role */
function withBoardMember(entry: Record<string, unknown>) {
  const user = entry.user as { role?: string } | null | undefined;
  return {
    ...entry,
    boardMember: user?.role === 'BOARD_MEMBER',
  };
}

// ─── GET / ────────────────────────────────────────────────────────────────────
// List directory entries. Searchable by name/unit. Respects visible privacy flag.

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const platformUser = req.platformUser;
    const platformRole = platformUser?.role as PlatformRole | undefined;
    const canSeeHidden = isPrivileged(platformRole);

    const { name, unit, boardMember: boardMemberParam } = req.query;

    // Build the where clause
    const where: Record<string, unknown> = {};

    // Non-privileged users can only see visible entries
    if (!canSeeHidden) {
      where.visible = true;
    }

    // Optional name search (case-insensitive, on displayName)
    if (typeof name === 'string' && name.trim()) {
      where.displayName = { contains: name.trim(), mode: 'insensitive' };
    }

    // Optional unit search (on related PlatformUser.unitNumber)
    if (typeof unit === 'string' && unit.trim()) {
      where.user = { unitNumber: { contains: unit.trim(), mode: 'insensitive' } };
    }

    // Optional boardMember filter
    if (boardMemberParam === 'true') {
      where.user = {
        ...(where.user as Record<string, unknown> | undefined),
        role: 'BOARD_MEMBER',
      };
    }

    const entries = await prisma.directoryEntry.findMany({
      where,
      include: {
        user: {
          select: { id: true, role: true, unitNumber: true },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { displayName: 'asc' }],
    });

    res.json(entries.map(withBoardMember));
  }),
);

// ─── GET /:id ─────────────────────────────────────────────────────────────────
// Single entry detail. Hidden entries are only returned to owners or MANAGER+.

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const platformUser = req.platformUser;
    const platformRole = platformUser?.role as PlatformRole | undefined;
    const canSeeHidden = isPrivileged(platformRole);

    const entry = await prisma.directoryEntry.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, role: true, unitNumber: true },
        },
      },
    });

    if (!entry) {
      throw new NotFoundError(`DirectoryEntry ${id} not found`);
    }

    // Check visibility: hidden entries are restricted to owners and MANAGER+
    if (!entry.visible && !canSeeHidden) {
      const isOwner = platformUser?.id === entry.userId;
      if (!isOwner) {
        throw new AuthorizationError('You do not have permission to view this entry');
      }
    }

    res.json(withBoardMember(entry as unknown as Record<string, unknown>));
  }),
);

// ─── PUT /:id ─────────────────────────────────────────────────────────────────
// Update a directory entry. Users can update their own profile; MANAGER+ can update any.

router.put(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const platformUser = req.platformUser;
    const platformRole = platformUser?.role as PlatformRole | undefined;
    const canUpdateAny = isPrivileged(platformRole);

    const existing = await prisma.directoryEntry.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, role: true, unitNumber: true },
        },
      },
    });

    if (!existing) {
      throw new NotFoundError(`DirectoryEntry ${id} not found`);
    }

    // Check permission: must be owner or MANAGER+
    const isOwner = platformUser?.id === existing.userId;
    if (!canUpdateAny && !isOwner) {
      throw new AuthorizationError('You do not have permission to update this entry');
    }

    // Only update provided fields
    const { displayName, title, department, phone, email, photoUrl, visible, sortOrder } =
      req.body;

    const data: Record<string, unknown> = {};
    if (displayName !== undefined)
      data.displayName = typeof displayName === 'string' ? displayName.trim() : displayName;
    if (title !== undefined) data.title = typeof title === 'string' ? title.trim() : title;
    if (department !== undefined)
      data.department = typeof department === 'string' ? department.trim() : department;
    if (phone !== undefined) data.phone = typeof phone === 'string' ? phone.trim() : phone;
    if (email !== undefined) data.email = typeof email === 'string' ? email.trim() : email;
    if (photoUrl !== undefined) data.photoUrl = photoUrl;
    if (visible !== undefined) data.visible = Boolean(visible);
    if (sortOrder !== undefined) data.sortOrder = Number(sortOrder);

    const updated = await prisma.directoryEntry.update({
      where: { id },
      data,
      include: {
        user: {
          select: { id: true, role: true, unitNumber: true },
        },
      },
    });

    res.json(withBoardMember(updated as unknown as Record<string, unknown>));
  }),
);

export default router;
