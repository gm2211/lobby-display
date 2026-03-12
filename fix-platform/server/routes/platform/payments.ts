/**
 * Payments API Routes - Payment management for platform users.
 *
 * ROUTES:
 * - GET /api/payments        - List payments (auth user sees own, EDITOR+ sees all)
 * - GET /api/payments/summary - Payment summary/totals (EDITOR+ only)
 * - GET /api/payments/:id    - Payment detail with items
 * - POST /api/payments       - Create payment/charge (EDITOR+ required)
 * - PUT /api/payments/:id    - Update payment status (EDITOR+ required)
 * - POST /api/payments/webhook - Stripe webhook stub (no auth, returns 200)
 *
 * RELATED FILES:
 * - server/middleware/errorHandler.ts - asyncHandler, validateId, NotFoundError, ValidationError
 * - server/middleware/auth.ts         - requireAuth, requireMinRole
 * - prisma/schema.prisma              - Payment, PaymentItem, PaymentStatus models
 */
import { Router } from 'express';
import {
  asyncHandler,
  NotFoundError,
  ValidationError,
} from '../../middleware/errorHandler.js';
import { requireAuth, requireMinRole, ROLE_LEVEL } from '../../middleware/auth.js';
import { AuthorizationError } from '../../middleware/auth.js';
import prisma from '../../db.js';

const router = Router();

const VALID_STATUSES = ['PENDING', 'PAID', 'FAILED', 'REFUNDED'] as const;
type PaymentStatus = typeof VALID_STATUSES[number];

function validateStatus(status: string): PaymentStatus {
  if (!(VALID_STATUSES as readonly string[]).includes(status)) {
    throw new ValidationError(
      `Invalid status: '${status}'. Must be one of: ${VALID_STATUSES.join(', ')}`
    );
  }
  return status as PaymentStatus;
}

/**
 * POST /api/payments/webhook
 * Stripe webhook stub — no auth required, always returns 200.
 * Must be registered BEFORE /:id to avoid being captured by the id route.
 * NOTE: In production, this route is pre-empted by app.ts before CSRF middleware.
 * In unit tests, callers must supply a valid CSRF token if authenticated.
 */
router.post('/webhook', (req, res) => {
  // Stub: log the event type and acknowledge receipt
  const eventType = req.body?.type ?? 'unknown';
  console.log(`[Payments webhook] Received event: ${eventType}`);
  res.json({ received: true });
});

/**
 * GET /api/payments/summary
 * Returns totals for all payments. EDITOR+ only.
 * Must be registered BEFORE /:id to avoid being captured by the id route.
 */
router.get(
  '/summary',
  requireAuth,
  requireMinRole('EDITOR'),
  asyncHandler(async (_req, res) => {
    const payments = await prisma.payment.findMany({
      select: { amount: true, status: true, currency: true },
    });

    const total = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const paid = payments
      .filter(p => p.status === 'PAID')
      .reduce((sum, p) => sum + Number(p.amount), 0);
    const pending = payments
      .filter(p => p.status === 'PENDING')
      .reduce((sum, p) => sum + Number(p.amount), 0);
    const failed = payments
      .filter(p => p.status === 'FAILED')
      .reduce((sum, p) => sum + Number(p.amount), 0);
    const refunded = payments
      .filter(p => p.status === 'REFUNDED')
      .reduce((sum, p) => sum + Number(p.amount), 0);

    res.json({
      total,
      paid,
      pending,
      failed,
      refunded,
      count: payments.length,
    });
  })
);

/**
 * GET /api/payments
 * List payments.
 * - VIEWER: sees only their own payments (filtered by platformUser.userId = session user id)
 * - EDITOR+: sees all payments
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = req.session.user!;
    const isEditor = (ROLE_LEVEL[user.role] ?? 0) >= (ROLE_LEVEL['EDITOR'] ?? 0);

    // For non-editor users, filter to their own payments via PlatformUser lookup
    let userIdFilter: string | undefined;
    if (!isEditor) {
      const platformUser = await prisma.platformUser.findFirst({ where: { userId: user.id } });
      userIdFilter = platformUser?.id;
    }

    const payments = await prisma.payment.findMany({
      where: userIdFilter !== undefined ? { userId: userIdFilter } : undefined,
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });

    res.json(payments);
  })
);

/**
 * GET /api/payments/:id
 * Payment detail with items.
 * - VIEWER: can only view their own payments
 * - EDITOR+: can view any payment
 *
 * NOTE: Payment IDs are UUIDs — do NOT use validateId() here.
 */
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (!id) throw new ValidationError('id is required');

    const user = req.session.user!;
    const isEditor = (ROLE_LEVEL[user.role] ?? 0) >= (ROLE_LEVEL['EDITOR'] ?? 0);

    const payment = await prisma.payment.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!payment) throw new NotFoundError('Payment not found');

    // VIEWER can only see their own payments — compare via PlatformUser lookup
    if (!isEditor) {
      const platformUser = await prisma.platformUser.findFirst({ where: { userId: user.id } });
      if (!platformUser || payment.userId !== platformUser.id) {
        throw new AuthorizationError('Cannot view another user\'s payment');
      }
    }

    res.json(payment);
  })
);

/**
 * POST /api/payments
 * Create a new payment/charge. EDITOR+ required.
 */
router.post(
  '/',
  requireAuth,
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const { userId, amount, description, currency, paymentMethod, externalId, dueDate, items } = req.body;

    if (userId === undefined || userId === null) {
      throw new ValidationError('userId is required');
    }
    if (amount === undefined || amount === null) {
      throw new ValidationError('amount is required');
    }
    if (!description) {
      throw new ValidationError('description is required');
    }

    // Validate user exists — PlatformUser.id is a UUID string, never use Number()
    const platformUser = await prisma.platformUser.findUnique({ where: { id: String(userId) } });
    if (!platformUser) {
      throw new NotFoundError(`PlatformUser with id ${userId} not found`);
    }

    const payment = await prisma.payment.create({
      data: {
        userId: String(userId),
        amount,
        currency: currency ?? 'USD',
        description,
        paymentMethod: paymentMethod ?? null,
        externalId: externalId ?? null,
        dueDate: dueDate ? new Date(dueDate) : null,
        items: items && Array.isArray(items) && items.length > 0
          ? {
              create: items.map((item: { description: string; amount: number; category: string }) => ({
                description: item.description,
                amount: item.amount,
                category: item.category,
              })),
            }
          : undefined,
      },
      include: { items: true },
    });

    res.status(201).json(payment);
  })
);

/**
 * PUT /api/payments/:id
 * Update payment status. EDITOR+ required.
 */
router.put(
  '/:id',
  requireAuth,
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    // Payment IDs are UUIDs — do NOT use validateId()
    const id = req.params.id;
    if (!id) throw new ValidationError('id is required');
    const { status, paymentMethod, externalId, paidAt } = req.body;

    const existing = await prisma.payment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Payment not found');

    const data: Record<string, unknown> = {};
    if (status !== undefined) {
      const validStatus = validateStatus(status);
      data.status = validStatus;
      // Auto-set paidAt when marking as PAID
      if (validStatus === 'PAID' && !existing.paidAt) {
        data.paidAt = paidAt ? new Date(paidAt) : new Date();
      }
    }
    if (paymentMethod !== undefined) data.paymentMethod = paymentMethod;
    if (externalId !== undefined) data.externalId = externalId;
    if (paidAt !== undefined && data.paidAt === undefined) data.paidAt = new Date(paidAt);

    const updated = await prisma.payment.update({
      where: { id },
      data,
      include: { items: true },
    });

    res.json(updated);
  })
);

export default router;
