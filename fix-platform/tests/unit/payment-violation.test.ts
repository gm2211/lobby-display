/**
 * Unit tests for paymentViolation service.
 * Uses vi.mock() to mock Prisma — no real DB needed.
 *
 * RED phase: These tests are written before implementation.
 *
 * The service links Payment and Violation records:
 * - createViolationFine: auto-creates a Payment + PaymentItem for a violation fine
 * - onPaymentComplete: updates violation status to RESOLVED when payment is PAID
 * - getViolationPayments: lists all payments linked to a violation
 * - getPaymentViolation: gets the violation linked to a payment (if any)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma before importing the service
vi.mock('../../server/db.js', () => ({
  default: {
    violation: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    payment: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    paymentItem: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import prisma from '../../server/db.js';
import {
  createViolationFine,
  onPaymentComplete,
  getViolationPayments,
  getPaymentViolation,
} from '../../server/services/paymentViolation.js';

const mockPrisma = prisma as {
  violation: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  payment: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  paymentItem: {
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── createViolationFine ─────────────────────────────────────────────────────

describe('createViolationFine', () => {
  const mockViolation = {
    id: 'violation-uuid-1',
    reportedBy: 'platform-user-uuid-1',
    unitNumber: '4B',
    category: 'NOISE',
    description: 'Loud music after hours',
    status: 'CONFIRMED',
    severity: 'HIGH',
    fineAmount: '250.00',
    assignedTo: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPayment = {
    id: 'payment-uuid-1',
    userId: 'platform-user-uuid-1',
    amount: '250.00',
    currency: 'USD',
    status: 'PENDING',
    description: 'Fine for violation: Loud music after hours',
    paymentMethod: null,
    externalId: null,
    dueDate: null,
    paidAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [
      {
        id: 'item-uuid-1',
        paymentId: 'payment-uuid-1',
        violationId: 'violation-uuid-1',
        description: 'Fine for violation: Loud music after hours',
        amount: '250.00',
        category: 'violation',
      },
    ],
  };

  it('throws an error if violation is not found', async () => {
    mockPrisma.violation.findUnique.mockResolvedValue(null);

    await expect(
      createViolationFine('violation-uuid-1', 250, 'Fine for noise violation')
    ).rejects.toThrow('Violation not found');

    expect(mockPrisma.violation.findUnique).toHaveBeenCalledWith({
      where: { id: 'violation-uuid-1' },
    });
  });

  it('creates a Payment with PENDING status', async () => {
    mockPrisma.violation.findUnique.mockResolvedValue(mockViolation);
    mockPrisma.payment.create.mockResolvedValue(mockPayment);

    const result = await createViolationFine(
      'violation-uuid-1',
      250,
      'Fine for noise violation'
    );

    expect(mockPrisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: mockViolation.reportedBy,
          amount: 250,
          status: 'PENDING',
          description: 'Fine for noise violation',
        }),
      })
    );
    expect(result).toBe(mockPayment);
  });

  it('creates a PaymentItem with category "violation" referencing violationId', async () => {
    mockPrisma.violation.findUnique.mockResolvedValue(mockViolation);
    mockPrisma.payment.create.mockResolvedValue(mockPayment);

    await createViolationFine('violation-uuid-1', 250, 'Fine for noise violation');

    const createCall = mockPrisma.payment.create.mock.calls[0][0];
    expect(createCall.data.items).toBeDefined();
    expect(createCall.data.items.create).toEqual(
      expect.objectContaining({
        violationId: 'violation-uuid-1',
        category: 'violation',
        amount: 250,
      })
    );
  });

  it('includes items in the returned payment', async () => {
    mockPrisma.violation.findUnique.mockResolvedValue(mockViolation);
    mockPrisma.payment.create.mockResolvedValue(mockPayment);

    await createViolationFine('violation-uuid-1', 250, 'Fine for noise violation');

    const createCall = mockPrisma.payment.create.mock.calls[0][0];
    expect(createCall.include).toEqual({ items: true });
  });

  it('sets currency to USD by default', async () => {
    mockPrisma.violation.findUnique.mockResolvedValue(mockViolation);
    mockPrisma.payment.create.mockResolvedValue(mockPayment);

    await createViolationFine('violation-uuid-1', 250, 'Fine for noise violation');

    const createCall = mockPrisma.payment.create.mock.calls[0][0];
    expect(createCall.data.currency).toBe('USD');
  });

  it('returns the created payment', async () => {
    mockPrisma.violation.findUnique.mockResolvedValue(mockViolation);
    mockPrisma.payment.create.mockResolvedValue(mockPayment);

    const result = await createViolationFine('violation-uuid-1', 250, 'Fine');
    expect(result).toBe(mockPayment);
  });
});

// ─── onPaymentComplete ───────────────────────────────────────────────────────

describe('onPaymentComplete', () => {
  it('throws an error if payment is not found', async () => {
    mockPrisma.payment.findUnique.mockResolvedValue(null);

    await expect(
      onPaymentComplete('payment-uuid-1')
    ).rejects.toThrow('Payment not found');
  });

  it('does nothing when payment has no violation-linked items', async () => {
    const mockPayment = {
      id: 'payment-uuid-1',
      status: 'PAID',
      items: [
        { id: 'item-1', category: 'maintenance', violationId: null },
      ],
    };
    mockPrisma.payment.findUnique.mockResolvedValue(mockPayment);

    await onPaymentComplete('payment-uuid-1');

    expect(mockPrisma.violation.update).not.toHaveBeenCalled();
  });

  it('updates violation status to RESOLVED when payment has violation-linked items', async () => {
    const mockPayment = {
      id: 'payment-uuid-1',
      status: 'PAID',
      items: [
        {
          id: 'item-1',
          category: 'violation',
          violationId: 'violation-uuid-1',
          description: 'Fine',
          amount: '250.00',
        },
      ],
    };
    mockPrisma.payment.findUnique.mockResolvedValue(mockPayment);
    mockPrisma.violation.update.mockResolvedValue({
      id: 'violation-uuid-1',
      status: 'RESOLVED',
    });

    await onPaymentComplete('payment-uuid-1');

    expect(mockPrisma.violation.update).toHaveBeenCalledWith({
      where: { id: 'violation-uuid-1' },
      data: { status: 'RESOLVED' },
    });
  });

  it('updates multiple violations if multiple violation-linked items exist', async () => {
    const mockPayment = {
      id: 'payment-uuid-1',
      status: 'PAID',
      items: [
        { id: 'item-1', category: 'violation', violationId: 'violation-uuid-1' },
        { id: 'item-2', category: 'violation', violationId: 'violation-uuid-2' },
      ],
    };
    mockPrisma.payment.findUnique.mockResolvedValue(mockPayment);
    mockPrisma.violation.update.mockResolvedValue({ id: 'any', status: 'RESOLVED' });

    await onPaymentComplete('payment-uuid-1');

    expect(mockPrisma.violation.update).toHaveBeenCalledTimes(2);
    expect(mockPrisma.violation.update).toHaveBeenCalledWith({
      where: { id: 'violation-uuid-1' },
      data: { status: 'RESOLVED' },
    });
    expect(mockPrisma.violation.update).toHaveBeenCalledWith({
      where: { id: 'violation-uuid-2' },
      data: { status: 'RESOLVED' },
    });
  });

  it('fetches payment with items included', async () => {
    const mockPayment = {
      id: 'payment-uuid-1',
      status: 'PAID',
      items: [],
    };
    mockPrisma.payment.findUnique.mockResolvedValue(mockPayment);

    await onPaymentComplete('payment-uuid-1');

    expect(mockPrisma.payment.findUnique).toHaveBeenCalledWith({
      where: { id: 'payment-uuid-1' },
      include: { items: true },
    });
  });

  it('skips items with null violationId even if category is violation', async () => {
    const mockPayment = {
      id: 'payment-uuid-1',
      status: 'PAID',
      items: [
        { id: 'item-1', category: 'violation', violationId: null },
      ],
    };
    mockPrisma.payment.findUnique.mockResolvedValue(mockPayment);

    await onPaymentComplete('payment-uuid-1');

    expect(mockPrisma.violation.update).not.toHaveBeenCalled();
  });
});

// ─── getViolationPayments ────────────────────────────────────────────────────

describe('getViolationPayments', () => {
  it('returns all payments linked to a violation via PaymentItems', async () => {
    const mockItems = [
      {
        id: 'item-1',
        paymentId: 'payment-uuid-1',
        violationId: 'violation-uuid-1',
        category: 'violation',
        payment: {
          id: 'payment-uuid-1',
          status: 'PENDING',
          amount: '250.00',
          description: 'Fine',
          createdAt: new Date(),
        },
      },
    ];
    mockPrisma.paymentItem.findMany.mockResolvedValue(mockItems);

    const result = await getViolationPayments('violation-uuid-1');

    expect(mockPrisma.paymentItem.findMany).toHaveBeenCalledWith({
      where: { violationId: 'violation-uuid-1' },
      include: { payment: true },
    });
    expect(result).toBe(mockItems);
  });

  it('returns empty array when no payments are linked', async () => {
    mockPrisma.paymentItem.findMany.mockResolvedValue([]);

    const result = await getViolationPayments('violation-uuid-nonexistent');

    expect(result).toEqual([]);
  });
});

// ─── getPaymentViolation ─────────────────────────────────────────────────────

describe('getPaymentViolation', () => {
  it('returns the violation linked to a payment', async () => {
    const mockItem = {
      id: 'item-1',
      paymentId: 'payment-uuid-1',
      violationId: 'violation-uuid-1',
      category: 'violation',
      violation: {
        id: 'violation-uuid-1',
        status: 'CONFIRMED',
        category: 'NOISE',
        description: 'Loud music',
      },
    };
    mockPrisma.paymentItem.findMany.mockResolvedValue([mockItem]);

    const result = await getPaymentViolation('payment-uuid-1');

    expect(mockPrisma.paymentItem.findMany).toHaveBeenCalledWith({
      where: {
        paymentId: 'payment-uuid-1',
        violationId: { not: null },
      },
      include: { violation: true },
    });
    expect(result).toBe(mockItem.violation);
  });

  it('returns null when payment has no violation-linked items', async () => {
    mockPrisma.paymentItem.findMany.mockResolvedValue([]);

    const result = await getPaymentViolation('payment-uuid-no-violation');

    expect(result).toBeNull();
  });

  it('returns the first violation when multiple items exist', async () => {
    const mockViolation1 = { id: 'violation-uuid-1', status: 'CONFIRMED' };
    const mockItems = [
      { id: 'item-1', paymentId: 'payment-uuid-1', violationId: 'violation-uuid-1', violation: mockViolation1 },
    ];
    mockPrisma.paymentItem.findMany.mockResolvedValue(mockItems);

    const result = await getPaymentViolation('payment-uuid-1');

    expect(result).toBe(mockViolation1);
  });
});
