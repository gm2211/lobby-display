import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import type { PlatformRole } from '@prisma/client';

// Mock the prisma db module before importing the middleware
vi.mock('../../server/db.js', () => ({
  default: {
    platformUser: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

// Import after mocking
import {
  platformProtect,
  platformProtectStrict,
  requirePlatformRole,
  getOrCreatePlatformUser,
} from '../../server/middleware/platformAuth.js';
import prisma from '../../server/db.js';

const mockPrisma = prisma as {
  platformUser: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
};

function makeReq(overrides: Record<string, unknown> = {}): Request {
  return {
    session: {},
    ...overrides,
  } as unknown as Request;
}

function makeRes(): Response {
  return {} as Response;
}

function makeNext(): NextFunction {
  return vi.fn() as NextFunction;
}

describe('platformProtect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when there is no session user', async () => {
    const req = makeReq({ session: {} });
    const res = makeRes();
    const next = makeNext();

    await platformProtect(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(err).toBeDefined();
    expect(err.status).toBe(401);
  });
});

describe('platformProtectStrict', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when there is no session user', async () => {
    const req = makeReq({ session: {} });
    const res = makeRes();
    const next = makeNext();

    await platformProtectStrict(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(err).toBeDefined();
    expect(err.status).toBe(401);
  });

  it('returns 403 when VIEWER has no PlatformUser record', async () => {
    const req = makeReq({
      session: { user: { id: 42, username: 'alice', role: 'VIEWER' } },
    });
    const res = makeRes();
    const next = makeNext();

    mockPrisma.platformUser.findUnique.mockResolvedValue(null);

    await platformProtectStrict(req, res, next);

    expect(mockPrisma.platformUser.findUnique).toHaveBeenCalledWith({
      where: { userId: 42 },
    });
    expect(next).toHaveBeenCalledOnce();
    const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(err).toBeDefined();
    expect(err.status).toBe(403);
  });

  it('auto-provisions PlatformUser for ADMIN without existing record', async () => {
    const req = makeReq({
      session: { user: { id: 1, username: 'admin', role: 'ADMIN' } },
    });
    const res = makeRes();
    const next = makeNext();

    const createdUser = {
      id: 'uuid-1',
      userId: 1,
      unitNumber: null,
      role: 'MANAGER' as PlatformRole,
      phone: null,
      moveInDate: null,
      emergencyContact: null,
      preferences: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockPrisma.platformUser.findUnique.mockResolvedValue(null);
    mockPrisma.platformUser.create.mockResolvedValue(createdUser);

    await platformProtectStrict(req, res, next);

    expect(mockPrisma.platformUser.create).toHaveBeenCalledWith({
      data: { userId: 1, role: 'MANAGER' },
    });
    expect((req as any).platformUser).toEqual(createdUser);
    expect(next).toHaveBeenCalledOnce();
    expect((next as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBeUndefined();
  });

  it('auto-provisions PlatformUser for EDITOR without existing record', async () => {
    const req = makeReq({
      session: { user: { id: 5, username: 'editor', role: 'EDITOR' } },
    });
    const res = makeRes();
    const next = makeNext();

    const createdUser = {
      id: 'uuid-5',
      userId: 5,
      unitNumber: null,
      role: 'MANAGER' as PlatformRole,
      phone: null,
      moveInDate: null,
      emergencyContact: null,
      preferences: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockPrisma.platformUser.findUnique.mockResolvedValue(null);
    mockPrisma.platformUser.create.mockResolvedValue(createdUser);

    await platformProtectStrict(req, res, next);

    expect(mockPrisma.platformUser.create).toHaveBeenCalledWith({
      data: { userId: 5, role: 'MANAGER' },
    });
    expect((req as any).platformUser).toEqual(createdUser);
    expect(next).toHaveBeenCalledOnce();
    expect((next as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBeUndefined();
  });

  it('attaches existing platformUser to request and calls next()', async () => {
    const req = makeReq({
      session: { user: { id: 7, username: 'bob', role: 'EDITOR' } },
    });
    const res = makeRes();
    const next = makeNext();

    const platformUserRecord = {
      id: 'uuid-7',
      userId: 7,
      unitNumber: '12A',
      role: 'RESIDENT' as PlatformRole,
      phone: null,
      moveInDate: null,
      emergencyContact: null,
      preferences: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockPrisma.platformUser.findUnique.mockResolvedValue(platformUserRecord);

    await platformProtectStrict(req, res, next);

    expect((req as unknown as { platformUser: unknown }).platformUser).toEqual(platformUserRecord);
    expect(next).toHaveBeenCalledOnce();
    expect((next as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBeUndefined();
    // Should NOT call create when existing record is found
    expect(mockPrisma.platformUser.create).not.toHaveBeenCalled();
  });
});

describe('getOrCreatePlatformUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns existing PlatformUser if found', async () => {
    const existing = {
      id: 'uuid-10',
      userId: 10,
      role: 'RESIDENT' as PlatformRole,
    };
    mockPrisma.platformUser.findUnique.mockResolvedValue(existing);

    const result = await getOrCreatePlatformUser(10, 'ADMIN');

    expect(result).toEqual(existing);
    expect(mockPrisma.platformUser.create).not.toHaveBeenCalled();
  });

  it('auto-provisions for ADMIN when no record exists', async () => {
    const created = {
      id: 'uuid-new',
      userId: 20,
      role: 'MANAGER' as PlatformRole,
    };
    mockPrisma.platformUser.findUnique.mockResolvedValue(null);
    mockPrisma.platformUser.create.mockResolvedValue(created);

    const result = await getOrCreatePlatformUser(20, 'ADMIN');

    expect(mockPrisma.platformUser.create).toHaveBeenCalledWith({
      data: { userId: 20, role: 'MANAGER' },
    });
    expect(result).toEqual(created);
  });

  it('auto-provisions for EDITOR when no record exists', async () => {
    const created = {
      id: 'uuid-new2',
      userId: 30,
      role: 'MANAGER' as PlatformRole,
    };
    mockPrisma.platformUser.findUnique.mockResolvedValue(null);
    mockPrisma.platformUser.create.mockResolvedValue(created);

    const result = await getOrCreatePlatformUser(30, 'EDITOR');

    expect(mockPrisma.platformUser.create).toHaveBeenCalledWith({
      data: { userId: 30, role: 'MANAGER' },
    });
    expect(result).toEqual(created);
  });

  it('returns null for VIEWER when no record exists (no auto-provision)', async () => {
    mockPrisma.platformUser.findUnique.mockResolvedValue(null);

    const result = await getOrCreatePlatformUser(40, 'VIEWER');

    expect(result).toBeNull();
    expect(mockPrisma.platformUser.create).not.toHaveBeenCalled();
  });
});

describe('requirePlatformRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls next() when the platformUser has an allowed role', () => {
    const req = makeReq({
      platformUser: { id: 1, userId: 7, role: 'MANAGER' as PlatformRole },
    });
    const res = makeRes();
    const next = makeNext();

    requirePlatformRole('MANAGER', 'BOARD_MEMBER')(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect((next as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBeUndefined();
  });

  it('returns 403 when the platformUser has a disallowed role', () => {
    const req = makeReq({
      platformUser: { id: 1, userId: 7, role: 'RESIDENT' as PlatformRole },
    });
    const res = makeRes();
    const next = makeNext();

    requirePlatformRole('MANAGER', 'BOARD_MEMBER')(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(err).toBeDefined();
    expect(err.status).toBe(403);
  });

  it('returns 401 when platformUser is not attached to request', () => {
    const req = makeReq(); // no platformUser
    const res = makeRes();
    const next = makeNext();

    requirePlatformRole('MANAGER')(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(err).toBeDefined();
    expect(err.status).toBe(401);
  });

  it('allows all listed roles', () => {
    const roles: PlatformRole[] = ['RESIDENT', 'BOARD_MEMBER', 'MANAGER', 'SECURITY', 'CONCIERGE'];
    for (const role of roles) {
      const req = makeReq({
        platformUser: { id: 1, userId: 7, role },
      });
      const res = makeRes();
      const next = makeNext();

      requirePlatformRole(...roles)(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect((next as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBeUndefined();
    }
  });
});
