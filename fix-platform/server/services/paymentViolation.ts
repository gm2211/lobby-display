/**
 * paymentViolation service — links Payment and Violation records.
 *
 * Functions:
 * - createViolationFine: when a violation has a fine, auto-create a Payment
 *   record linked to the violation via a PaymentItem with violationId.
 * - onPaymentComplete: when payment is marked PAID, check if it's linked to
 *   a violation and update violation status to RESOLVED.
 * - getViolationPayments: get all payments linked to a violation.
 * - getPaymentViolation: get the violation linked to a payment (if any).
 *
 * RELATED FILES:
 * - prisma/schema.prisma           - Payment, PaymentItem (with violationId), Violation models
 * - server/routes/platform/payments.ts   - Payment API routes
 * - server/routes/platform/violations.ts - Violation API routes
 */
import prisma from '../db.js';

/**
 * createViolationFine
 * Auto-create a Payment record linked to a violation when a fine is assessed.
 * Creates a Payment with status PENDING and a PaymentItem referencing the violation.
 */
export async function createViolationFine(
  violationId: string,
  amount: number,
  description: string,
) {
  const violation = await prisma.violation.findUnique({
    where: { id: violationId },
  });

  if (!violation) {
    throw new Error('Violation not found');
  }

  const payment = await prisma.payment.create({
    data: {
      userId: violation.reportedBy,
      amount,
      currency: 'USD',
      status: 'PENDING',
      description,
      items: {
        create: {
          violationId,
          description,
          amount,
          category: 'violation',
        },
      },
    },
    include: { items: true },
  });

  return payment;
}

/**
 * onPaymentComplete
 * When a payment is marked PAID, check if it's linked to any violations
 * via PaymentItems. If so, update those violations' status to RESOLVED.
 */
export async function onPaymentComplete(paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { items: true },
  });

  if (!payment) {
    throw new Error('Payment not found');
  }

  const violationItems = payment.items.filter(
    (item: { violationId: string | null }) => item.violationId !== null,
  );

  for (const item of violationItems) {
    await prisma.violation.update({
      where: { id: item.violationId as string },
      data: { status: 'RESOLVED' },
    });
  }
}

/**
 * getViolationPayments
 * Get all payments linked to a violation via PaymentItems.
 * Returns PaymentItem records with their associated Payment included.
 */
export async function getViolationPayments(violationId: string) {
  return prisma.paymentItem.findMany({
    where: { violationId },
    include: { payment: true },
  });
}

/**
 * getPaymentViolation
 * Get the violation linked to a payment (if any).
 * Returns the first Violation associated with a violation-linked PaymentItem,
 * or null if the payment has no violation-linked items.
 */
export async function getPaymentViolation(paymentId: string) {
  const items = await prisma.paymentItem.findMany({
    where: {
      paymentId,
      violationId: { not: null },
    },
    include: { violation: true },
  });

  if (items.length === 0) {
    return null;
  }

  return items[0].violation;
}
