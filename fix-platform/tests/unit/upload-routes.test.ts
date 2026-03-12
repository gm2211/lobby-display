/**
 * Unit tests for Upload API routes.
 *
 * Uses vi.mock to mock Prisma and storage so no database or filesystem is needed.
 * Tests cover:
 *  - POST /  - upload a file (any authenticated platform user)
 *    - validates file type (images: jpg/png/gif/webp, PDFs, documents: doc/docx)
 *    - validates max file size (10MB)
 *    - stores via IStorageProvider
 *    - creates Upload record linked to uploading PlatformUser
 *    - returns upload URL and record
 *  - GET /  - list uploads for current user (MANAGER+ sees all)
 *  - DELETE /:id  - delete own upload (MANAGER+ can delete any)
 *
 * Auth model:
 *  - All routes require authentication (any role)
 *  - DELETE requires ownership or MANAGER+ role
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { errorHandler } from '../../server/middleware/errorHandler.js';

// Mock storage module before importing routes
vi.mock('../../server/utils/storage.js', () => ({
  getStorageProvider: vi.fn(),
}));

// Mock Prisma before importing routes
vi.mock('../../server/db.js', () => ({
  default: {
    upload: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    platformUser: {
      findUnique: vi.fn(),
    },
  },
}));

import prisma from '../../server/db.js';
import { getStorageProvider } from '../../server/utils/storage.js';
import uploadsRouter from '../../server/routes/platform/uploads.js';

// Type helpers for mocked functions
const mockPrisma = prisma as {
  upload: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  platformUser: {
    findUnique: ReturnType<typeof vi.fn>;
  };
};

const mockGetStorageProvider = vi.mocked(getStorageProvider);

// Default mock storage provider
const mockStorage = {
  upload: vi.fn(),
  delete: vi.fn(),
  getUrl: vi.fn(),
};

/** Build a minimal Express app for testing. Injects session user based on role. */
function buildApp(sessionUser?: { id: string | number; username: string; role: string }) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.session = { user: sessionUser };
    next();
  });
  app.use('/api/platform/uploads', uploadsRouter);
  app.use(errorHandler);
  return app;
}

const adminUser = { id: 'admin-uuid-1', username: 'admin', role: 'ADMIN' as const };
const editorUser = { id: 'editor-uuid-2', username: 'editor', role: 'EDITOR' as const };
const viewerUser = { id: 'viewer-uuid-3', username: 'viewer', role: 'VIEWER' as const };

const samplePlatformUser = {
  id: 'platform-user-uuid-1',
  userId: 1,
  unitNumber: '4B',
  role: 'RESIDENT',
  createdAt: new Date('2025-01-01').toISOString(),
  updatedAt: new Date('2025-01-01').toISOString(),
};

const sampleUpload = {
  id: 'upload-uuid-1',
  filename: 'photo.jpg',
  mimeType: 'image/jpeg',
  size: 1024,
  storagePath: '/images/uploads/some-uuid.jpg',
  uploadedBy: 'platform-user-uuid-1',
  createdAt: new Date('2025-01-01').toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetStorageProvider.mockReturnValue(mockStorage as any);
  mockStorage.upload.mockResolvedValue('/images/uploads/some-uuid.jpg');
  mockStorage.delete.mockResolvedValue(undefined);
  mockStorage.getUrl.mockReturnValue('/images/uploads/some-uuid.jpg');
  mockPrisma.platformUser.findUnique.mockResolvedValue(samplePlatformUser);
});

// ---------------------------------------------------------------------------
// POST /api/platform/uploads — Upload a file
// ---------------------------------------------------------------------------

describe('POST /api/platform/uploads', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(undefined);
    const res = await request(app)
      .post('/api/platform/uploads')
      .attach('file', Buffer.from('fake image data'), { filename: 'test.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when no file is provided', async () => {
    const app = buildApp(viewerUser);
    const res = await request(app)
      .post('/api/platform/uploads')
      .set('Content-Type', 'multipart/form-data');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/file/i);
  });

  it('accepts image/jpeg files', async () => {
    mockPrisma.upload.create.mockResolvedValue(sampleUpload);
    const app = buildApp(viewerUser);
    const res = await request(app)
      .post('/api/platform/uploads')
      .attach('file', Buffer.from('fake jpeg'), { filename: 'photo.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(201);
  });

  it('accepts image/png files', async () => {
    mockPrisma.upload.create.mockResolvedValue({ ...sampleUpload, filename: 'image.png', mimeType: 'image/png' });
    const app = buildApp(viewerUser);
    const res = await request(app)
      .post('/api/platform/uploads')
      .attach('file', Buffer.from('fake png'), { filename: 'image.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
  });

  it('accepts image/gif files', async () => {
    mockPrisma.upload.create.mockResolvedValue({ ...sampleUpload, filename: 'anim.gif', mimeType: 'image/gif' });
    const app = buildApp(viewerUser);
    const res = await request(app)
      .post('/api/platform/uploads')
      .attach('file', Buffer.from('fake gif'), { filename: 'anim.gif', contentType: 'image/gif' });
    expect(res.status).toBe(201);
  });

  it('accepts image/webp files', async () => {
    mockPrisma.upload.create.mockResolvedValue({ ...sampleUpload, filename: 'image.webp', mimeType: 'image/webp' });
    const app = buildApp(viewerUser);
    const res = await request(app)
      .post('/api/platform/uploads')
      .attach('file', Buffer.from('fake webp'), { filename: 'image.webp', contentType: 'image/webp' });
    expect(res.status).toBe(201);
  });

  it('accepts application/pdf files', async () => {
    mockPrisma.upload.create.mockResolvedValue({ ...sampleUpload, filename: 'doc.pdf', mimeType: 'application/pdf' });
    const app = buildApp(viewerUser);
    const res = await request(app)
      .post('/api/platform/uploads')
      .attach('file', Buffer.from('fake pdf'), { filename: 'doc.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(201);
  });

  it('accepts application/msword (.doc) files', async () => {
    mockPrisma.upload.create.mockResolvedValue({ ...sampleUpload, filename: 'doc.doc', mimeType: 'application/msword' });
    const app = buildApp(viewerUser);
    const res = await request(app)
      .post('/api/platform/uploads')
      .attach('file', Buffer.from('fake doc'), { filename: 'doc.doc', contentType: 'application/msword' });
    expect(res.status).toBe(201);
  });

  it('accepts application/vnd.openxmlformats-officedocument.wordprocessingml.document (.docx) files', async () => {
    const docxMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    mockPrisma.upload.create.mockResolvedValue({ ...sampleUpload, filename: 'doc.docx', mimeType: docxMime });
    const app = buildApp(viewerUser);
    const res = await request(app)
      .post('/api/platform/uploads')
      .attach('file', Buffer.from('fake docx'), { filename: 'doc.docx', contentType: docxMime });
    expect(res.status).toBe(201);
  });

  it('returns 400 for disallowed file types (e.g. text/plain)', async () => {
    const app = buildApp(viewerUser);
    const res = await request(app)
      .post('/api/platform/uploads')
      .attach('file', Buffer.from('some text'), { filename: 'notes.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/file type/i);
  });

  it('returns 400 for executable files (application/octet-stream)', async () => {
    const app = buildApp(viewerUser);
    const res = await request(app)
      .post('/api/platform/uploads')
      .attach('file', Buffer.from('binary data'), { filename: 'malware.exe', contentType: 'application/octet-stream' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/file type/i);
  });

  it('returns 400 when file exceeds 10MB', async () => {
    const app = buildApp(viewerUser);
    // 10MB + 1 byte
    const bigBuffer = Buffer.alloc(10 * 1024 * 1024 + 1, 'x');
    const res = await request(app)
      .post('/api/platform/uploads')
      .attach('file', bigBuffer, { filename: 'huge.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/size|too large/i);
  });

  it('calls storage.upload with buffer, filename, and mimeType', async () => {
    mockPrisma.upload.create.mockResolvedValue(sampleUpload);
    const app = buildApp(viewerUser);
    await request(app)
      .post('/api/platform/uploads')
      .attach('file', Buffer.from('fake jpeg'), { filename: 'photo.jpg', contentType: 'image/jpeg' });
    expect(mockStorage.upload).toHaveBeenCalledWith(
      expect.any(Buffer),
      'photo.jpg',
      'image/jpeg'
    );
  });

  it('creates an Upload record in the DB linked to the platform user', async () => {
    mockPrisma.upload.create.mockResolvedValue(sampleUpload);
    const app = buildApp(viewerUser);
    await request(app)
      .post('/api/platform/uploads')
      .attach('file', Buffer.from('fake jpeg'), { filename: 'photo.jpg', contentType: 'image/jpeg' });
    expect(mockPrisma.upload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          filename: 'photo.jpg',
          mimeType: 'image/jpeg',
          uploadedBy: samplePlatformUser.id,
        }),
      })
    );
  });

  it('returns the upload record with url in the response', async () => {
    mockPrisma.upload.create.mockResolvedValue(sampleUpload);
    const app = buildApp(viewerUser);
    const res = await request(app)
      .post('/api/platform/uploads')
      .attach('file', Buffer.from('fake jpeg'), { filename: 'photo.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(201);
    expect(res.body.upload).toBeDefined();
    expect(res.body.url).toBeDefined();
  });

  it('returns 403 when platform user record not found (no platform profile)', async () => {
    mockPrisma.platformUser.findUnique.mockResolvedValue(null);
    const app = buildApp(viewerUser);
    const res = await request(app)
      .post('/api/platform/uploads')
      .attach('file', Buffer.from('fake jpeg'), { filename: 'photo.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(403);
  });

  it('allows ADMIN to upload', async () => {
    mockPrisma.upload.create.mockResolvedValue(sampleUpload);
    const app = buildApp(adminUser);
    const res = await request(app)
      .post('/api/platform/uploads')
      .attach('file', Buffer.from('fake jpeg'), { filename: 'photo.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(201);
  });

  it('allows EDITOR to upload', async () => {
    mockPrisma.upload.create.mockResolvedValue(sampleUpload);
    const app = buildApp(editorUser);
    const res = await request(app)
      .post('/api/platform/uploads')
      .attach('file', Buffer.from('fake jpeg'), { filename: 'photo.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(201);
  });

  it('stores the storagePath returned by storage.upload in the DB record', async () => {
    const storagePath = '/images/uploads/custom-uuid.jpg';
    mockStorage.upload.mockResolvedValue(storagePath);
    mockPrisma.upload.create.mockResolvedValue({ ...sampleUpload, storagePath });
    const app = buildApp(viewerUser);
    await request(app)
      .post('/api/platform/uploads')
      .attach('file', Buffer.from('fake jpeg'), { filename: 'photo.jpg', contentType: 'image/jpeg' });
    expect(mockPrisma.upload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          storagePath,
        }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// GET /api/platform/uploads — List uploads
// ---------------------------------------------------------------------------

describe('GET /api/platform/uploads', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(undefined);
    const res = await request(app).get('/api/platform/uploads');
    expect(res.status).toBe(401);
  });

  it('returns only the current user uploads for RESIDENT role (VIEWER)', async () => {
    mockPrisma.upload.findMany.mockResolvedValue([sampleUpload]);
    const app = buildApp(viewerUser);
    const res = await request(app).get('/api/platform/uploads');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Should filter by uploadedBy for non-MANAGER roles
    expect(mockPrisma.upload.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          uploadedBy: samplePlatformUser.id,
        }),
      })
    );
  });

  it('returns all uploads for MANAGER+ (ADMIN)', async () => {
    const managerPlatformUser = { ...samplePlatformUser, role: 'MANAGER' };
    mockPrisma.platformUser.findUnique.mockResolvedValue(managerPlatformUser);
    mockPrisma.upload.findMany.mockResolvedValue([sampleUpload]);
    const app = buildApp(adminUser);
    const res = await request(app).get('/api/platform/uploads');
    expect(res.status).toBe(200);
    // MANAGER+ should not filter by uploadedBy
    const callArgs = mockPrisma.upload.findMany.mock.calls[0][0] as any;
    expect(callArgs.where?.uploadedBy).toBeUndefined();
  });

  it('returns all uploads for MANAGER role', async () => {
    const managerPlatformUser = { ...samplePlatformUser, role: 'MANAGER' };
    mockPrisma.platformUser.findUnique.mockResolvedValue(managerPlatformUser);
    mockPrisma.upload.findMany.mockResolvedValue([sampleUpload]);
    const app = buildApp(editorUser);
    const res = await request(app).get('/api/platform/uploads');
    expect(res.status).toBe(200);
    const callArgs = mockPrisma.upload.findMany.mock.calls[0][0] as any;
    expect(callArgs.where?.uploadedBy).toBeUndefined();
  });

  it('returns empty array when user has no uploads', async () => {
    mockPrisma.upload.findMany.mockResolvedValue([]);
    const app = buildApp(viewerUser);
    const res = await request(app).get('/api/platform/uploads');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 403 when platform user record not found', async () => {
    mockPrisma.platformUser.findUnique.mockResolvedValue(null);
    const app = buildApp(viewerUser);
    const res = await request(app).get('/api/platform/uploads');
    expect(res.status).toBe(403);
  });

  it('returns list ordered by createdAt descending', async () => {
    mockPrisma.upload.findMany.mockResolvedValue([sampleUpload]);
    const app = buildApp(viewerUser);
    await request(app).get('/api/platform/uploads');
    expect(mockPrisma.upload.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: 'desc' },
      })
    );
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/platform/uploads/:id — Delete an upload
// ---------------------------------------------------------------------------

describe('DELETE /api/platform/uploads/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(undefined);
    const res = await request(app).delete('/api/platform/uploads/upload-uuid-1');
    expect(res.status).toBe(401);
  });

  it('returns 404 when upload does not exist', async () => {
    mockPrisma.upload.findUnique.mockResolvedValue(null);
    const app = buildApp(viewerUser);
    const res = await request(app).delete('/api/platform/uploads/nonexistent-uuid');
    expect(res.status).toBe(404);
  });

  it('allows owner to delete their own upload', async () => {
    mockPrisma.upload.findUnique.mockResolvedValue(sampleUpload);
    mockPrisma.upload.delete.mockResolvedValue(sampleUpload);
    const app = buildApp(viewerUser);
    const res = await request(app).delete('/api/platform/uploads/upload-uuid-1');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('returns 403 when non-owner tries to delete another user upload', async () => {
    // Upload belongs to a different platform user
    const otherUpload = { ...sampleUpload, uploadedBy: 'other-platform-user-uuid' };
    mockPrisma.upload.findUnique.mockResolvedValue(otherUpload);
    // Current user's platform user is different
    const currentPlatformUser = { ...samplePlatformUser, id: 'my-platform-user-uuid' };
    mockPrisma.platformUser.findUnique.mockResolvedValue(currentPlatformUser);
    const app = buildApp(viewerUser);
    const res = await request(app).delete('/api/platform/uploads/upload-uuid-1');
    expect(res.status).toBe(403);
  });

  it('allows MANAGER to delete any upload', async () => {
    const otherUpload = { ...sampleUpload, uploadedBy: 'other-platform-user-uuid' };
    mockPrisma.upload.findUnique.mockResolvedValue(otherUpload);
    const managerPlatformUser = { ...samplePlatformUser, id: 'my-platform-user-uuid', role: 'MANAGER' };
    mockPrisma.platformUser.findUnique.mockResolvedValue(managerPlatformUser);
    mockPrisma.upload.delete.mockResolvedValue(otherUpload);
    const app = buildApp(editorUser);
    const res = await request(app).delete('/api/platform/uploads/upload-uuid-1');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('calls storage.delete with the storagePath', async () => {
    mockPrisma.upload.findUnique.mockResolvedValue(sampleUpload);
    mockPrisma.upload.delete.mockResolvedValue(sampleUpload);
    const app = buildApp(viewerUser);
    await request(app).delete('/api/platform/uploads/upload-uuid-1');
    expect(mockStorage.delete).toHaveBeenCalledWith(sampleUpload.storagePath);
  });

  it('deletes the DB record after storage deletion', async () => {
    mockPrisma.upload.findUnique.mockResolvedValue(sampleUpload);
    mockPrisma.upload.delete.mockResolvedValue(sampleUpload);
    const app = buildApp(viewerUser);
    await request(app).delete('/api/platform/uploads/upload-uuid-1');
    expect(mockPrisma.upload.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'upload-uuid-1' },
      })
    );
  });

  it('returns 403 when platform user record not found', async () => {
    mockPrisma.upload.findUnique.mockResolvedValue(sampleUpload);
    mockPrisma.platformUser.findUnique.mockResolvedValue(null);
    const app = buildApp(viewerUser);
    const res = await request(app).delete('/api/platform/uploads/upload-uuid-1');
    expect(res.status).toBe(403);
  });

  it('allows BOARD_MEMBER to delete any upload', async () => {
    const otherUpload = { ...sampleUpload, uploadedBy: 'other-platform-user-uuid' };
    mockPrisma.upload.findUnique.mockResolvedValue(otherUpload);
    const boardMemberPlatformUser = { ...samplePlatformUser, id: 'my-platform-user-uuid', role: 'BOARD_MEMBER' };
    mockPrisma.platformUser.findUnique.mockResolvedValue(boardMemberPlatformUser);
    mockPrisma.upload.delete.mockResolvedValue(otherUpload);
    const app = buildApp(editorUser);
    const res = await request(app).delete('/api/platform/uploads/upload-uuid-1');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
