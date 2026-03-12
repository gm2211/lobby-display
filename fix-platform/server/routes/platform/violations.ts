/**
 * Violation API Routes - Platform violation management with status workflow.
 *
 * ROUTES:
 * - GET  /api/platform/violations             - List violations (own for VIEWER, all for EDITOR+)
 * - GET  /api/platform/violations/:id         - Detail with comments
 * - POST /api/platform/violations             - Create violation (EDITOR+ required)
 * - PUT  /api/platform/violations/:id         - Update/transition status (EDITOR+ required)
 * - POST /api/platform/violations/:id/appeal  - Resident appeals (reporter only, CONFIRMED status)
 * - POST /api/platform/violations/:id/comments - Add comment (any authenticated user)
 *
 * STATUS WORKFLOW (enforced server-side):
 *   REPORTED     → UNDER_REVIEW
 *   UNDER_REVIEW → CONFIRMED
 *   CONFIRMED    → RESOLVED
 *   CONFIRMED    → DISMISSED
 *   APPEALED     → UNDER_REVIEW  (back-transition allowed)
 *   Other transitions are rejected with 400.
 *
 * AUTH:
 * - All routes require authentication (requireAuth)
 * - POST / and PUT /:id require EDITOR or ADMIN (requireMinRole('EDITOR'))
 * - POST /:id/appeal: any authenticated user, but only the reporter can appeal
 * - POST /:id/comments: any authenticated user
 *
 * RELATED FILES:
 * - server/middleware/auth.ts        - requireAuth, requireMinRole, AuthorizationError
 * - server/middleware/errorHandler.ts - asyncHandler, NotFoundError, ValidationError
 * - prisma/schema.prisma              - Violation, ViolationComment models
 * - tests/unit/violation-routes.test.ts - unit tests (Prisma mocked)
 */
import { Router } from 'express';
import prisma from '../../db.js';
import {
  asyncHandler,
  NotFoundError,
  ValidationError,
} from '../../middleware/errorHandler.js';
import { requireAuth, requireMinRole, AuthorizationError } from '../../middleware/auth.js';
import { ROLE_LEVEL } from '../../middleware/auth.js';

const router = Router();

/**
 * Valid status transitions for violations.
 * Maps current status → allowed next statuses.
 */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  REPORTED:     ['UNDER_REVIEW'],
  UNDER_REVIEW: ['CONFIRMED'],
  CONFIRMED:    ['RESOLVED', 'DISMISSED'],
  APPEALED:     ['UNDER_REVIEW'],
  RESOLVED:     [],
  DISMISSED:    [],
};

// ─── GET / ───────────────────────────────────────────────────────────────────

/**
 * List violations.
 * - VIEWER sees only their own violations (filtered by reportedBy = session user id)
 * - EDITOR+ sees all violations
 * Optionally filter by ?status=
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { status } = req.query;
    const user = req.session.user!;

    const where: Record<string, unknown> = {};

    // Restrict VIEWER to their own violations — look up PlatformUser UUID
    if ((ROLE_LEVEL[user.role] ?? 0) < (ROLE_LEVEL['EDITOR'] ?? 0)) {
      const platformUser = await prisma.platformUser.findFirst({ where: { userId: user.id } });
      where.reportedBy = platformUser?.id ?? user.id;
    }

    if (status) where.status = status;

    const violations = await prisma.violation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    res.json({ items: violations });
  })
);

// ─── GET /:id ─────────────────────────────────────────────────────────────────

/**
 * Get violation detail by ID, including comments.
 */
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (!id) throw new ValidationError('id is required');

    const violation = await prisma.violation.findUnique({
      where: { id },
      include: {
        comments: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!violation) throw new NotFoundError('Violation not found');

    res.json(violation);
  })
);

// ─── POST / ──────────────────────────────────────────────────────────────────

/**
 * Create a new violation report. EDITOR+ only.
 * Sets default status to REPORTED.
 */
router.post(
  '/',
  requireAuth,
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const { unitNumber, category, description, severity, evidence, fineAmount, assignedTo } = req.body;

    if (!unitNumber) throw new ValidationError('unitNumber is required');
    if (!category) throw new ValidationError('category is required');
    if (!description) throw new ValidationError('description is required');
    if (!severity) throw new ValidationError('severity is required');

    // reportedBy must be a PlatformUser UUID — look up by dashboard User.id
    const platformUser = await prisma.platformUser.findFirst({
      where: { userId: req.session.user!.id },
    });
    if (!platformUser) {
      throw new NotFoundError('PlatformUser record not found for current user');
    }
    const reportedBy = platformUser.id;

    const violation = await prisma.violation.create({
      data: {
        reportedBy,
        unitNumber,
        category,
        description,
        severity,
        status: 'REPORTED',
        ...(evidence !== undefined && { evidence }),
        ...(fineAmount !== undefined && { fineAmount }),
        ...(assignedTo !== undefined && { assignedTo }),
      },
    });

    res.status(201).json(violation);
  })
);

// ─── PUT /:id ─────────────────────────────────────────────────────────────────

/**
 * Update a violation. EDITOR+ only.
 * Enforces status workflow — invalid transitions return 400.
 */
router.put(
  '/:id',
  requireAuth,
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const id = req.params.id;

    const existing = await prisma.violation.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Violation not found');

    const { status, assignedTo, fineAmount, description, category, severity } = req.body;

    // Enforce status transition workflow
    if (status !== undefined && status !== existing.status) {
      const allowed = ALLOWED_TRANSITIONS[existing.status] ?? [];
      if (!allowed.includes(status)) {
        throw new ValidationError(
          `Invalid status transition: ${existing.status} → ${status}. Allowed: ${allowed.join(', ') || 'none'}`
        );
      }
    }

    const data: Record<string, unknown> = {};
    if (status !== undefined) data.status = status;
    if (assignedTo !== undefined) data.assignedTo = assignedTo;
    if (fineAmount !== undefined) data.fineAmount = fineAmount;
    if (description !== undefined) data.description = description;
    if (category !== undefined) data.category = category;
    if (severity !== undefined) data.severity = severity;

    const updated = await prisma.violation.update({
      where: { id },
      data,
    });

    res.json(updated);
  })
);

// ─── POST /:id/appeal ─────────────────────────────────────────────────────────

/**
 * Resident appeals a violation.
 * - Any authenticated user can attempt, but only the reporter can appeal.
 * - Violation must be in CONFIRMED status to appeal.
 * - Sets status to APPEALED.
 */
router.post(
  '/:id/appeal',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = req.params.id;

    const violation = await prisma.violation.findUnique({ where: { id } });
    if (!violation) throw new NotFoundError('Violation not found');

    // Only the reporter can appeal — compare via PlatformUser UUID
    const platformUser = await prisma.platformUser.findFirst({
      where: { userId: req.session.user!.id },
    });
    if (!platformUser || violation.reportedBy !== platformUser.id) {
      throw new AuthorizationError('Only the reporter can appeal this violation');
    }

    // Must be in CONFIRMED status to appeal
    if (violation.status !== 'CONFIRMED') {
      throw new ValidationError(
        `Cannot appeal violation in status ${violation.status}. Only CONFIRMED violations can be appealed.`
      );
    }

    const updated = await prisma.violation.update({
      where: { id },
      data: { status: 'APPEALED' },
    });

    res.json(updated);
  })
);

// ─── POST /:id/comments ────────────────────────────────────────────────────────

/**
 * Add a comment to a violation.
 * Any authenticated user can comment.
 * EDITOR+ can post internal (staff-only) comments via isInternal: true.
 */
router.post(
  '/:id/comments',
  requireAuth,
  asyncHandler(async (req, res) => {
    const violationId = req.params.id;
    const { body, isInternal } = req.body;

    if (!body) throw new ValidationError('body is required');

    const violation = await prisma.violation.findUnique({ where: { id: violationId } });
    if (!violation) throw new NotFoundError('Violation not found');

    // authorId must be a PlatformUser UUID — look up by dashboard User.id
    const platformUser = await prisma.platformUser.findFirst({
      where: { userId: req.session.user!.id },
    });
    if (!platformUser) {
      throw new NotFoundError('PlatformUser record not found for current user');
    }
    const authorId = platformUser.id;

    const comment = await prisma.violationComment.create({
      data: {
        violationId,
        authorId,
        body,
        isInternal: isInternal === true,
      },
    });

    res.status(201).json(comment);
  })
);

export default router;
