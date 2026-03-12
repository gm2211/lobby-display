/**
 * Upload API Routes — File upload management for platform users.
 *
 * ROUTES:
 * - POST /api/platform/uploads        - Upload a file (any authenticated platform user)
 * - GET  /api/platform/uploads        - List uploads (own uploads; MANAGER+ sees all)
 * - DELETE /api/platform/uploads/:id  - Delete an upload (own; MANAGER+ deletes any)
 *
 * FILE CONSTRAINTS:
 * - Allowed MIME types: image/jpeg, image/png, image/gif, image/webp,
 *                       application/pdf, application/msword,
 *                       application/vnd.openxmlformats-officedocument.wordprocessingml.document
 * - Max size: 10MB (10 * 1024 * 1024 bytes)
 *
 * AUTH MODEL:
 * - All routes require an authenticated session user
 * - All routes require a linked PlatformUser record (via userId FK)
 * - MANAGER and BOARD_MEMBER platform roles may list/delete any upload
 * - Other roles may only list/delete their own uploads
 *
 * STORAGE:
 * - Files are stored via IStorageProvider (server/utils/storage.ts)
 * - The storage path returned by provider.upload() is saved as Upload.storagePath
 *
 * RELATED FILES:
 * - server/utils/storage.ts                  - IStorageProvider interface and factory
 * - server/middleware/errorHandler.ts        - asyncHandler, NotFoundError, ValidationError
 * - server/middleware/platformAuth.ts        - PlatformAuthenticationError, PlatformAuthorizationError
 * - prisma/schema.prisma                     - Upload model, PlatformUser model
 * - tests/unit/upload-routes.test.ts         - unit tests (Prisma + storage mocked)
 */
import { Router } from 'express';
import multer from 'multer';
import prisma from '../../db.js';
import {
  asyncHandler,
  NotFoundError,
  ValidationError,
} from '../../middleware/errorHandler.js';
import { requireAuth } from '../../middleware/auth.js';
import {
  PlatformAuthenticationError,
  PlatformAuthorizationError,
  getOrCreatePlatformUser,
} from '../../middleware/platformAuth.js';
import { getStorageProvider } from '../../utils/storage.js';

const router = Router();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

/**
 * Platform roles that can see and manage all uploads (not just their own).
 */
const MANAGER_ROLES = new Set(['MANAGER', 'BOARD_MEMBER']);

// ---------------------------------------------------------------------------
// Multer configuration — memory storage, size limit enforced in middleware
// ---------------------------------------------------------------------------

/**
 * multer instance using in-memory storage (no temp files on disk).
 * We do NOT set fileFilter here because multer v2 fileFilter errors are tricky
 * to test reliably; instead we validate MIME type after upload in the handler.
 *
 * The 10MB limit is set on the multer instance so multer itself rejects
 * oversized files with a MulterError before our handler runs.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

// ---------------------------------------------------------------------------
// Helper — resolve (or auto-provision) the PlatformUser for the current session
// ---------------------------------------------------------------------------

async function getPlatformUser(req: import('express').Request) {
  if (!req.session.user) return null;
  return getOrCreatePlatformUser(req.session.user.id, req.session.user.role);
}

// ---------------------------------------------------------------------------
// POST / — Upload a file
// ---------------------------------------------------------------------------

router.post(
  '/',
  requireAuth,
  // Multer middleware: accept a single file under field name "file"
  // Wrap multer in a function so we can handle MulterError ourselves
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new ValidationError('File size too large: maximum is 10MB'));
        }
        // Handle busboy "Boundary not found" (Content-Type set but no boundary / no body)
        if (err.message && err.message.includes('Boundary not found')) {
          return next(new ValidationError('file is required'));
        }
        return next(err);
      }
      next();
    });
  },
  asyncHandler(async (req, res) => {
    // Require a file
    if (!req.file) {
      throw new ValidationError('file is required');
    }

    // Validate MIME type
    const { mimetype, originalname, buffer, size } = req.file;
    if (!ALLOWED_MIME_TYPES.has(mimetype)) {
      throw new ValidationError(
        `Unsupported file type: ${mimetype}. Allowed types: images (jpg, png, gif, webp), PDFs, documents (doc, docx)`
      );
    }

    // Resolve PlatformUser for the session user
    const platformUser = await getPlatformUser(req);
    if (!platformUser) {
      throw new PlatformAuthorizationError('No platform user record found for this user');
    }

    // Store the file via IStorageProvider
    const storage = getStorageProvider();
    const storagePath = await storage.upload(buffer, originalname, mimetype);
    const url = storage.getUrl(storagePath);

    // Create Upload record in DB
    const uploadRecord = await prisma.upload.create({
      data: {
        filename: originalname,
        mimeType: mimetype,
        size,
        storagePath,
        uploadedBy: platformUser.id,
      },
    });

    res.status(201).json({ upload: uploadRecord, url });
  })
);

// ---------------------------------------------------------------------------
// GET / — List uploads (own uploads; MANAGER+ sees all)
// ---------------------------------------------------------------------------

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const platformUser = await getPlatformUser(req);
    if (!platformUser) {
      throw new PlatformAuthorizationError('No platform user record found for this user');
    }

    // MANAGER+ sees all uploads; other roles see only their own
    const isManager = MANAGER_ROLES.has(platformUser.role);

    const where: Record<string, unknown> = {};
    if (!isManager) {
      where.uploadedBy = platformUser.id;
    }

    const uploads = await prisma.upload.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    res.json(uploads);
  })
);

// ---------------------------------------------------------------------------
// DELETE /:id — Delete an upload (own; MANAGER+ deletes any)
// ---------------------------------------------------------------------------

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Resolve PlatformUser for the session user
    const platformUser = await getPlatformUser(req);
    if (!platformUser) {
      throw new PlatformAuthorizationError('No platform user record found for this user');
    }

    // Find the upload record
    const uploadRecord = await prisma.upload.findUnique({ where: { id } });
    if (!uploadRecord) {
      throw new NotFoundError(`Upload ${id} not found`);
    }

    // Authorization: owner or MANAGER+
    const isManager = MANAGER_ROLES.has(platformUser.role);
    const isOwner = uploadRecord.uploadedBy === platformUser.id;

    if (!isOwner && !isManager) {
      throw new PlatformAuthorizationError('You do not have permission to delete this upload');
    }

    // Delete from storage first (best-effort)
    const storage = getStorageProvider();
    await storage.delete(uploadRecord.storagePath);

    // Delete the DB record
    await prisma.upload.delete({ where: { id } });

    res.json({ ok: true });
  })
);

export default router;
