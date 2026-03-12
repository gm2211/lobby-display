/**
 * Unit tests for accessCodes service.
 *
 * Tests cover:
 *   - generateAccessCode(): unique 6-char alphanumeric, no ambiguous chars
 *   - generateQRCode(): returns a string (SVG or data URL)
 *   - createVisitorAccessCode(): generates code + QR, updates Visitor record
 *   - validateAccessCode(): looks up visitor by code, checks valid status
 *
 * Uses vi.mock to mock Prisma so no database is needed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma before importing the service
vi.mock('../../server/db.js', () => ({
  default: {
    visitor: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import prisma from '../../server/db.js';
import {
  generateAccessCode,
  generateQRCode,
  createVisitorAccessCode,
  validateAccessCode,
} from '../../server/services/accessCodes.js';

// Type helpers for mocked functions
const mockPrisma = prisma as {
  visitor: {
    findFirst: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── generateAccessCode ───────────────────────────────────────────────────────

describe('generateAccessCode', () => {
  it('returns a string of exactly 6 characters', async () => {
    // No collision - first findFirst returns null
    mockPrisma.visitor.findFirst.mockResolvedValue(null);
    const code = await generateAccessCode();
    expect(typeof code).toBe('string');
    expect(code.length).toBe(6);
  });

  it('only uses uppercase letters and digits (no ambiguous chars)', async () => {
    mockPrisma.visitor.findFirst.mockResolvedValue(null);
    // Generate many codes and check none contain ambiguous chars
    const codes = await Promise.all(
      Array.from({ length: 20 }, () => {
        mockPrisma.visitor.findFirst.mockResolvedValueOnce(null);
        return generateAccessCode();
      })
    );
    const ambiguous = /[0OI1L]/;
    for (const code of codes) {
      expect(code).not.toMatch(ambiguous);
      // Only uppercase alphanumeric
      expect(code).toMatch(/^[A-Z2-9]+$/);
    }
  });

  it('retries when a collision is detected', async () => {
    // First call: collision (code exists), second call: unique
    mockPrisma.visitor.findFirst
      .mockResolvedValueOnce({ id: 'existing-visitor' }) // collision
      .mockResolvedValueOnce(null); // unique

    const code = await generateAccessCode();
    expect(typeof code).toBe('string');
    expect(code.length).toBe(6);
    // findFirst should have been called twice
    expect(mockPrisma.visitor.findFirst).toHaveBeenCalledTimes(2);
  });

  it('checks DB for uniqueness by querying by accessCode', async () => {
    mockPrisma.visitor.findFirst.mockResolvedValue(null);
    await generateAccessCode();
    expect(mockPrisma.visitor.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ accessCode: expect.any(String) }),
      })
    );
  });
});

// ─── generateQRCode ───────────────────────────────────────────────────────────

describe('generateQRCode', () => {
  it('returns a string', async () => {
    const result = await generateQRCode('ABC123');
    expect(typeof result).toBe('string');
  });

  it('returns a non-empty string', async () => {
    const result = await generateQRCode('TEST99');
    expect(result.length).toBeGreaterThan(0);
  });

  it('encodes the data in the output', async () => {
    const data = 'XYZ456';
    const result = await generateQRCode(data);
    // The data should appear somewhere in the SVG or be encoded
    // Either as a direct string or as base64 in a data URL
    const containsData =
      result.includes(data) ||
      result.includes(Buffer.from(data).toString('base64'));
    expect(containsData).toBe(true);
  });

  it('returns SVG string or data URL', async () => {
    const result = await generateQRCode('HELLO1');
    const isSvg = result.includes('<svg') || result.startsWith('data:image/svg');
    const isDataUrl = result.startsWith('data:');
    expect(isSvg || isDataUrl).toBe(true);
  });

  it('handles different inputs', async () => {
    const r1 = await generateQRCode('CODE11');
    const r2 = await generateQRCode('CODE22');
    // Different inputs should produce different outputs
    expect(r1).not.toBe(r2);
  });
});

// ─── createVisitorAccessCode ──────────────────────────────────────────────────

describe('createVisitorAccessCode', () => {
  const mockVisitor = {
    id: 'visitor-uuid-123',
    hostId: 'host-uuid-456',
    guestName: 'John Doe',
    guestEmail: 'john@example.com',
    guestPhone: null,
    purpose: 'Visit',
    expectedDate: new Date('2025-01-15T10:00:00.000Z'),
    accessCode: 'ABC123',
    status: 'EXPECTED',
    notes: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  };

  it('returns an object with code and qrDataUrl', async () => {
    mockPrisma.visitor.findFirst.mockResolvedValue(null); // no collision
    mockPrisma.visitor.update.mockResolvedValue({
      ...mockVisitor,
      accessCode: 'NEWCOD',
    });

    const result = await createVisitorAccessCode('visitor-uuid-123');
    expect(result).toHaveProperty('code');
    expect(result).toHaveProperty('qrDataUrl');
  });

  it('code is a 6-character alphanumeric string', async () => {
    mockPrisma.visitor.findFirst.mockResolvedValue(null);
    mockPrisma.visitor.update.mockResolvedValue(mockVisitor);

    const result = await createVisitorAccessCode('visitor-uuid-123');
    expect(typeof result.code).toBe('string');
    expect(result.code.length).toBe(6);
    expect(result.code).toMatch(/^[A-Z2-9]+$/);
  });

  it('qrDataUrl is a non-empty string', async () => {
    mockPrisma.visitor.findFirst.mockResolvedValue(null);
    mockPrisma.visitor.update.mockResolvedValue(mockVisitor);

    const result = await createVisitorAccessCode('visitor-uuid-123');
    expect(typeof result.qrDataUrl).toBe('string');
    expect(result.qrDataUrl.length).toBeGreaterThan(0);
  });

  it('updates the visitor record with the generated access code', async () => {
    mockPrisma.visitor.findFirst.mockResolvedValue(null);
    mockPrisma.visitor.update.mockResolvedValue(mockVisitor);

    await createVisitorAccessCode('visitor-uuid-123');

    expect(mockPrisma.visitor.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'visitor-uuid-123' },
        data: expect.objectContaining({ accessCode: expect.any(String) }),
      })
    );
  });

  it('the QR code encodes the access code', async () => {
    mockPrisma.visitor.findFirst.mockResolvedValue(null);
    mockPrisma.visitor.update.mockResolvedValue(mockVisitor);

    const result = await createVisitorAccessCode('visitor-uuid-123');
    // The QR data URL should encode the code somewhere
    const containsCode =
      result.qrDataUrl.includes(result.code) ||
      result.qrDataUrl.includes(Buffer.from(result.code).toString('base64'));
    expect(containsCode).toBe(true);
  });
});

// ─── validateAccessCode ───────────────────────────────────────────────────────

describe('validateAccessCode', () => {
  const expectedVisitor = {
    id: 'visitor-uuid-123',
    hostId: 'host-uuid-456',
    guestName: 'John Doe',
    guestEmail: 'john@example.com',
    guestPhone: null,
    purpose: 'Visit',
    expectedDate: new Date('2025-01-15T10:00:00.000Z'),
    accessCode: 'ABC123',
    status: 'EXPECTED',
    notes: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  };

  it('returns the visitor when found with EXPECTED status', async () => {
    mockPrisma.visitor.findFirst.mockResolvedValue(expectedVisitor);

    const result = await validateAccessCode('ABC123');
    expect(result).toEqual(expectedVisitor);
  });

  it('returns the visitor when found with CHECKED_IN status', async () => {
    const checkedInVisitor = { ...expectedVisitor, status: 'CHECKED_IN' };
    mockPrisma.visitor.findFirst.mockResolvedValue(checkedInVisitor);

    const result = await validateAccessCode('ABC123');
    expect(result).toEqual(checkedInVisitor);
  });

  it('returns null when visitor is not found', async () => {
    mockPrisma.visitor.findFirst.mockResolvedValue(null);

    const result = await validateAccessCode('NOTFOUND');
    expect(result).toBeNull();
  });

  it('returns null when visitor status is CANCELLED', async () => {
    mockPrisma.visitor.findFirst.mockResolvedValue(null); // query excludes CANCELLED

    const result = await validateAccessCode('ABC123');
    expect(result).toBeNull();
  });

  it('returns null when visitor status is CHECKED_OUT', async () => {
    mockPrisma.visitor.findFirst.mockResolvedValue(null); // query excludes CHECKED_OUT

    const result = await validateAccessCode('ABC123');
    expect(result).toBeNull();
  });

  it('queries by accessCode', async () => {
    mockPrisma.visitor.findFirst.mockResolvedValue(null);

    await validateAccessCode('XYZ789');
    expect(mockPrisma.visitor.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ accessCode: 'XYZ789' }),
      })
    );
  });

  it('excludes CANCELLED and CHECKED_OUT from the query', async () => {
    mockPrisma.visitor.findFirst.mockResolvedValue(null);

    await validateAccessCode('CODE12');
    const callArgs = mockPrisma.visitor.findFirst.mock.calls[0][0];
    // The status filter should exclude CANCELLED and CHECKED_OUT
    expect(callArgs.where.status).toBeDefined();
    // Status should be a filter for valid statuses (in: ['EXPECTED', 'CHECKED_IN'])
    // or notIn: ['CANCELLED', 'CHECKED_OUT']
    const statusFilter = callArgs.where.status;
    const hasValidFilter =
      (statusFilter.in &&
        statusFilter.in.includes('EXPECTED') &&
        statusFilter.in.includes('CHECKED_IN') &&
        !statusFilter.in.includes('CANCELLED') &&
        !statusFilter.in.includes('CHECKED_OUT')) ||
      (statusFilter.notIn &&
        statusFilter.notIn.includes('CANCELLED') &&
        statusFilter.notIn.includes('CHECKED_OUT'));
    expect(hasValidFilter).toBe(true);
  });

  it('returns the full visitor record when valid', async () => {
    mockPrisma.visitor.findFirst.mockResolvedValue(expectedVisitor);

    const result = await validateAccessCode('ABC123');
    expect(result?.id).toBe('visitor-uuid-123');
    expect(result?.guestName).toBe('John Doe');
    expect(result?.accessCode).toBe('ABC123');
  });
});
