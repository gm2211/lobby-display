/**
 * Platform Navigation API Route
 *
 * Returns dynamic sidebar navigation items with badge counts computed from
 * live DB queries for the currently authenticated user.
 *
 * ROUTES:
 * - GET /api/platform/nav — returns items and (conditionally) managerItems
 *
 * RESPONSE SHAPE:
 * {
 *   "items": [
 *     { "label": "Announcements", "icon": "megaphone", "path": "/platform/announcements", "badge": 3 },
 *     ...
 *   ],
 *   "managerItems": [           // only for MANAGER+ platform roles
 *     { "label": "Violations", "icon": "alert-triangle", "path": "/platform/violations", "badge": 0 },
 *     ...
 *   ]
 * }
 *
 * BADGE QUERIES:
 * - Announcements: count of announcements with no read receipt for current user
 * - Maintenance: count of OPEN/ASSIGNED/IN_PROGRESS requests created by current user
 * - Parcels: count of uncollected (RECEIVED or NOTIFIED) parcels for current user
 * - Payments: count of PENDING payments for current user
 *
 * AUTH:
 * - Requires authentication (session user + req.platformUser attached)
 * - managerItems only included for MANAGER and BOARD_MEMBER platform roles
 *
 * RELATED FILES:
 * - server/middleware/platformAuth.ts - platformProtectStrict attaches req.platformUser
 * - server/middleware/auth.ts         - requireAuth
 * - server/routes/platform/index.ts  - mounts this router at /nav
 * - prisma/schema.prisma              - Announcement, MaintenanceRequest, Parcel, Payment models
 * - tests/unit/nav-routes.test.ts    - unit tests (Prisma mocked)
 */
import { Router } from 'express';
import type { PlatformRole } from '@prisma/client';
import prisma from '../../db.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { requireAuth, AuthenticationError } from '../../middleware/auth.js';
import { getOrCreatePlatformUser } from '../../middleware/platformAuth.js';

const router = Router();

/** Platform roles that receive managerItems in the nav response */
const MANAGER_ROLES: PlatformRole[] = ['MANAGER', 'BOARD_MEMBER'];

interface NavItem {
  label: string;
  icon: string;
  path: string;
  badge: number | null;
}

/**
 * GET / — Dynamic sidebar navigation with live badge counts.
 *
 * Requires authentication. The req.platformUser must be attached (by
 * platformProtectStrict middleware or test injection).
 *
 * Badge counts run in parallel via Promise.all to minimize latency.
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.session?.user) throw new AuthenticationError();

    // platformUser may be attached by platformProtectStrict (or test middleware).
    // If not present, auto-provision for ADMIN/EDITOR dashboard users.
    const platformUser =
      (req as any).platformUser ??
      (await getOrCreatePlatformUser(req.session.user.id, req.session.user.role));
    if (!platformUser) throw new AuthenticationError('Platform user not found');

    const platformUserId: string = platformUser.id;

    // ── Parallel badge count queries ───────────────────────────────────────
    const [announcementBadge, maintenanceBadge, parcelBadge, paymentBadge] =
      await Promise.all([
        // Unread announcements: announcements where no read receipt exists for this user
        prisma.announcement.count({
          where: {
            markedForDeletion: false,
            reads: {
              none: {
                userId: platformUserId,
              },
            },
          },
        }),

        // Open maintenance requests created by this user
        prisma.maintenanceRequest.count({
          where: {
            reportedBy: platformUserId,
            status: {
              in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'],
            },
            markedForDeletion: false,
          },
        }),

        // Uncollected parcels for this user (RECEIVED or NOTIFIED)
        prisma.parcel.count({
          where: {
            recipientId: platformUserId,
            status: {
              in: ['RECEIVED', 'NOTIFIED'],
            },
            markedForDeletion: false,
          },
        }),

        // Pending payments for this user
        prisma.payment.count({
          where: {
            userId: platformUserId,
            status: 'PENDING',
          },
        }),
      ]);

    // ── Static nav items with dynamic badge counts ─────────────────────────
    const items: NavItem[] = [
      {
        label: 'Announcements',
        icon: 'megaphone',
        path: '/platform/announcements',
        badge: announcementBadge,
      },
      {
        label: 'Maintenance',
        icon: 'wrench',
        path: '/platform/maintenance',
        badge: maintenanceBadge,
      },
      {
        label: 'Amenities',
        icon: 'building',
        path: '/platform/amenities',
        badge: null,
      },
      {
        label: 'Parcels',
        icon: 'package',
        path: '/platform/parcels',
        badge: parcelBadge,
      },
      {
        label: 'Events',
        icon: 'calendar',
        path: '/platform/events',
        badge: null,
      },
      {
        label: 'Payments',
        icon: 'credit-card',
        path: '/platform/payments',
        badge: paymentBadge,
      },
      {
        label: 'Visitors',
        icon: 'users',
        path: '/platform/visitors',
        badge: null,
      },
      {
        label: 'Documents',
        icon: 'file-text',
        path: '/platform/documents',
        badge: null,
      },
      {
        label: 'Directory',
        icon: 'book',
        path: '/platform/directory',
        badge: null,
      },
      {
        label: 'Forum',
        icon: 'message-square',
        path: '/platform/forum',
        badge: null,
      },
      {
        label: 'Marketplace',
        icon: 'shopping-bag',
        path: '/platform/marketplace',
        badge: null,
      },
    ];

    // ── Build response ─────────────────────────────────────────────────────
    const response: { items: NavItem[]; managerItems?: NavItem[] } = { items };

    // managerItems only shown to MANAGER+ roles
    if (MANAGER_ROLES.includes(platformUser.role as PlatformRole)) {
      const managerItems: NavItem[] = [
        {
          label: 'Violations',
          icon: 'alert-triangle',
          path: '/platform/violations',
          badge: 0,
        },
        {
          label: 'Training',
          icon: 'book-open',
          path: '/platform/training',
          badge: null,
        },
        {
          label: 'Surveys',
          icon: 'clipboard',
          path: '/platform/surveys',
          badge: null,
        },
        {
          label: 'Consent Forms',
          icon: 'file-check',
          path: '/platform/consent',
          badge: null,
        },
      ];

      response.managerItems = managerItems;
    }

    res.json(response);
  })
);

export default router;
