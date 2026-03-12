/**
 * Consent Forms API Routes - E-consent form management and signature collection.
 *
 * ROUTES:
 * - GET /api/platform/consent                  - List consent forms (any auth). Supports ?active=true filter. Includes signature count.
 * - GET /api/platform/consent/my-signatures    - List current user's signatures (any auth). NOTE: must be before /:id
 * - GET /api/platform/consent/manage           - List all forms with status mapping (EDITOR+). Used by ConsentManagement page.
 * - POST /api/platform/consent/manage          - Create consent form with status (EDITOR+)
 * - PUT /api/platform/consent/manage/:id       - Update consent form with status (EDITOR+)
 * - GET /api/platform/consent/manage/:id/signatures - Signatures with user names (EDITOR+)
 * - GET /api/platform/consent/:id              - Consent form detail with signatures (any auth)
 * - POST /api/platform/consent                 - Create consent form (EDITOR+)
 * - PUT /api/platform/consent/:id              - Update consent form (EDITOR+)
 * - DELETE /api/platform/consent/:id           - Delete consent form with cascaded signatures (EDITOR+)
 * - POST /api/platform/consent/:id/sign        - Sign consent form (any auth). Captures ipAddress and userAgent.
 * - GET /api/platform/consent/:id/signatures   - List signatures for a form (EDITOR+)
 *
 * AUTH MODEL:
 * - All GETs require authentication (any role)
 * - POST /create, PUT, DELETE require EDITOR+
 * - POST /:id/sign is open to any authenticated user
 * - GET /:id/signatures requires EDITOR+
 *
 * GOTCHAS:
 * - ConsentForm uses UUID strings as IDs, NOT integers — do NOT use validateId()
 * - /my-signatures MUST be mounted BEFORE /:id to avoid route shadowing
 * - Duplicate signatures are rejected (@@unique [formId, userId] in schema)
 * - Cascade delete: signatures are deleted before the form is deleted
 * - req.session.user!.id is a number in the session but must be cast to string for PlatformUser FK
 *
 * RELATED FILES:
 * - server/middleware/auth.ts          - requireAuth, requireMinRole
 * - server/middleware/errorHandler.ts  - asyncHandler, NotFoundError, ValidationError
 * - server/middleware/platformAuth.ts  - platformProtect (applied at router level in index.ts)
 * - prisma/schema.prisma               - ConsentForm, ConsentSignature, PlatformRole models
 * - tests/unit/consent-routes.test.ts  - unit tests (Prisma mocked)
 */
import { Router } from 'express';
import prisma from '../../db.js';
import {
  asyncHandler,
  NotFoundError,
  ValidationError,
} from '../../middleware/errorHandler.js';
import { requireAuth, requireMinRole } from '../../middleware/auth.js';

const router = Router();

// ─── GET / ───────────────────────────────────────────────────────────────────
// List consent forms. Supports ?active=true filter. Includes signature count.

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const where: Record<string, unknown> = {};

    if (req.query.active === 'true') {
      where.active = true;
    } else if (req.query.active === 'false') {
      where.active = false;
    }

    const forms = await prisma.consentForm.findMany({
      where,
      include: {
        _count: { select: { signatures: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(forms);
  })
);

// ─── GET /my-signatures ───────────────────────────────────────────────────────
// List current user's consent signatures (any auth).
// NOTE: Must be defined BEFORE /:id to avoid route conflict.

router.get(
  '/my-signatures',
  requireAuth,
  asyncHandler(async (req, res) => {
    // ConsentSignature.userId is a PlatformUser UUID — look up via dashboard User.id
    const platformUser = await prisma.platformUser.findFirst({
      where: { userId: req.session.user!.id },
    });
    const userId = platformUser?.id ?? (req.session.user!.id as unknown as string);

    const signatures = await prisma.consentSignature.findMany({
      where: { userId },
      include: {
        form: {
          select: { id: true, title: true, version: true, active: true },
        },
      },
      orderBy: { signedAt: 'desc' },
    });

    res.json(signatures);
  })
);

// ─── Manage routes (/manage/*) ───────────────────────────────────────────────
// Used by the ConsentManagement admin page. Maps the DB `active` boolean to
// a status string (ACTIVE / ARCHIVED / DRAFT) that the frontend expects.

function activeToStatus(active: boolean): string {
  return active ? 'ACTIVE' : 'ARCHIVED';
}

function statusToActive(status: string): boolean {
  return status === 'ACTIVE';
}

// GET /manage — List all consent forms with status field
router.get(
  '/manage',
  requireAuth,
  requireMinRole('EDITOR'),
  asyncHandler(async (_req, res) => {
    const forms = await prisma.consentForm.findMany({
      include: {
        _count: { select: { signatures: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const mapped = forms.map(f => ({
      id: f.id,
      title: f.title,
      body: f.body,
      status: activeToStatus(f.active),
      requiredRoles: f.requiredForRoles,
      createdAt: f.createdAt.toISOString(),
      updatedAt: f.updatedAt.toISOString(),
      _count: f._count,
    }));

    res.json(mapped);
  })
);

// POST /manage — Create consent form with status
router.post(
  '/manage',
  requireAuth,
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const { title, body, requiredRoles, status } = req.body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      throw new ValidationError('title is required');
    }
    if (!body || typeof body !== 'string' || !body.trim()) {
      throw new ValidationError('body is required');
    }

    const creatorPlatformUser = await prisma.platformUser.findFirst({
      where: { userId: req.session.user!.id },
    });
    if (!creatorPlatformUser) {
      throw new NotFoundError('PlatformUser record not found for current user');
    }

    const form = await prisma.consentForm.create({
      data: {
        title: title.trim(),
        body: body.trim(),
        version: 1,
        requiredForRoles: requiredRoles ?? [],
        active: status ? statusToActive(status) : false,
        createdBy: creatorPlatformUser.id,
      },
      include: {
        _count: { select: { signatures: true } },
      },
    });

    res.status(201).json({
      id: form.id,
      title: form.title,
      body: form.body,
      status: activeToStatus(form.active),
      requiredRoles: form.requiredForRoles,
      createdAt: form.createdAt.toISOString(),
      updatedAt: form.updatedAt.toISOString(),
      _count: form._count,
    });
  })
);

// PUT /manage/:id — Update consent form with status
router.put(
  '/manage/:id',
  requireAuth,
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const existing = await prisma.consentForm.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError(`ConsentForm ${id} not found`);
    }

    const { title, body, requiredRoles, status } = req.body;

    const data: Record<string, unknown> = {};
    if (title !== undefined) data.title = typeof title === 'string' ? title.trim() : title;
    if (body !== undefined) data.body = typeof body === 'string' ? body.trim() : body;
    if (requiredRoles !== undefined) data.requiredForRoles = requiredRoles;
    if (status !== undefined) data.active = statusToActive(status);

    const updated = await prisma.consentForm.update({
      where: { id },
      data,
      include: {
        _count: { select: { signatures: true } },
      },
    });

    res.json({
      id: updated.id,
      title: updated.title,
      body: updated.body,
      status: activeToStatus(updated.active),
      requiredRoles: updated.requiredForRoles,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      _count: updated._count,
    });
  })
);

// GET /manage/:id/signatures — Signatures with user names for CSV export
router.get(
  '/manage/:id/signatures',
  requireAuth,
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const form = await prisma.consentForm.findUnique({ where: { id } });
    if (!form) {
      throw new NotFoundError(`ConsentForm ${id} not found`);
    }

    const signatures = await prisma.consentSignature.findMany({
      where: { formId: id },
      include: {
        user: {
          select: {
            id: true,
            user: {
              select: { displayName: true, username: true },
            },
          },
        },
      },
      orderBy: { signedAt: 'desc' },
    });

    const mapped = signatures.map(sig => ({
      id: sig.id,
      consentFormId: sig.formId,
      userId: sig.userId,
      userName: sig.user?.user?.displayName ?? sig.user?.user?.username ?? 'Unknown',
      signedAt: sig.signedAt.toISOString(),
    }));

    res.json(mapped);
  })
);

// ─── GET /:id ─────────────────────────────────────────────────────────────────
// Consent form detail with signatures (any auth).

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const form = await prisma.consentForm.findUnique({
      where: { id },
      include: {
        signatures: {
          orderBy: { signedAt: 'desc' },
        },
        _count: { select: { signatures: true } },
      },
    });

    if (!form) {
      throw new NotFoundError(`ConsentForm ${id} not found`);
    }

    res.json(form);
  })
);

// ─── POST / ───────────────────────────────────────────────────────────────────
// Create a consent form (EDITOR+).

router.post(
  '/',
  requireAuth,
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const { title, body, version, requiredForRoles, active } = req.body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      throw new ValidationError('title is required');
    }
    if (!body || typeof body !== 'string' || !body.trim()) {
      throw new ValidationError('body is required');
    }
    if (version === undefined || version === null) {
      throw new ValidationError('version is required');
    }
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
      throw new ValidationError('version must be a positive integer');
    }

    // ConsentForm.createdBy is a PlatformUser UUID — look up via dashboard User.id
    const creatorPlatformUser = await prisma.platformUser.findFirst({
      where: { userId: req.session.user!.id },
    });
    if (!creatorPlatformUser) {
      throw new NotFoundError('PlatformUser record not found for current user');
    }
    const createdBy = creatorPlatformUser.id;

    const form = await prisma.consentForm.create({
      data: {
        title: title.trim(),
        body: body.trim(),
        version,
        requiredForRoles: requiredForRoles ?? [],
        active: active !== undefined ? Boolean(active) : true,
        createdBy,
      },
      include: {
        _count: { select: { signatures: true } },
      },
    });

    res.status(201).json(form);
  })
);

// ─── PUT /:id ─────────────────────────────────────────────────────────────────
// Update a consent form (EDITOR+). All fields are optional.

router.put(
  '/:id',
  requireAuth,
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const existing = await prisma.consentForm.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError(`ConsentForm ${id} not found`);
    }

    const { title, body, version, requiredForRoles, active } = req.body;

    if (version !== undefined) {
      if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
        throw new ValidationError('version must be a positive integer');
      }
    }

    const data: Record<string, unknown> = {};
    if (title !== undefined) data.title = typeof title === 'string' ? title.trim() : title;
    if (body !== undefined) data.body = typeof body === 'string' ? body.trim() : body;
    if (version !== undefined) data.version = version;
    if (requiredForRoles !== undefined) data.requiredForRoles = requiredForRoles;
    if (active !== undefined) data.active = Boolean(active);

    const updated = await prisma.consentForm.update({
      where: { id },
      data,
      include: {
        _count: { select: { signatures: true } },
      },
    });

    res.json(updated);
  })
);

// ─── DELETE /:id ──────────────────────────────────────────────────────────────
// Delete a consent form (EDITOR+). Cascades to signatures.

router.delete(
  '/:id',
  requireAuth,
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const existing = await prisma.consentForm.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError(`ConsentForm ${id} not found`);
    }

    // Cascade delete signatures first, then the form
    await prisma.consentSignature.deleteMany({ where: { formId: id } });
    await prisma.consentForm.delete({ where: { id } });

    res.status(204).send();
  })
);

// ─── POST /:id/sign ───────────────────────────────────────────────────────────
// Sign a consent form (any auth). Rejects if already signed.

router.post(
  '/:id/sign',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const form = await prisma.consentForm.findUnique({ where: { id } });
    if (!form) {
      throw new NotFoundError(`ConsentForm ${id} not found`);
    }

    // ConsentSignature.userId is a PlatformUser UUID — look up via dashboard User.id
    const platformUser = await prisma.platformUser.findFirst({
      where: { userId: req.session.user!.id },
    });
    if (!platformUser) {
      throw new NotFoundError('PlatformUser record not found for current user');
    }
    const userId = platformUser.id;

    // Check for existing signature
    const existing = await prisma.consentSignature.findUnique({
      where: { formId_userId: { formId: id, userId } },
    });
    if (existing) {
      throw new ValidationError('You have already signed this consent form');
    }

    const ipAddress = req.ip ?? null;
    const userAgent = (req.headers['user-agent'] as string | undefined) ?? null;

    const signature = await prisma.consentSignature.create({
      data: {
        formId: id,
        userId,
        ipAddress,
        userAgent,
      },
    });

    res.status(201).json(signature);
  })
);

// ─── GET /:id/signatures ──────────────────────────────────────────────────────
// List signatures for a consent form (EDITOR+).

router.get(
  '/:id/signatures',
  requireAuth,
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const form = await prisma.consentForm.findUnique({ where: { id } });
    if (!form) {
      throw new NotFoundError(`ConsentForm ${id} not found`);
    }

    const signatures = await prisma.consentSignature.findMany({
      where: { formId: id },
      include: {
        user: {
          select: {
            id: true,
            role: true,
            unitNumber: true,
            user: {
              select: { id: true, username: true, displayName: true },
            },
          },
        },
      },
      orderBy: { signedAt: 'desc' },
    });

    res.json(signatures);
  })
);

export default router;
