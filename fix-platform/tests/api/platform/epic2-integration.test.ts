/**
 * Epic 2 Integration Tests: Directory, Documents, Surveys, Training
 *
 * Uses vi.mock to mock Prisma — no database required.
 * Tests cover the key behaviors and role-based access patterns for each route.
 *
 * Auth model:
 *  - GET routes require any authenticated user (any role)
 *  - Mutations (POST/PUT/DELETE) require EDITOR or ADMIN (dashboard role)
 *  - Platform-level permission checks use req.platformUser.role
 *  - MANAGER+ can see hidden directory entries and update any entry
 *
 * RELATED FILES:
 * - server/routes/platform/directory.ts  - Directory routes
 * - server/routes/platform/documents.ts  - Document routes
 * - server/routes/platform/surveys.ts    - Survey routes
 * - server/routes/platform/training.ts   - Training routes
 * - tests/unit/directory-routes.test.ts  - Existing directory unit tests
 * - tests/unit/document-routes.test.ts   - Existing document unit tests
 * - tests/unit/survey-routes.test.ts     - Existing survey unit tests
 * - tests/unit/training-routes.test.ts   - Existing training unit tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import { errorHandler } from '../../../server/middleware/errorHandler.js';

// Mock Prisma before importing routes
vi.mock('../../../server/db.js', () => ({
  default: {
    // Directory
    directoryEntry: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    // Documents
    documentCategory: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    document: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    documentVersion: {
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    // Surveys
    survey: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    surveyQuestion: {
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    surveyResponse: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    // Training
    trainingResource: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    trainingCompletion: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    platformUser: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import prisma from '../../../server/db.js';
import directoryRouter from '../../../server/routes/platform/directory.js';
import documentsRouter from '../../../server/routes/platform/documents.js';
import surveysRouter from '../../../server/routes/platform/surveys.js';
import trainingRouter from '../../../server/routes/platform/training.js';

// ─── Type helpers for mocked Prisma functions ─────────────────────────────────

const mockPrisma = prisma as {
  directoryEntry: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  documentCategory: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  document: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  documentVersion: {
    create: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
  survey: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  surveyQuestion: {
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
  surveyResponse: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
  trainingResource: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  trainingCompletion: {
    findMany: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
  platformUser: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
};

// ─── App builders ─────────────────────────────────────────────────────────────

/**
 * Build a minimal Express app mounting the directory router.
 * platformUser is attached to simulate auth middleware context.
 */
function buildDirectoryApp(
  role: 'ADMIN' | 'EDITOR' | 'VIEWER' | null = 'VIEWER',
  userId: number = 1,
  platformUserId: string = 'pu-uuid-1',
  platformRole: 'RESIDENT' | 'BOARD_MEMBER' | 'MANAGER' | 'SECURITY' | 'CONCIERGE' = 'RESIDENT',
) {
  const app = express();
  app.use(express.json());

  app.use((req: any, _res, next) => {
    if (role !== null) {
      req.session = { user: { id: userId, username: 'testuser', role } };
      req.platformUser = { id: platformUserId, userId, role: platformRole };
    } else {
      req.session = {};
    }
    next();
  });

  app.use('/api/platform/directory', directoryRouter);
  app.use(errorHandler);
  return app;
}

/**
 * Build a minimal Express app mounting the documents router.
 */
function buildDocumentsApp(role: 'ADMIN' | 'EDITOR' | 'VIEWER' | null = 'VIEWER', userId = 1) {
  const app = express();
  app.use(express.json());
  app.use(
    session({ secret: 'test-secret', resave: false, saveUninitialized: true }),
  );

  if (role !== null) {
    app.use((_req: any, _res, next) => {
      (_req as any).session.user = { id: userId, username: 'testuser', role };
      next();
    });
  }

  app.use('/api/platform/documents', documentsRouter);
  app.use(errorHandler);
  return app;
}

/**
 * Build a minimal Express app mounting the surveys router.
 * Sets up platformUser mock for platformProtectStrict middleware.
 */
function buildSurveysApp(role: 'ADMIN' | 'EDITOR' | 'VIEWER' | null = 'VIEWER', userId = 1) {
  const app = express();
  app.use(express.json());
  app.use(
    session({ secret: 'test-secret', resave: false, saveUninitialized: true }),
  );

  if (role !== null) {
    app.use((_req: any, _res, next) => {
      (_req as any).session.user = { id: userId, username: 'testuser', role };
      next();
    });
    // Mock platformUser lookup for platformProtectStrict
    mockPrisma.platformUser.findUnique.mockResolvedValue({
      id: `platform-user-${userId}`,
      userId,
      role: 'RESIDENT',
      active: true,
    });
  } else {
    mockPrisma.platformUser.findUnique.mockResolvedValue(null);
  }

  app.use('/api/platform/surveys', surveysRouter);
  app.use(errorHandler);
  return app;
}

/**
 * Build a minimal Express app mounting the training router.
 * Sets up platformUser mock for platformProtectStrict middleware.
 */
function buildTrainingApp(sessionUser?: { id: string | number; username: string; role: string }) {
  const app = express();
  app.use(express.json());

  app.use((req: any, _res, next) => {
    req.session = { user: sessionUser };
    next();
  });

  if (sessionUser) {
    // Mock platformUser lookup for platformProtectStrict
    mockPrisma.platformUser.findUnique.mockResolvedValue({
      id: `platform-user-${sessionUser.id}`,
      userId: sessionUser.id,
      role: 'RESIDENT',
      active: true,
    });
  } else {
    mockPrisma.platformUser.findUnique.mockResolvedValue(null);
  }

  app.use('/api/platform/training', trainingRouter);
  app.use(errorHandler);
  return app;
}

// ─── Sample data fixtures ─────────────────────────────────────────────────────

const sampleDirectoryEntry = {
  id: 'dir-uuid-1',
  userId: 'pu-uuid-1',
  displayName: 'Alice Smith',
  title: 'Property Manager',
  department: 'Management',
  phone: '555-0100',
  email: 'alice@example.com',
  photoUrl: null,
  visible: true,
  sortOrder: 0,
  createdAt: new Date('2025-01-01').toISOString(),
  updatedAt: new Date('2025-01-01').toISOString(),
  user: { id: 'pu-uuid-1', role: 'RESIDENT', unitNumber: '1A' },
};

const sampleHiddenEntry = {
  ...sampleDirectoryEntry,
  id: 'dir-uuid-2',
  userId: 'pu-uuid-2',
  displayName: 'Bob Jones',
  visible: false,
  user: { id: 'pu-uuid-2', role: 'RESIDENT', unitNumber: '2B' },
};

const sampleBoardMemberEntry = {
  ...sampleDirectoryEntry,
  id: 'dir-uuid-3',
  userId: 'pu-uuid-3',
  displayName: 'Carol White',
  user: { id: 'pu-uuid-3', role: 'BOARD_MEMBER', unitNumber: '3C' },
};

const sampleCategory = {
  id: 'cat-uuid-1',
  name: 'Policies',
  description: 'Building policies',
  sortOrder: 0,
};

const sampleDocumentVersion = {
  id: 'ver-uuid-1',
  documentId: 'doc-uuid-1',
  version: 1,
  filename: 'policy.pdf',
  mimeType: 'application/pdf',
  size: 1024,
  storagePath: '/storage/policy.pdf',
  uploadedBy: 'platform-user-1',
  createdAt: new Date('2025-01-01').toISOString(),
};

const sampleDocument = {
  id: 'doc-uuid-1',
  title: 'Building Policy',
  description: 'Main building policy document',
  categoryId: 'cat-uuid-1',
  category: sampleCategory,
  uploadedBy: 'platform-user-1',
  active: true,
  createdAt: new Date('2025-01-01').toISOString(),
  updatedAt: new Date('2025-01-01').toISOString(),
  versions: [sampleDocumentVersion],
};

const samplePlatformUser = {
  id: 'platform-user-1',
  userId: 1,
  role: 'RESIDENT',
};

const sampleSurvey = {
  id: 'survey-uuid-1',
  title: 'Resident Satisfaction Survey',
  description: 'Annual satisfaction survey',
  active: true,
  startsAt: null,
  endsAt: null,
  createdBy: 'user-uuid-1',
  createdAt: new Date('2025-01-01').toISOString(),
  updatedAt: new Date('2025-01-01').toISOString(),
  questions: [],
  _count: { questions: 0, responses: 0 },
};

const sampleQuestion = {
  id: 'question-uuid-1',
  surveyId: 'survey-uuid-1',
  text: 'How satisfied are you?',
  type: 'RATING',
  options: null,
  required: true,
  sortOrder: 0,
};

const sampleSurveyResponse = {
  id: 'response-uuid-1',
  surveyId: 'survey-uuid-1',
  userId: '1',
  answers: { 'question-uuid-1': 5 },
  createdAt: new Date('2025-01-10').toISOString(),
};

const sampleTrainingResource = {
  id: 'resource-uuid-1',
  title: 'Fire Safety Training',
  description: 'Learn fire safety procedures',
  contentType: 'VIDEO',
  contentUrl: 'https://example.com/video',
  uploadId: null,
  requiredForRoles: ['RESIDENT'],
  dueDate: null,
  sortOrder: 0,
  active: true,
  createdAt: new Date('2025-01-01').toISOString(),
  updatedAt: new Date('2025-01-01').toISOString(),
  _count: { completions: 0 },
};

const sampleCompletion = {
  id: 'completion-uuid-1',
  resourceId: 'resource-uuid-1',
  userId: 'viewer-uuid-3',
  completedAt: new Date('2025-06-01').toISOString(),
  user: { id: 'viewer-uuid-3', unitNumber: '4B', role: 'RESIDENT' },
};

const viewerUser = { id: 'viewer-uuid-3', username: 'viewer', role: 'VIEWER' as const };
const editorUser = { id: 'editor-uuid-2', username: 'editor', role: 'EDITOR' as const };
const adminUser = { id: 'admin-uuid-1', username: 'admin', role: 'ADMIN' as const };

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// DIRECTORY
// =============================================================================

describe('Directory — GET /api/platform/directory (list with filters)', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildDirectoryApp(null);
    const res = await request(app).get('/api/platform/directory');
    expect(res.status).toBe(401);
  });

  it('returns all visible entries for VIEWER', async () => {
    const app = buildDirectoryApp('VIEWER', 1, 'pu-uuid-1', 'RESIDENT');
    mockPrisma.directoryEntry.findMany.mockResolvedValue([sampleDirectoryEntry]);
    const res = await request(app).get('/api/platform/directory');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].id).toBe('dir-uuid-1');
    expect(res.body[0].displayName).toBe('Alice Smith');
  });

  it('restricts non-MANAGER to visible=true only', async () => {
    const app = buildDirectoryApp('VIEWER', 1, 'pu-uuid-1', 'RESIDENT');
    mockPrisma.directoryEntry.findMany.mockResolvedValue([sampleDirectoryEntry]);
    await request(app).get('/api/platform/directory');
    const args = mockPrisma.directoryEntry.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ visible: true });
  });

  it('allows MANAGER to see hidden entries (no visible filter)', async () => {
    const app = buildDirectoryApp('EDITOR', 2, 'pu-uuid-2', 'MANAGER');
    mockPrisma.directoryEntry.findMany.mockResolvedValue([sampleDirectoryEntry, sampleHiddenEntry]);
    await request(app).get('/api/platform/directory');
    const args = mockPrisma.directoryEntry.findMany.mock.calls[0][0];
    expect(args.where).not.toMatchObject({ visible: true });
  });

  it('searches by displayName when name query param is provided', async () => {
    const app = buildDirectoryApp('VIEWER');
    mockPrisma.directoryEntry.findMany.mockResolvedValue([sampleDirectoryEntry]);
    const res = await request(app).get('/api/platform/directory?name=Alice');
    expect(res.status).toBe(200);
    const args = mockPrisma.directoryEntry.findMany.mock.calls[0][0];
    expect(JSON.stringify(args.where)).toContain('Alice');
  });

  it('searches by unit when unit query param is provided', async () => {
    const app = buildDirectoryApp('VIEWER');
    mockPrisma.directoryEntry.findMany.mockResolvedValue([sampleDirectoryEntry]);
    const res = await request(app).get('/api/platform/directory?unit=1A');
    expect(res.status).toBe(200);
    const args = mockPrisma.directoryEntry.findMany.mock.calls[0][0];
    expect(JSON.stringify(args.where)).toContain('1A');
  });

  it('filters by boardMember=true to show only BOARD_MEMBER role entries', async () => {
    const app = buildDirectoryApp('VIEWER');
    mockPrisma.directoryEntry.findMany.mockResolvedValue([sampleBoardMemberEntry]);
    const res = await request(app).get('/api/platform/directory?boardMember=true');
    expect(res.status).toBe(200);
    const args = mockPrisma.directoryEntry.findMany.mock.calls[0][0];
    expect(JSON.stringify(args.where)).toContain('BOARD_MEMBER');
  });

  it('adds boardMember=true flag to entries with BOARD_MEMBER role', async () => {
    const app = buildDirectoryApp('VIEWER');
    mockPrisma.directoryEntry.findMany.mockResolvedValue([sampleDirectoryEntry, sampleBoardMemberEntry]);
    const res = await request(app).get('/api/platform/directory');
    expect(res.status).toBe(200);
    const regular = res.body.find((e: any) => e.id === 'dir-uuid-1');
    const board = res.body.find((e: any) => e.id === 'dir-uuid-3');
    expect(regular.boardMember).toBe(false);
    expect(board.boardMember).toBe(true);
  });

  it('orders results by sortOrder and includes user info', async () => {
    const app = buildDirectoryApp('VIEWER');
    mockPrisma.directoryEntry.findMany.mockResolvedValue([sampleDirectoryEntry]);
    await request(app).get('/api/platform/directory');
    const args = mockPrisma.directoryEntry.findMany.mock.calls[0][0];
    expect(args.orderBy).toBeDefined();
    expect(args.include).toHaveProperty('user');
  });
});

describe('Directory — GET /api/platform/directory/:id (single entry)', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildDirectoryApp(null);
    const res = await request(app).get('/api/platform/directory/dir-uuid-1');
    expect(res.status).toBe(401);
  });

  it('returns 404 when entry does not exist', async () => {
    const app = buildDirectoryApp('VIEWER');
    mockPrisma.directoryEntry.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/platform/directory/nonexistent');
    expect(res.status).toBe(404);
  });

  it('returns entry detail for authenticated user', async () => {
    const app = buildDirectoryApp('VIEWER');
    mockPrisma.directoryEntry.findUnique.mockResolvedValue(sampleDirectoryEntry);
    const res = await request(app).get('/api/platform/directory/dir-uuid-1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('dir-uuid-1');
    expect(res.body.displayName).toBe('Alice Smith');
  });

  it('hides contact info: returns 403 when non-owner accesses hidden entry', async () => {
    // Privacy control: non-owner non-MANAGER cannot see hidden entries
    const app = buildDirectoryApp('VIEWER', 1, 'pu-uuid-1', 'RESIDENT');
    mockPrisma.directoryEntry.findUnique.mockResolvedValue(sampleHiddenEntry);
    const res = await request(app).get('/api/platform/directory/dir-uuid-2');
    expect(res.status).toBe(403);
  });

  it('returns own hidden entry to its owner', async () => {
    // Owner can always see their own entry even if hidden
    const app = buildDirectoryApp('VIEWER', 2, 'pu-uuid-2', 'RESIDENT');
    mockPrisma.directoryEntry.findUnique.mockResolvedValue(sampleHiddenEntry);
    const res = await request(app).get('/api/platform/directory/dir-uuid-2');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('dir-uuid-2');
  });

  it('allows MANAGER to view any hidden entry (privacy override)', async () => {
    const app = buildDirectoryApp('EDITOR', 2, 'pu-uuid-2', 'MANAGER');
    mockPrisma.directoryEntry.findUnique.mockResolvedValue(sampleHiddenEntry);
    const res = await request(app).get('/api/platform/directory/dir-uuid-2');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('dir-uuid-2');
  });

  it('includes boardMember flag in response', async () => {
    const app = buildDirectoryApp('VIEWER');
    mockPrisma.directoryEntry.findUnique.mockResolvedValue(sampleBoardMemberEntry);
    const res = await request(app).get('/api/platform/directory/dir-uuid-3');
    expect(res.status).toBe(200);
    expect(res.body.boardMember).toBe(true);
  });
});

describe('Directory — PUT /api/platform/directory/:id (MANAGER+)', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildDirectoryApp(null);
    const res = await request(app)
      .put('/api/platform/directory/dir-uuid-1')
      .send({ displayName: 'Updated' });
    expect(res.status).toBe(401);
  });

  it('returns 403 when non-owner tries to update another user entry', async () => {
    const app = buildDirectoryApp('VIEWER', 1, 'pu-uuid-1', 'RESIDENT');
    mockPrisma.directoryEntry.findUnique.mockResolvedValue(sampleHiddenEntry);
    const res = await request(app)
      .put('/api/platform/directory/dir-uuid-2')
      .send({ displayName: 'Hijacked' });
    expect(res.status).toBe(403);
  });

  it('allows user to update their own entry', async () => {
    const app = buildDirectoryApp('VIEWER', 1, 'pu-uuid-1', 'RESIDENT');
    mockPrisma.directoryEntry.findUnique.mockResolvedValue(sampleDirectoryEntry);
    mockPrisma.directoryEntry.update.mockResolvedValue({
      ...sampleDirectoryEntry,
      phone: '555-9999',
      user: sampleDirectoryEntry.user,
    });
    const res = await request(app)
      .put('/api/platform/directory/dir-uuid-1')
      .send({ phone: '555-9999' });
    expect(res.status).toBe(200);
    expect(res.body.phone).toBe('555-9999');
  });

  it('allows MANAGER to update any entry', async () => {
    const app = buildDirectoryApp('EDITOR', 2, 'pu-uuid-2', 'MANAGER');
    mockPrisma.directoryEntry.findUnique.mockResolvedValue(sampleDirectoryEntry);
    mockPrisma.directoryEntry.update.mockResolvedValue({
      ...sampleDirectoryEntry,
      title: 'Senior Manager',
      user: sampleDirectoryEntry.user,
    });
    const res = await request(app)
      .put('/api/platform/directory/dir-uuid-1')
      .send({ title: 'Senior Manager' });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Senior Manager');
  });

  it('returns 404 when entry does not exist', async () => {
    const app = buildDirectoryApp('VIEWER', 1, 'pu-uuid-1', 'RESIDENT');
    mockPrisma.directoryEntry.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .put('/api/platform/directory/nonexistent')
      .send({ displayName: 'Updated' });
    expect(res.status).toBe(404);
  });

  it('performs partial updates (only provided fields)', async () => {
    const app = buildDirectoryApp('VIEWER', 1, 'pu-uuid-1', 'RESIDENT');
    mockPrisma.directoryEntry.findUnique.mockResolvedValue(sampleDirectoryEntry);
    mockPrisma.directoryEntry.update.mockResolvedValue({
      ...sampleDirectoryEntry,
      phone: '555-0200',
      user: sampleDirectoryEntry.user,
    });
    await request(app).put('/api/platform/directory/dir-uuid-1').send({ phone: '555-0200' });
    const updateArgs = mockPrisma.directoryEntry.update.mock.calls[0][0];
    expect(updateArgs.data).toHaveProperty('phone', '555-0200');
    expect(updateArgs.data).not.toHaveProperty('displayName');
  });
});

// =============================================================================
// DOCUMENTS
// =============================================================================

describe('Documents — GET /api/platform/documents/categories (list by category)', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildDocumentsApp(null);
    const res = await request(app).get('/api/platform/documents/categories');
    expect(res.status).toBe(401);
  });

  it('returns list of categories for any authenticated user', async () => {
    const app = buildDocumentsApp('VIEWER');
    mockPrisma.documentCategory.findMany.mockResolvedValue([sampleCategory]);
    const res = await request(app).get('/api/platform/documents/categories');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].name).toBe('Policies');
  });

  it('returns categories ordered by sortOrder then name', async () => {
    const app = buildDocumentsApp('VIEWER');
    mockPrisma.documentCategory.findMany.mockResolvedValue([sampleCategory]);
    await request(app).get('/api/platform/documents/categories');
    const args = mockPrisma.documentCategory.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual([{ sortOrder: 'asc' }, { name: 'asc' }]);
  });
});

describe('Documents — GET /api/platform/documents (list with filters)', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildDocumentsApp(null);
    const res = await request(app).get('/api/platform/documents');
    expect(res.status).toBe(401);
  });

  it('returns list of documents with category and latest version', async () => {
    const app = buildDocumentsApp('VIEWER');
    mockPrisma.document.findMany.mockResolvedValue([sampleDocument]);
    const res = await request(app).get('/api/platform/documents');
    expect(res.status).toBe(200);
    expect(res.body[0].title).toBe('Building Policy');
    const args = mockPrisma.document.findMany.mock.calls[0][0];
    expect(args.include.category).toBe(true);
    expect(args.include.versions).toMatchObject({ orderBy: { version: 'desc' }, take: 1 });
  });

  it('filters by categoryId when provided', async () => {
    const app = buildDocumentsApp('VIEWER');
    mockPrisma.document.findMany.mockResolvedValue([sampleDocument]);
    await request(app).get('/api/platform/documents?categoryId=cat-uuid-1');
    const args = mockPrisma.document.findMany.mock.calls[0][0];
    expect(args.where.categoryId).toBe('cat-uuid-1');
  });

  it('filters by active=true when provided', async () => {
    const app = buildDocumentsApp('VIEWER');
    mockPrisma.document.findMany.mockResolvedValue([sampleDocument]);
    await request(app).get('/api/platform/documents?active=true');
    const args = mockPrisma.document.findMany.mock.calls[0][0];
    expect(args.where.active).toBe(true);
  });

  it('filters by active=false when provided', async () => {
    const app = buildDocumentsApp('VIEWER');
    mockPrisma.document.findMany.mockResolvedValue([]);
    await request(app).get('/api/platform/documents?active=false');
    const args = mockPrisma.document.findMany.mock.calls[0][0];
    expect(args.where.active).toBe(false);
  });

  it('returns 400 for invalid active filter value', async () => {
    const app = buildDocumentsApp('VIEWER');
    const res = await request(app).get('/api/platform/documents?active=maybe');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/active/i);
  });
});

describe('Documents — GET /api/platform/documents/:id (single document + versions)', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildDocumentsApp(null);
    const res = await request(app).get('/api/platform/documents/doc-uuid-1');
    expect(res.status).toBe(401);
  });

  it('returns 404 when document not found', async () => {
    const app = buildDocumentsApp('VIEWER');
    mockPrisma.document.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/platform/documents/nonexistent');
    expect(res.status).toBe(404);
  });

  it('returns document detail with all versions (role-based download access)', async () => {
    const app = buildDocumentsApp('VIEWER');
    const docWithVersions = {
      ...sampleDocument,
      versions: [
        sampleDocumentVersion,
        { ...sampleDocumentVersion, version: 2, id: 'ver-uuid-2' },
      ],
    };
    mockPrisma.document.findUnique.mockResolvedValue(docWithVersions);
    const res = await request(app).get('/api/platform/documents/doc-uuid-1');
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Building Policy');
    expect(res.body.versions).toHaveLength(2);
    // Category info included for download/display
    expect(res.body.category.name).toBe('Policies');
  });

  it('EDITOR can also access document detail', async () => {
    const app = buildDocumentsApp('EDITOR');
    mockPrisma.document.findUnique.mockResolvedValue(sampleDocument);
    const res = await request(app).get('/api/platform/documents/doc-uuid-1');
    expect(res.status).toBe(200);
  });

  it('includes category in query (for display with downloads)', async () => {
    const app = buildDocumentsApp('VIEWER');
    mockPrisma.document.findUnique.mockResolvedValue(sampleDocument);
    await request(app).get('/api/platform/documents/doc-uuid-1');
    const args = mockPrisma.document.findUnique.mock.calls[0][0];
    expect(args.include.category).toBe(true);
    expect(args.include.versions).toBeDefined();
  });
});

describe('Documents — POST /api/platform/documents (MANAGER+ upload)', () => {
  const validBody = {
    title: 'Building Policy',
    description: 'Main policy',
    categoryId: 'cat-uuid-1',
    filename: 'policy.pdf',
    mimeType: 'application/pdf',
    size: 1024,
    storagePath: '/storage/policy.pdf',
  };

  it('returns 401 when unauthenticated', async () => {
    const app = buildDocumentsApp(null);
    const res = await request(app).post('/api/platform/documents').send(validBody);
    expect(res.status).toBe(401);
  });

  it('returns 403 for VIEWER (role-based upload restriction)', async () => {
    const app = buildDocumentsApp('VIEWER');
    const res = await request(app).post('/api/platform/documents').send(validBody);
    expect(res.status).toBe(403);
  });

  it('returns 400 when required fields are missing', async () => {
    const app = buildDocumentsApp('EDITOR');
    const res = await request(app).post('/api/platform/documents').send({ title: 'Only title' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when categoryId does not exist', async () => {
    const app = buildDocumentsApp('EDITOR', 1);
    mockPrisma.platformUser.findUnique.mockResolvedValue(samplePlatformUser);
    mockPrisma.documentCategory.findUnique.mockResolvedValue(null);
    const res = await request(app).post('/api/platform/documents').send(validBody);
    expect(res.status).toBe(404);
  });

  it('auto-provisions PlatformUser for EDITOR and creates document', async () => {
    const app = buildDocumentsApp('EDITOR', 1);
    // No existing PlatformUser — will be auto-provisioned for EDITOR
    mockPrisma.platformUser.findUnique.mockResolvedValue(null);
    const autoProvisionedUser = { id: 'auto-provisioned-1', userId: 1, role: 'MANAGER' };
    mockPrisma.platformUser.create.mockResolvedValue(autoProvisionedUser);
    mockPrisma.documentCategory.findUnique.mockResolvedValue(sampleCategory);
    mockPrisma.document.create.mockResolvedValue(sampleDocument);
    const res = await request(app).post('/api/platform/documents').send(validBody);
    expect(res.status).toBe(201);
    expect(mockPrisma.platformUser.create).toHaveBeenCalledWith({
      data: { userId: 1, role: 'MANAGER' },
    });
  });

  it('creates document with first version for EDITOR (MANAGER+)', async () => {
    const app = buildDocumentsApp('EDITOR', 1);
    mockPrisma.platformUser.findUnique.mockResolvedValue(samplePlatformUser);
    mockPrisma.documentCategory.findUnique.mockResolvedValue(sampleCategory);
    mockPrisma.document.create.mockResolvedValue(sampleDocument);
    const res = await request(app).post('/api/platform/documents').send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Building Policy');
    const createArgs = mockPrisma.document.create.mock.calls[0][0];
    expect(createArgs.data.title).toBe('Building Policy');
    expect(createArgs.data.uploadedBy).toBe('platform-user-1');
    expect(createArgs.data.versions.create.version).toBe(1);
    expect(createArgs.data.active).toBe(true);
  });
});

describe('Documents — POST /api/platform/documents/:id/versions (new version upload)', () => {
  const versionBody = {
    filename: 'policy-v2.pdf',
    mimeType: 'application/pdf',
    size: 2048,
    storagePath: '/storage/policy-v2.pdf',
  };

  it('returns 401 when unauthenticated', async () => {
    const app = buildDocumentsApp(null);
    const res = await request(app)
      .post('/api/platform/documents/doc-uuid-1/versions')
      .send(versionBody);
    expect(res.status).toBe(401);
  });

  it('returns 403 for VIEWER role', async () => {
    const app = buildDocumentsApp('VIEWER');
    const res = await request(app)
      .post('/api/platform/documents/doc-uuid-1/versions')
      .send(versionBody);
    expect(res.status).toBe(403);
  });

  it('returns 404 when document not found', async () => {
    const app = buildDocumentsApp('EDITOR');
    mockPrisma.document.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/platform/documents/nonexistent/versions')
      .send(versionBody);
    expect(res.status).toBe(404);
  });

  it('auto-increments version number from existing versions', async () => {
    const app = buildDocumentsApp('EDITOR', 1);
    const docWithVersions = { ...sampleDocument, versions: [{ ...sampleDocumentVersion, version: 3 }] };
    mockPrisma.document.findUnique.mockResolvedValue(docWithVersions);
    mockPrisma.platformUser.findUnique.mockResolvedValue(samplePlatformUser);
    mockPrisma.documentVersion.create.mockResolvedValue({ ...sampleDocumentVersion, version: 4 });
    const res = await request(app)
      .post('/api/platform/documents/doc-uuid-1/versions')
      .send(versionBody);
    expect(res.status).toBe(201);
    const createArgs = mockPrisma.documentVersion.create.mock.calls[0][0];
    expect(createArgs.data.version).toBe(4);
    expect(createArgs.data.documentId).toBe('doc-uuid-1');
  });
});

// =============================================================================
// SURVEYS
// =============================================================================

describe('Surveys — GET /api/platform/surveys (active-only for VIEWER)', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildSurveysApp(null);
    const res = await request(app).get('/api/platform/surveys');
    expect(res.status).toBe(401);
  });

  it('returns all surveys for authenticated VIEWER', async () => {
    const app = buildSurveysApp('VIEWER');
    mockPrisma.survey.findMany.mockResolvedValue([sampleSurvey]);
    const res = await request(app).get('/api/platform/surveys');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].id).toBe('survey-uuid-1');
  });

  it('filters to active only when ?active=true is passed', async () => {
    const app = buildSurveysApp('VIEWER');
    mockPrisma.survey.findMany.mockResolvedValue([sampleSurvey]);
    await request(app).get('/api/platform/surveys?active=true');
    const args = mockPrisma.survey.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ active: true });
  });

  it('filters inactive surveys when ?active=false is passed', async () => {
    const app = buildSurveysApp('EDITOR');
    mockPrisma.survey.findMany.mockResolvedValue([]);
    await request(app).get('/api/platform/surveys?active=false');
    const args = mockPrisma.survey.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ active: false });
  });

  it('does not filter by active when param is omitted', async () => {
    const app = buildSurveysApp('ADMIN');
    mockPrisma.survey.findMany.mockResolvedValue([sampleSurvey]);
    await request(app).get('/api/platform/surveys');
    const args = mockPrisma.survey.findMany.mock.calls[0][0];
    expect(args.where).not.toHaveProperty('active');
  });
});

describe('Surveys — GET /api/platform/surveys/:id (single survey)', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildSurveysApp(null);
    const res = await request(app).get('/api/platform/surveys/survey-uuid-1');
    expect(res.status).toBe(401);
  });

  it('returns 404 when survey not found', async () => {
    const app = buildSurveysApp('VIEWER');
    mockPrisma.survey.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/platform/surveys/nonexistent');
    expect(res.status).toBe(404);
  });

  it('returns survey with questions and response count', async () => {
    const app = buildSurveysApp('VIEWER');
    mockPrisma.survey.findUnique.mockResolvedValue({
      ...sampleSurvey,
      questions: [sampleQuestion],
      _count: { responses: 5 },
    });
    const res = await request(app).get('/api/platform/surveys/survey-uuid-1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('survey-uuid-1');
    expect(res.body.questions).toHaveLength(1);
    expect(res.body._count.responses).toBe(5);
  });
});

describe('Surveys — POST /api/platform/surveys (MANAGER+ create)', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildSurveysApp(null);
    const res = await request(app)
      .post('/api/platform/surveys')
      .send({ title: 'Test', description: 'Desc' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for VIEWER role', async () => {
    const app = buildSurveysApp('VIEWER');
    const res = await request(app)
      .post('/api/platform/surveys')
      .send({ title: 'Test', description: 'Desc' });
    expect(res.status).toBe(403);
  });

  it('returns 400 when title is missing', async () => {
    const app = buildSurveysApp('EDITOR');
    const res = await request(app)
      .post('/api/platform/surveys')
      .send({ description: 'No title' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/title/i);
  });

  it('returns 400 when description is missing', async () => {
    const app = buildSurveysApp('EDITOR');
    const res = await request(app)
      .post('/api/platform/surveys')
      .send({ title: 'Missing desc' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/description/i);
  });

  it('creates survey for EDITOR+ (MANAGER+)', async () => {
    const app = buildSurveysApp('EDITOR', 1);
    mockPrisma.survey.create.mockResolvedValue({ ...sampleSurvey, questions: [], _count: { responses: 0 } });
    const res = await request(app)
      .post('/api/platform/surveys')
      .send({ title: 'New Survey', description: 'Survey desc' });
    expect(res.status).toBe(201);
    const createArgs = mockPrisma.survey.create.mock.calls[0][0];
    expect(createArgs.data.title).toBe('New Survey');
  });

  it('creates survey with questions (MANAGER+ managing survey questions)', async () => {
    const app = buildSurveysApp('EDITOR', 1);
    mockPrisma.survey.create.mockResolvedValue({
      ...sampleSurvey,
      questions: [sampleQuestion],
      _count: { responses: 0 },
    });
    const res = await request(app)
      .post('/api/platform/surveys')
      .send({
        title: 'Survey with Questions',
        description: 'Desc',
        questions: [
          { text: 'How satisfied?', type: 'RATING', sortOrder: 0 },
        ],
      });
    expect(res.status).toBe(201);
    const createArgs = mockPrisma.survey.create.mock.calls[0][0];
    expect(createArgs.data.questions.create).toHaveLength(1);
  });

  it('returns 400 when questions is not an array', async () => {
    const app = buildSurveysApp('EDITOR');
    const res = await request(app)
      .post('/api/platform/surveys')
      .send({ title: 'Bad', description: 'Desc', questions: 'not-an-array' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/questions/i);
  });

  it('sets createdBy from session user', async () => {
    const app = buildSurveysApp('EDITOR', 42);
    mockPrisma.survey.create.mockResolvedValue({ ...sampleSurvey, questions: [], _count: { responses: 0 } });
    await request(app)
      .post('/api/platform/surveys')
      .send({ title: 'Survey', description: 'Desc' });
    const createArgs = mockPrisma.survey.create.mock.calls[0][0];
    expect(String(createArgs.data.createdBy)).toBe('42');
  });
});

describe('Surveys — POST /api/platform/surveys/:id/respond (RESIDENT response)', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildSurveysApp(null);
    const res = await request(app)
      .post('/api/platform/surveys/survey-uuid-1/respond')
      .send({ answers: { 'question-uuid-1': 5 } });
    expect(res.status).toBe(401);
  });

  it('returns 404 when survey not found', async () => {
    const app = buildSurveysApp('VIEWER');
    mockPrisma.survey.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/platform/surveys/nonexistent/respond')
      .send({ answers: { 'question-uuid-1': 5 } });
    expect(res.status).toBe(404);
  });

  it('returns 400 when answers is not an object', async () => {
    const app = buildSurveysApp('VIEWER');
    mockPrisma.survey.findUnique.mockResolvedValue({ ...sampleSurvey, questions: [] });
    const res = await request(app)
      .post('/api/platform/surveys/survey-uuid-1/respond')
      .send({ answers: 'invalid' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/answers/i);
  });

  it('creates new response (201) on first submission by VIEWER/RESIDENT', async () => {
    const app = buildSurveysApp('VIEWER', 1);
    mockPrisma.survey.findUnique.mockResolvedValue({ ...sampleSurvey, questions: [sampleQuestion] });
    mockPrisma.surveyResponse.findFirst.mockResolvedValue(null);
    mockPrisma.surveyResponse.create.mockResolvedValue(sampleSurveyResponse);
    const res = await request(app)
      .post('/api/platform/surveys/survey-uuid-1/respond')
      .send({ answers: { 'question-uuid-1': 5 } });
    expect(res.status).toBe(201);
    expect(mockPrisma.surveyResponse.create).toHaveBeenCalledOnce();
    expect(mockPrisma.surveyResponse.update).not.toHaveBeenCalled();
  });

  it('updates existing response (200) when RESIDENT re-submits', async () => {
    const app = buildSurveysApp('VIEWER', 1);
    mockPrisma.survey.findUnique.mockResolvedValue({ ...sampleSurvey, questions: [sampleQuestion] });
    mockPrisma.surveyResponse.findFirst.mockResolvedValue(sampleSurveyResponse);
    mockPrisma.surveyResponse.update.mockResolvedValue({
      ...sampleSurveyResponse,
      answers: { 'question-uuid-1': 3 },
    });
    const res = await request(app)
      .post('/api/platform/surveys/survey-uuid-1/respond')
      .send({ answers: { 'question-uuid-1': 3 } });
    expect(res.status).toBe(200);
    expect(mockPrisma.surveyResponse.update).toHaveBeenCalledOnce();
    expect(mockPrisma.surveyResponse.create).not.toHaveBeenCalled();
  });

  it('allows any authenticated role to respond (including EDITOR)', async () => {
    const app = buildSurveysApp('EDITOR', 2);
    mockPrisma.survey.findUnique.mockResolvedValue({ ...sampleSurvey, questions: [] });
    mockPrisma.surveyResponse.findFirst.mockResolvedValue(null);
    mockPrisma.surveyResponse.create.mockResolvedValue({ ...sampleSurveyResponse, userId: '2' });
    const res = await request(app)
      .post('/api/platform/surveys/survey-uuid-1/respond')
      .send({ answers: { 'question-uuid-1': 4 } });
    expect(res.status).toBe(201);
  });
});

describe('Surveys — GET /api/platform/surveys/:id/results (MANAGER+ only)', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildSurveysApp(null);
    const res = await request(app).get('/api/platform/surveys/survey-uuid-1/results');
    expect(res.status).toBe(401);
  });

  it('returns 403 for VIEWER role', async () => {
    const app = buildSurveysApp('VIEWER');
    const res = await request(app).get('/api/platform/surveys/survey-uuid-1/results');
    expect(res.status).toBe(403);
  });

  it('returns 404 when survey not found', async () => {
    const app = buildSurveysApp('EDITOR');
    mockPrisma.survey.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/platform/surveys/nonexistent/results');
    expect(res.status).toBe(404);
  });

  it('returns aggregated results for MANAGER+ (EDITOR+)', async () => {
    const app = buildSurveysApp('EDITOR');
    mockPrisma.survey.findUnique.mockResolvedValue({ ...sampleSurvey, questions: [sampleQuestion], _count: { responses: 3 } });
    mockPrisma.surveyResponse.findMany.mockResolvedValue([
      { answers: { 'question-uuid-1': 5 } },
      { answers: { 'question-uuid-1': 5 } },
      { answers: { 'question-uuid-1': 4 } },
    ]);
    const res = await request(app).get('/api/platform/surveys/survey-uuid-1/results');
    expect(res.status).toBe(200);
    expect(res.body.survey.id).toBe('survey-uuid-1');
    expect(res.body.totalResponses).toBe(3);
    // Route returns responses as array of {value} objects, not counts
    expect(res.body.questions[0].responses).toHaveLength(3);
    expect(res.body.questions[0].responses[0]).toHaveProperty('value');
  });

  it('returns zero counts when no responses exist', async () => {
    const app = buildSurveysApp('EDITOR');
    mockPrisma.survey.findUnique.mockResolvedValue({ ...sampleSurvey, questions: [sampleQuestion], _count: { responses: 0 } });
    mockPrisma.surveyResponse.findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/platform/surveys/survey-uuid-1/results');
    expect(res.status).toBe(200);
    expect(res.body.totalResponses).toBe(0);
    expect(res.body.questions[0].responses).toEqual([]);
  });

  it('returns results for ADMIN', async () => {
    const app = buildSurveysApp('ADMIN');
    mockPrisma.survey.findUnique.mockResolvedValue({ ...sampleSurvey, questions: [sampleQuestion] });
    mockPrisma.surveyResponse.findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/platform/surveys/survey-uuid-1/results');
    expect(res.status).toBe(200);
  });
});

// =============================================================================
// TRAINING
// =============================================================================

describe('Training — GET /api/platform/training (list with completion status)', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildTrainingApp(undefined);
    const res = await request(app).get('/api/platform/training');
    expect(res.status).toBe(401);
  });

  it('returns list of training resources for VIEWER with completions count', async () => {
    vi.mocked(prisma.trainingResource.findMany).mockResolvedValue([sampleTrainingResource] as any);
    const app = buildTrainingApp(viewerUser);
    const res = await request(app).get('/api/platform/training');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].title).toBe('Fire Safety Training');
    const args = vi.mocked(prisma.trainingResource.findMany).mock.calls[0][0] as any;
    expect(args.include?._count?.select?.completions).toBe(true);
  });

  it('returns list for EDITOR', async () => {
    vi.mocked(prisma.trainingResource.findMany).mockResolvedValue([sampleTrainingResource] as any);
    const app = buildTrainingApp(editorUser);
    const res = await request(app).get('/api/platform/training');
    expect(res.status).toBe(200);
  });

  it('returns list for ADMIN', async () => {
    vi.mocked(prisma.trainingResource.findMany).mockResolvedValue([sampleTrainingResource] as any);
    const app = buildTrainingApp(adminUser);
    const res = await request(app).get('/api/platform/training');
    expect(res.status).toBe(200);
  });

  it('filters by active=true when ?active=true is passed', async () => {
    vi.mocked(prisma.trainingResource.findMany).mockResolvedValue([sampleTrainingResource] as any);
    const app = buildTrainingApp(viewerUser);
    await request(app).get('/api/platform/training?active=true');
    const args = vi.mocked(prisma.trainingResource.findMany).mock.calls[0][0] as any;
    expect(args.where).toMatchObject({ active: true });
  });

  it('does not filter by active when ?active is not passed', async () => {
    vi.mocked(prisma.trainingResource.findMany).mockResolvedValue([sampleTrainingResource] as any);
    const app = buildTrainingApp(viewerUser);
    await request(app).get('/api/platform/training');
    const args = vi.mocked(prisma.trainingResource.findMany).mock.calls[0][0] as any;
    expect(args.where).not.toHaveProperty('active');
  });
});

describe('Training — GET /api/platform/training/:id (detail with completion status)', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildTrainingApp(undefined);
    const res = await request(app).get('/api/platform/training/resource-uuid-1');
    expect(res.status).toBe(401);
  });

  it('returns 404 when resource does not exist', async () => {
    vi.mocked(prisma.trainingResource.findUnique).mockResolvedValue(null);
    const app = buildTrainingApp(viewerUser);
    const res = await request(app).get('/api/platform/training/nonexistent-uuid');
    expect(res.status).toBe(404);
  });

  it('returns resource detail with completions list for VIEWER', async () => {
    vi.mocked(prisma.trainingResource.findUnique).mockResolvedValue({
      ...sampleTrainingResource,
      completions: [sampleCompletion],
    } as any);
    const app = buildTrainingApp(viewerUser);
    const res = await request(app).get('/api/platform/training/resource-uuid-1');
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Fire Safety Training');
    expect(vi.mocked(prisma.trainingResource.findUnique)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'resource-uuid-1' },
        include: expect.objectContaining({ completions: expect.anything() }),
      }),
    );
  });
});

describe('Training — POST /api/platform/training (MANAGER+ create)', () => {
  const newResourcePayload = {
    title: 'CPR Certification',
    description: 'Hands-on CPR training',
    contentType: 'DOCUMENT',
    contentUrl: 'https://example.com/cpr',
  };

  it('returns 401 when unauthenticated', async () => {
    const app = buildTrainingApp(undefined);
    const res = await request(app).post('/api/platform/training').send(newResourcePayload);
    expect(res.status).toBe(401);
  });

  it('returns 403 when VIEWER tries to create', async () => {
    const app = buildTrainingApp(viewerUser);
    const res = await request(app).post('/api/platform/training').send(newResourcePayload);
    expect(res.status).toBe(403);
  });

  it('returns 400 when title is missing', async () => {
    const app = buildTrainingApp(editorUser);
    const res = await request(app)
      .post('/api/platform/training')
      .send({ description: 'Test', contentType: 'DOCUMENT' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/title/i);
  });

  it('returns 400 when contentType is invalid', async () => {
    const app = buildTrainingApp(editorUser);
    const res = await request(app)
      .post('/api/platform/training')
      .send({ title: 'Test', description: 'Desc', contentType: 'INVALID' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/contentType/i);
  });

  it('creates resource when EDITOR (MANAGER+)', async () => {
    vi.mocked(prisma.trainingResource.create).mockResolvedValue({
      ...sampleTrainingResource,
      title: 'CPR Certification',
    } as any);
    const app = buildTrainingApp(editorUser);
    const res = await request(app).post('/api/platform/training').send(newResourcePayload);
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('CPR Certification');
    expect(vi.mocked(prisma.trainingResource.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'CPR Certification',
          contentType: 'DOCUMENT',
        }),
      }),
    );
  });

  it('defaults active=true and sortOrder=0 when not provided', async () => {
    vi.mocked(prisma.trainingResource.create).mockResolvedValue(sampleTrainingResource as any);
    const app = buildTrainingApp(editorUser);
    await request(app).post('/api/platform/training').send(newResourcePayload);
    const createArgs = vi.mocked(prisma.trainingResource.create).mock.calls[0][0] as any;
    expect(createArgs.data.active).toBe(true);
    expect(createArgs.data.sortOrder).toBe(0);
  });

  it('accepts all valid contentType values (VIDEO, DOCUMENT, LINK)', async () => {
    vi.mocked(prisma.trainingResource.create).mockResolvedValue(sampleTrainingResource as any);
    const app = buildTrainingApp(editorUser);
    for (const contentType of ['VIDEO', 'DOCUMENT', 'LINK']) {
      vi.clearAllMocks();
      vi.mocked(prisma.trainingResource.create).mockResolvedValue({
        ...sampleTrainingResource,
        contentType,
      } as any);
      const res = await request(app)
        .post('/api/platform/training')
        .send({ title: 'Test', description: 'Desc', contentType });
      expect(res.status).toBe(201);
    }
  });
});

describe('Training — POST /api/platform/training/:id/complete (mark-complete, role-based)', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildTrainingApp(undefined);
    const res = await request(app).post('/api/platform/training/resource-uuid-1/complete');
    expect(res.status).toBe(401);
  });

  it('returns 404 when resource does not exist', async () => {
    vi.mocked(prisma.trainingResource.findUnique).mockResolvedValue(null);
    const app = buildTrainingApp(viewerUser);
    const res = await request(app).post('/api/platform/training/nonexistent-uuid/complete');
    expect(res.status).toBe(404);
  });

  it('marks training as complete for VIEWER (any authenticated user)', async () => {
    vi.mocked(prisma.trainingResource.findUnique).mockResolvedValue(sampleTrainingResource as any);
    vi.mocked(prisma.trainingCompletion.upsert).mockResolvedValue(sampleCompletion as any);
    const app = buildTrainingApp(viewerUser);
    const res = await request(app).post('/api/platform/training/resource-uuid-1/complete');
    expect(res.status).toBe(201);
    expect(vi.mocked(prisma.trainingCompletion.upsert)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          resourceId_userId: {
            resourceId: 'resource-uuid-1',
            userId: viewerUser.id,
          },
        },
        create: expect.objectContaining({ resourceId: 'resource-uuid-1' }),
        update: {},
      }),
    );
  });

  it('is idempotent — VIEWER can complete the same resource twice without error', async () => {
    vi.mocked(prisma.trainingResource.findUnique).mockResolvedValue(sampleTrainingResource as any);
    vi.mocked(prisma.trainingCompletion.upsert).mockResolvedValue(sampleCompletion as any);
    const app = buildTrainingApp(viewerUser);
    const res1 = await request(app).post('/api/platform/training/resource-uuid-1/complete');
    const res2 = await request(app).post('/api/platform/training/resource-uuid-1/complete');
    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    // Empty update clause ensures idempotency
    const upsertArgs = vi.mocked(prisma.trainingCompletion.upsert).mock.calls[0][0] as any;
    expect(upsertArgs.update).toEqual({});
  });

  it('marks training as complete for EDITOR', async () => {
    vi.mocked(prisma.trainingResource.findUnique).mockResolvedValue(sampleTrainingResource as any);
    vi.mocked(prisma.trainingCompletion.upsert).mockResolvedValue({
      ...sampleCompletion,
      userId: editorUser.id,
    } as any);
    const app = buildTrainingApp(editorUser);
    const res = await request(app).post('/api/platform/training/resource-uuid-1/complete');
    expect(res.status).toBe(201);
  });
});

describe('Training — GET /api/platform/training/:id/completions (role-based access)', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildTrainingApp(undefined);
    const res = await request(app).get('/api/platform/training/resource-uuid-1/completions');
    expect(res.status).toBe(401);
  });

  it('returns 403 when VIEWER tries to list completions', async () => {
    const app = buildTrainingApp(viewerUser);
    const res = await request(app).get('/api/platform/training/resource-uuid-1/completions');
    expect(res.status).toBe(403);
  });

  it('returns 404 when resource does not exist', async () => {
    vi.mocked(prisma.trainingResource.findUnique).mockResolvedValue(null);
    const app = buildTrainingApp(editorUser);
    const res = await request(app).get('/api/platform/training/nonexistent-uuid/completions');
    expect(res.status).toBe(404);
  });

  it('returns all completions with user details for EDITOR (MANAGER+)', async () => {
    vi.mocked(prisma.trainingResource.findUnique).mockResolvedValue(sampleTrainingResource as any);
    vi.mocked(prisma.trainingCompletion.findMany).mockResolvedValue([sampleCompletion] as any);
    const app = buildTrainingApp(editorUser);
    const res = await request(app).get('/api/platform/training/resource-uuid-1/completions');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(vi.mocked(prisma.trainingCompletion.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { resourceId: 'resource-uuid-1' },
        include: expect.objectContaining({ user: expect.anything() }),
      }),
    );
  });

  it('returns completions for ADMIN', async () => {
    vi.mocked(prisma.trainingResource.findUnique).mockResolvedValue(sampleTrainingResource as any);
    vi.mocked(prisma.trainingCompletion.findMany).mockResolvedValue([sampleCompletion] as any);
    const app = buildTrainingApp(adminUser);
    const res = await request(app).get('/api/platform/training/resource-uuid-1/completions');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});
