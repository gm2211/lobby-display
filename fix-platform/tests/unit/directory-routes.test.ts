/**
 * Unit tests for Directory API routes.
 *
 * Uses vi.mock to mock Prisma so no database is needed.
 * Tests cover:
 *  - GET /  - list directory entries, searchable by name/unit, respects `visible` flag
 *  - GET /:id - single entry detail
 *  - PUT /:id - update own profile or MANAGER+ can update any
 *
 * Auth model:
 *  - GET routes require authentication (any role)
 *  - Hidden entries (visible=false) are only returned for own entry or MANAGER+ users
 *  - PUT requires auth; users can only update their own entry unless MANAGER+
 *  - boardMember flag is derived from user.role === BOARD_MEMBER
 *
 * No POST/DELETE — entries are auto-created from PlatformUser.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { errorHandler } from '../../server/middleware/errorHandler.js';

// Mock Prisma before importing routes
vi.mock('../../server/db.js', () => ({
  default: {
    directoryEntry: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    platformUser: {
      findUnique: vi.fn(),
    },
  },
}));

import prisma from '../../server/db.js';
import directoryRouter from '../../server/routes/platform/directory.js';

// Type helpers for mocked Prisma functions
const mockPrisma = prisma as {
  directoryEntry: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  platformUser: {
    findUnique: ReturnType<typeof vi.fn>;
  };
};

/**
 * Build a minimal Express app with a session user.
 * platformUser is attached to simulate the request context after platformProtect.
 */
function buildApp(
  role: 'ADMIN' | 'EDITOR' | 'VIEWER' | null = 'ADMIN',
  userId: number = 1,
  platformUserId: string = 'pu-uuid-1',
  platformRole: 'RESIDENT' | 'BOARD_MEMBER' | 'MANAGER' | 'SECURITY' | 'CONCIERGE' = 'RESIDENT',
) {
  const app = express();
  app.use(express.json());

  // Inject mock session
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
  user: {
    id: 'pu-uuid-1',
    role: 'RESIDENT',
    unitNumber: '1A',
  },
};

const sampleHiddenEntry = {
  ...sampleDirectoryEntry,
  id: 'dir-uuid-2',
  userId: 'pu-uuid-2',
  displayName: 'Bob Jones',
  visible: false,
  user: {
    id: 'pu-uuid-2',
    role: 'RESIDENT',
    unitNumber: '2B',
  },
};

const sampleBoardMemberEntry = {
  ...sampleDirectoryEntry,
  id: 'dir-uuid-3',
  userId: 'pu-uuid-3',
  displayName: 'Carol White',
  visible: true,
  user: {
    id: 'pu-uuid-3',
    role: 'BOARD_MEMBER',
    unitNumber: '3C',
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── GET / ────────────────────────────────────────────────────────────────────

describe('GET /api/platform/directory', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).get('/api/platform/directory');
    expect(res.status).toBe(401);
  });

  it('returns all visible entries for authenticated user', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.directoryEntry.findMany.mockResolvedValue([sampleDirectoryEntry]);
    const res = await request(app).get('/api/platform/directory');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
    expect(res.body[0].id).toBe('dir-uuid-1');
  });

  it('filters out hidden entries for non-manager regular users', async () => {
    const app = buildApp('VIEWER', 1, 'pu-uuid-1', 'RESIDENT');
    mockPrisma.directoryEntry.findMany.mockResolvedValue([sampleDirectoryEntry]);
    const res = await request(app).get('/api/platform/directory');
    expect(res.status).toBe(200);
    // Only visible entries should appear (hidden filtered at query level for non-manager)
    const callArgs = mockPrisma.directoryEntry.findMany.mock.calls[0][0];
    expect(callArgs.where).toMatchObject({ visible: true });
  });

  it('allows MANAGER to see hidden entries', async () => {
    const app = buildApp('EDITOR', 2, 'pu-uuid-2', 'MANAGER');
    mockPrisma.directoryEntry.findMany.mockResolvedValue([
      sampleDirectoryEntry,
      sampleHiddenEntry,
    ]);
    const res = await request(app).get('/api/platform/directory');
    expect(res.status).toBe(200);
    // MANAGER should not be restricted to visible only
    const callArgs = mockPrisma.directoryEntry.findMany.mock.calls[0][0];
    expect(callArgs.where).not.toMatchObject({ visible: true });
  });

  it('searches by displayName when name query param is provided', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.directoryEntry.findMany.mockResolvedValue([sampleDirectoryEntry]);
    const res = await request(app).get('/api/platform/directory?name=Alice');
    expect(res.status).toBe(200);
    const callArgs = mockPrisma.directoryEntry.findMany.mock.calls[0][0];
    expect(JSON.stringify(callArgs.where)).toContain('Alice');
  });

  it('searches by unit when unit query param is provided', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.directoryEntry.findMany.mockResolvedValue([sampleDirectoryEntry]);
    const res = await request(app).get('/api/platform/directory?unit=1A');
    expect(res.status).toBe(200);
    const callArgs = mockPrisma.directoryEntry.findMany.mock.calls[0][0];
    expect(JSON.stringify(callArgs.where)).toContain('1A');
  });

  it('adds boardMember flag to entries with BOARD_MEMBER role', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.directoryEntry.findMany.mockResolvedValue([
      sampleDirectoryEntry,
      sampleBoardMemberEntry,
    ]);
    const res = await request(app).get('/api/platform/directory');
    expect(res.status).toBe(200);
    const nonBoardEntry = res.body.find((e: any) => e.id === 'dir-uuid-1');
    const boardEntry = res.body.find((e: any) => e.id === 'dir-uuid-3');
    expect(nonBoardEntry.boardMember).toBe(false);
    expect(boardEntry.boardMember).toBe(true);
  });

  it('filters by boardMember=true query param', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.directoryEntry.findMany.mockResolvedValue([sampleBoardMemberEntry]);
    const res = await request(app).get('/api/platform/directory?boardMember=true');
    expect(res.status).toBe(200);
    // Should filter to only BOARD_MEMBER role entries
    const callArgs = mockPrisma.directoryEntry.findMany.mock.calls[0][0];
    expect(JSON.stringify(callArgs.where)).toContain('BOARD_MEMBER');
  });

  it('includes user info (role, unitNumber) in the response', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.directoryEntry.findMany.mockResolvedValue([sampleDirectoryEntry]);
    const res = await request(app).get('/api/platform/directory');
    expect(res.status).toBe(200);
    const callArgs = mockPrisma.directoryEntry.findMany.mock.calls[0][0];
    expect(callArgs.include).toHaveProperty('user');
  });

  it('orders results by sortOrder', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.directoryEntry.findMany.mockResolvedValue([sampleDirectoryEntry]);
    const res = await request(app).get('/api/platform/directory');
    expect(res.status).toBe(200);
    const callArgs = mockPrisma.directoryEntry.findMany.mock.calls[0][0];
    expect(callArgs.orderBy).toBeDefined();
  });

  it('returns ADMIN user all entries including hidden', async () => {
    const app = buildApp('ADMIN', 1, 'pu-uuid-1', 'MANAGER');
    mockPrisma.directoryEntry.findMany.mockResolvedValue([
      sampleDirectoryEntry,
      sampleHiddenEntry,
    ]);
    const res = await request(app).get('/api/platform/directory');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
  });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────

describe('GET /api/platform/directory/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).get('/api/platform/directory/dir-uuid-1');
    expect(res.status).toBe(401);
  });

  it('returns 404 when entry not found', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.directoryEntry.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/platform/directory/nonexistent-id');
    expect(res.status).toBe(404);
  });

  it('returns entry detail for authenticated user', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.directoryEntry.findUnique.mockResolvedValue(sampleDirectoryEntry);
    const res = await request(app).get('/api/platform/directory/dir-uuid-1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('dir-uuid-1');
    expect(res.body.displayName).toBe('Alice Smith');
  });

  it('returns 403 when non-owner accesses hidden entry', async () => {
    const app = buildApp('VIEWER', 1, 'pu-uuid-1', 'RESIDENT');
    // Entry belongs to pu-uuid-2, not pu-uuid-1
    mockPrisma.directoryEntry.findUnique.mockResolvedValue(sampleHiddenEntry);
    const res = await request(app).get('/api/platform/directory/dir-uuid-2');
    expect(res.status).toBe(403);
  });

  it('returns own hidden entry to the owner', async () => {
    const app = buildApp('VIEWER', 2, 'pu-uuid-2', 'RESIDENT');
    // Same user as the hidden entry's userId
    mockPrisma.directoryEntry.findUnique.mockResolvedValue(sampleHiddenEntry);
    const res = await request(app).get('/api/platform/directory/dir-uuid-2');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('dir-uuid-2');
  });

  it('allows MANAGER to see any hidden entry', async () => {
    const app = buildApp('EDITOR', 2, 'pu-uuid-2', 'MANAGER');
    mockPrisma.directoryEntry.findUnique.mockResolvedValue(sampleHiddenEntry);
    const res = await request(app).get('/api/platform/directory/dir-uuid-2');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('dir-uuid-2');
  });

  it('queries by id correctly', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.directoryEntry.findUnique.mockResolvedValue(sampleDirectoryEntry);
    await request(app).get('/api/platform/directory/dir-uuid-1');
    const callArgs = mockPrisma.directoryEntry.findUnique.mock.calls[0][0];
    expect(callArgs.where).toMatchObject({ id: 'dir-uuid-1' });
  });

  it('adds boardMember flag to the response', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.directoryEntry.findUnique.mockResolvedValue(sampleBoardMemberEntry);
    const res = await request(app).get('/api/platform/directory/dir-uuid-3');
    expect(res.status).toBe(200);
    expect(res.body.boardMember).toBe(true);
  });

  it('sets boardMember=false for non-board-member entries', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.directoryEntry.findUnique.mockResolvedValue(sampleDirectoryEntry);
    const res = await request(app).get('/api/platform/directory/dir-uuid-1');
    expect(res.status).toBe(200);
    expect(res.body.boardMember).toBe(false);
  });

  it('includes user info in response', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.directoryEntry.findUnique.mockResolvedValue(sampleDirectoryEntry);
    await request(app).get('/api/platform/directory/dir-uuid-1');
    const callArgs = mockPrisma.directoryEntry.findUnique.mock.calls[0][0];
    expect(callArgs.include).toHaveProperty('user');
  });
});

// ─── PUT /:id ─────────────────────────────────────────────────────────────────

describe('PUT /api/platform/directory/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app)
      .put('/api/platform/directory/dir-uuid-1')
      .send({ displayName: 'Updated Name' });
    expect(res.status).toBe(401);
  });

  it('returns 404 when entry not found', async () => {
    const app = buildApp('VIEWER', 1, 'pu-uuid-1', 'RESIDENT');
    mockPrisma.directoryEntry.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .put('/api/platform/directory/nonexistent')
      .send({ displayName: 'Updated Name' });
    expect(res.status).toBe(404);
  });

  it('returns 403 when non-owner tries to update another user\'s entry', async () => {
    const app = buildApp('VIEWER', 1, 'pu-uuid-1', 'RESIDENT');
    // Entry belongs to pu-uuid-2, not pu-uuid-1
    mockPrisma.directoryEntry.findUnique.mockResolvedValue(sampleHiddenEntry);
    const res = await request(app)
      .put('/api/platform/directory/dir-uuid-2')
      .send({ displayName: 'Updated Name' });
    expect(res.status).toBe(403);
  });

  it('allows user to update their own entry', async () => {
    const app = buildApp('VIEWER', 2, 'pu-uuid-2', 'RESIDENT');
    // Entry belongs to pu-uuid-2 — same as the logged in user
    mockPrisma.directoryEntry.findUnique.mockResolvedValue(sampleHiddenEntry);
    const updatedEntry = {
      ...sampleHiddenEntry,
      displayName: 'Bob Jones Updated',
      user: { id: 'pu-uuid-2', role: 'RESIDENT', unitNumber: '2B' },
    };
    mockPrisma.directoryEntry.update.mockResolvedValue(updatedEntry);
    const res = await request(app)
      .put('/api/platform/directory/dir-uuid-2')
      .send({ displayName: 'Bob Jones Updated' });
    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe('Bob Jones Updated');
  });

  it('allows MANAGER to update any entry', async () => {
    const app = buildApp('EDITOR', 2, 'pu-uuid-2', 'MANAGER');
    // Entry belongs to pu-uuid-1, but user is MANAGER
    mockPrisma.directoryEntry.findUnique.mockResolvedValue(sampleDirectoryEntry);
    const updatedEntry = {
      ...sampleDirectoryEntry,
      displayName: 'Alice Smith Updated',
      user: { id: 'pu-uuid-1', role: 'RESIDENT', unitNumber: '1A' },
    };
    mockPrisma.directoryEntry.update.mockResolvedValue(updatedEntry);
    const res = await request(app)
      .put('/api/platform/directory/dir-uuid-1')
      .send({ displayName: 'Alice Smith Updated' });
    expect(res.status).toBe(200);
  });

  it('only updates provided fields (partial update)', async () => {
    const app = buildApp('VIEWER', 1, 'pu-uuid-1', 'RESIDENT');
    mockPrisma.directoryEntry.findUnique.mockResolvedValue(sampleDirectoryEntry);
    const updatedEntry = {
      ...sampleDirectoryEntry,
      phone: '555-9999',
      user: { id: 'pu-uuid-1', role: 'RESIDENT', unitNumber: '1A' },
    };
    mockPrisma.directoryEntry.update.mockResolvedValue(updatedEntry);
    await request(app)
      .put('/api/platform/directory/dir-uuid-1')
      .send({ phone: '555-9999' });
    const updateArgs = mockPrisma.directoryEntry.update.mock.calls[0][0];
    expect(updateArgs.data).toHaveProperty('phone', '555-9999');
    expect(updateArgs.data).not.toHaveProperty('displayName');
    expect(updateArgs.data).not.toHaveProperty('email');
  });

  it('returns updated entry with boardMember flag', async () => {
    const app = buildApp('VIEWER', 3, 'pu-uuid-3', 'BOARD_MEMBER');
    mockPrisma.directoryEntry.findUnique.mockResolvedValue(sampleBoardMemberEntry);
    const updatedEntry = {
      ...sampleBoardMemberEntry,
      displayName: 'Carol White Updated',
      user: { id: 'pu-uuid-3', role: 'BOARD_MEMBER', unitNumber: '3C' },
    };
    mockPrisma.directoryEntry.update.mockResolvedValue(updatedEntry);
    const res = await request(app)
      .put('/api/platform/directory/dir-uuid-3')
      .send({ displayName: 'Carol White Updated' });
    expect(res.status).toBe(200);
    expect(res.body.boardMember).toBe(true);
  });

  it('updates the correct entry by id', async () => {
    const app = buildApp('VIEWER', 1, 'pu-uuid-1', 'RESIDENT');
    mockPrisma.directoryEntry.findUnique.mockResolvedValue(sampleDirectoryEntry);
    mockPrisma.directoryEntry.update.mockResolvedValue({
      ...sampleDirectoryEntry,
      user: { id: 'pu-uuid-1', role: 'RESIDENT', unitNumber: '1A' },
    });
    await request(app)
      .put('/api/platform/directory/dir-uuid-1')
      .send({ title: 'New Title' });
    const updateArgs = mockPrisma.directoryEntry.update.mock.calls[0][0];
    expect(updateArgs.where).toMatchObject({ id: 'dir-uuid-1' });
  });

  it('allows BOARD_MEMBER to update own entry', async () => {
    const app = buildApp('VIEWER', 3, 'pu-uuid-3', 'BOARD_MEMBER');
    mockPrisma.directoryEntry.findUnique.mockResolvedValue(sampleBoardMemberEntry);
    mockPrisma.directoryEntry.update.mockResolvedValue({
      ...sampleBoardMemberEntry,
      user: { id: 'pu-uuid-3', role: 'BOARD_MEMBER', unitNumber: '3C' },
    });
    const res = await request(app)
      .put('/api/platform/directory/dir-uuid-3')
      .send({ phone: '555-0200' });
    expect(res.status).toBe(200);
  });
});
