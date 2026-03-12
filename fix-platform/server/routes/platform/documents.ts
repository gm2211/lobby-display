/**
 * Platform Documents API Routes
 *
 * Handles document category management, document CRUD, and versioning.
 * Documents are organized into categories and each document tracks versions.
 *
 * ROUTES:
 * - GET  /api/platform/documents/categories          - List document categories (any auth)
 * - POST /api/platform/documents/categories          - Create category (EDITOR+)
 * - GET  /api/platform/documents                     - List documents with latest version info (any auth)
 * - GET  /api/platform/documents/:id                 - Document detail with all versions (any auth)
 * - POST /api/platform/documents                     - Create document + first version (EDITOR+)
 * - PUT  /api/platform/documents/:id                 - Update document metadata (EDITOR+)
 * - POST /api/platform/documents/:id/versions        - Upload new version (EDITOR+)
 * - DELETE /api/platform/documents/:id               - Delete document and all versions (EDITOR+)
 *
 * AUTH MODEL:
 * - All routes require authentication (via platformProtect on the parent router)
 * - GET routes are open to any authenticated user
 * - POST/PUT/DELETE routes require EDITOR or ADMIN role
 *
 * RELATED FILES:
 * - server/middleware/auth.ts        - requireAuth, requireMinRole
 * - server/middleware/errorHandler.ts - asyncHandler, validateId, NotFoundError, ValidationError
 * - prisma/schema.prisma             - DocumentCategory, Document, DocumentVersion
 * - tests/unit/document-routes.test.ts - unit tests (Prisma mocked)
 */
import { Router } from 'express';
import prisma from '../../db.js';
import {
  asyncHandler,
  NotFoundError,
  ValidationError,
} from '../../middleware/errorHandler.js';
import { requireAuth, requireMinRole } from '../../middleware/auth.js';
import { getOrCreatePlatformUser } from '../../middleware/platformAuth.js';

const router = Router();

// ─── GET /categories ─────────────────────────────────────────────────────────
// List all document categories ordered by sortOrder then name

router.get(
  '/categories',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const categories = await prisma.documentCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    res.json(categories);
  })
);

// ─── POST /categories ────────────────────────────────────────────────────────
// Create a new document category (EDITOR+)

router.post(
  '/categories',
  requireAuth,
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const { name, description, sortOrder } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      throw new ValidationError('name is required');
    }

    const category = await prisma.documentCategory.create({
      data: {
        name: name.trim(),
        description: description ?? null,
        sortOrder: typeof sortOrder === 'number' ? sortOrder : 0,
      },
    });

    res.status(201).json(category);
  })
);

// ─── GET / ───────────────────────────────────────────────────────────────────
// List documents with optional filters and latest version info

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { categoryId, active } = req.query;

    const where: Record<string, unknown> = {};

    if (categoryId) {
      if (typeof categoryId !== 'string' || !categoryId.trim()) {
        throw new ValidationError('categoryId must be a non-empty string');
      }
      where.categoryId = categoryId;
    }

    if (active !== undefined) {
      if (active !== 'true' && active !== 'false') {
        throw new ValidationError('active must be "true" or "false"');
      }
      where.active = active === 'true';
    }

    const documents = await prisma.document.findMany({
      where,
      include: {
        category: true,
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ items: documents });
  })
);

// ─── GET /:id ────────────────────────────────────────────────────────────────
// Document detail with all versions

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!id || !id.trim()) {
      throw new ValidationError('Invalid id: must be a non-empty string');
    }

    const document = await prisma.document.findUnique({
      where: { id },
      include: {
        category: true,
        versions: {
          orderBy: { version: 'desc' },
        },
      },
    });

    if (!document) {
      throw new NotFoundError(`Document ${id} not found`);
    }

    res.json(document);
  })
);

// ─── GET /:id/download ──────────────────────────────────────────────────────
// Download (redirect to storagePath) of the latest or a specific version
// Accepts optional ?version=N query param; defaults to latest.

router.get(
  '/:id/download',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { version } = req.query;

    const versionFilter = version ? { version: Number(version) } : {};

    const document = await prisma.document.findUnique({
      where: { id },
      include: {
        versions: {
          where: versionFilter,
          orderBy: { version: 'desc' as const },
          take: 1,
        },
      },
    });

    if (!document) {
      throw new NotFoundError(`Document ${id} not found`);
    }

    const docVersion = document.versions[0];
    if (!docVersion) {
      throw new NotFoundError(`No version found for document ${id}`);
    }

    // Redirect to the storage path (S3 pre-signed URL, CDN, etc.)
    res.redirect(docVersion.storagePath);
  })
);

// ─── POST / ──────────────────────────────────────────────────────────────────
// Create a new document with its first version (EDITOR+)

router.post(
  '/',
  requireAuth,
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const {
      title,
      description,
      categoryId,
      filename,
      mimeType,
      size,
      storagePath,
    } = req.body;

    const user = req.session.user!;

    if (!title || typeof title !== 'string' || !title.trim()) {
      throw new ValidationError('title is required');
    }
    if (!categoryId || typeof categoryId !== 'string' || !categoryId.trim()) {
      throw new ValidationError('categoryId is required');
    }
    if (!filename || typeof filename !== 'string' || !filename.trim()) {
      throw new ValidationError('filename is required');
    }
    if (!mimeType || typeof mimeType !== 'string' || !mimeType.trim()) {
      throw new ValidationError('mimeType is required');
    }
    if (size === undefined || size === null || typeof size !== 'number' || size < 0) {
      throw new ValidationError('size is required and must be a non-negative number');
    }
    if (!storagePath || typeof storagePath !== 'string' || !storagePath.trim()) {
      throw new ValidationError('storagePath is required');
    }

    // Verify category exists
    const category = await prisma.documentCategory.findUnique({
      where: { id: categoryId },
    });
    if (!category) {
      throw new NotFoundError(`DocumentCategory ${categoryId} not found`);
    }

    // Find or auto-provision the platform user for the uploadedBy field
    const platformUser = await getOrCreatePlatformUser(user.id, user.role);
    if (!platformUser) {
      throw new ValidationError('No platform user record found for this user');
    }

    const document = await prisma.document.create({
      data: {
        title: title.trim(),
        description: description ?? null,
        categoryId,
        uploadedBy: platformUser.id,
        active: true,
        versions: {
          create: {
            version: 1,
            filename: filename.trim(),
            mimeType: mimeType.trim(),
            size,
            storagePath: storagePath.trim(),
            uploadedBy: platformUser.id,
          },
        },
      },
      include: {
        category: true,
        versions: {
          orderBy: { version: 'desc' },
        },
      },
    });

    res.status(201).json(document);
  })
);

// ─── PUT /:id ────────────────────────────────────────────────────────────────
// Update document metadata (EDITOR+)

router.put(
  '/:id',
  requireAuth,
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!id || !id.trim()) {
      throw new ValidationError('Invalid id: must be a non-empty string');
    }

    const existing = await prisma.document.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError(`Document ${id} not found`);
    }

    const { title, description, categoryId, active } = req.body;

    const data: Record<string, unknown> = {};

    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) {
        throw new ValidationError('title must be a non-empty string');
      }
      data.title = title.trim();
    }

    if (description !== undefined) {
      data.description = description;
    }

    if (categoryId !== undefined) {
      if (typeof categoryId !== 'string' || !categoryId.trim()) {
        throw new ValidationError('categoryId must be a non-empty string');
      }
      // Verify category exists
      const category = await prisma.documentCategory.findUnique({
        where: { id: categoryId },
      });
      if (!category) {
        throw new NotFoundError(`DocumentCategory ${categoryId} not found`);
      }
      data.categoryId = categoryId;
    }

    if (active !== undefined) {
      if (typeof active !== 'boolean') {
        throw new ValidationError('active must be a boolean');
      }
      data.active = active;
    }

    const updated = await prisma.document.update({
      where: { id },
      data,
      include: {
        category: true,
        versions: {
          orderBy: { version: 'desc' },
        },
      },
    });

    res.json(updated);
  })
);

// ─── POST /:id/versions ───────────────────────────────────────────────────────
// Upload a new version of an existing document (EDITOR+)

router.post(
  '/:id/versions',
  requireAuth,
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const user = req.session.user!;

    if (!id || !id.trim()) {
      throw new ValidationError('Invalid id: must be a non-empty string');
    }

    const existing = await prisma.document.findUnique({
      where: { id },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    });
    if (!existing) {
      throw new NotFoundError(`Document ${id} not found`);
    }

    const { filename, mimeType, size, storagePath } = req.body;

    if (!filename || typeof filename !== 'string' || !filename.trim()) {
      throw new ValidationError('filename is required');
    }
    if (!mimeType || typeof mimeType !== 'string' || !mimeType.trim()) {
      throw new ValidationError('mimeType is required');
    }
    if (size === undefined || size === null || typeof size !== 'number' || size < 0) {
      throw new ValidationError('size is required and must be a non-negative number');
    }
    if (!storagePath || typeof storagePath !== 'string' || !storagePath.trim()) {
      throw new ValidationError('storagePath is required');
    }

    // Find or auto-provision the platform user
    const platformUser = await getOrCreatePlatformUser(user.id, user.role);
    if (!platformUser) {
      throw new ValidationError('No platform user record found for this user');
    }

    // Auto-increment version number
    const latestVersion = existing.versions[0]?.version ?? 0;
    const nextVersion = latestVersion + 1;

    const newVersion = await prisma.documentVersion.create({
      data: {
        documentId: id,
        version: nextVersion,
        filename: filename.trim(),
        mimeType: mimeType.trim(),
        size,
        storagePath: storagePath.trim(),
        uploadedBy: platformUser.id,
      },
    });

    res.status(201).json(newVersion);
  })
);

// ─── DELETE /:id ──────────────────────────────────────────────────────────────
// Delete a document and all its versions (EDITOR+)

router.delete(
  '/:id',
  requireAuth,
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!id || !id.trim()) {
      throw new ValidationError('Invalid id: must be a non-empty string');
    }

    const existing = await prisma.document.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError(`Document ${id} not found`);
    }

    // Delete all versions first (foreign key constraint)
    await prisma.documentVersion.deleteMany({ where: { documentId: id } });

    // Then delete the document
    await prisma.document.delete({ where: { id } });

    res.status(204).send();
  })
);

export default router;
