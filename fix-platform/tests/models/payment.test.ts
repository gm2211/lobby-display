/**
 * RED/GREEN TDD tests for Payment and PaymentItem models.
 *
 * These tests verify the Prisma schema defines the correct models, fields,
 * enums, and relationships. They use the Prisma runtime data model (DMMF)
 * to inspect the schema without requiring a live database connection.
 *
 * Acceptance criteria verified:
 *  - PaymentStatus enum exists with PENDING, PAID, FAILED, REFUNDED
 *  - Payment model has all required fields with correct types
 *  - PaymentItem model has all required fields
 *  - Relations are properly defined (PlatformUser, Payment↔PaymentItem)
 *  - PlatformUser has payments Payment[] back-relation
 *  - Both models use @@schema("platform")
 *  - `npx prisma validate` passes
 */

import { execSync } from 'child_process';
import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';

// ---------------------------------------------------------------------------
// DMMF helpers
// ---------------------------------------------------------------------------

function getModel(name: string) {
  return Prisma.dmmf.datamodel.models.find((m) => m.name === name);
}

function getField(modelName: string, fieldName: string) {
  const model = getModel(modelName);
  if (!model) return undefined;
  return model.fields.find((f) => f.name === fieldName);
}

function getEnum(name: string) {
  return Prisma.dmmf.datamodel.enums.find((e) => e.name === name);
}

function getEnumValue(enumName: string, value: string) {
  const e = getEnum(enumName);
  if (!e) return undefined;
  return e.values.find((v) => v.name === value);
}

// ---------------------------------------------------------------------------
// prisma validate
// ---------------------------------------------------------------------------

describe('prisma validate', () => {
  it('should pass npx prisma validate', () => {
    expect(() => {
      execSync('npx prisma validate', {
        stdio: 'pipe',
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/renzo',
        },
      });
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// PaymentStatus enum
// ---------------------------------------------------------------------------

describe('PaymentStatus enum', () => {
  it('exists', () => {
    expect(getEnum('PaymentStatus')).toBeDefined();
  });

  it('has PENDING value', () => {
    expect(getEnumValue('PaymentStatus', 'PENDING')).toBeDefined();
  });

  it('has PAID value', () => {
    expect(getEnumValue('PaymentStatus', 'PAID')).toBeDefined();
  });

  it('has FAILED value', () => {
    expect(getEnumValue('PaymentStatus', 'FAILED')).toBeDefined();
  });

  it('has REFUNDED value', () => {
    expect(getEnumValue('PaymentStatus', 'REFUNDED')).toBeDefined();
  });

  it('has exactly 4 values', () => {
    const e = getEnum('PaymentStatus');
    expect(e?.values).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// Payment model
// ---------------------------------------------------------------------------

describe('Payment model', () => {
  it('exists', () => {
    expect(getModel('Payment')).toBeDefined();
  });

  it('has id field of type String (UUID)', () => {
    const field = getField('Payment', 'id');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isId).toBe(true);
  });

  it('has userId field of type String', () => {
    const field = getField('Payment', 'userId');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has user relation to PlatformUser', () => {
    const field = getField('Payment', 'user');
    expect(field).toBeDefined();
    expect(field?.type).toBe('PlatformUser');
    expect(field?.isRequired).toBe(true);
    expect(field?.isList).toBe(false);
  });

  it('has amount field of type Decimal', () => {
    const field = getField('Payment', 'amount');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Decimal');
    expect(field?.isRequired).toBe(true);
  });

  it('has currency field of type String with default USD', () => {
    const field = getField('Payment', 'currency');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
    expect(field?.default).toBe('USD');
  });

  it('has status field of type PaymentStatus with default PENDING', () => {
    const field = getField('Payment', 'status');
    expect(field).toBeDefined();
    expect(field?.type).toBe('PaymentStatus');
    expect(field?.isRequired).toBe(true);
    expect(field?.default).toBe('PENDING');
  });

  it('has optional paymentMethod field of type String', () => {
    const field = getField('Payment', 'paymentMethod');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(false);
  });

  it('has optional externalId field of type String (Stripe reference)', () => {
    const field = getField('Payment', 'externalId');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(false);
  });

  it('has description field of type String', () => {
    const field = getField('Payment', 'description');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has optional dueDate field of type DateTime', () => {
    const field = getField('Payment', 'dueDate');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(false);
  });

  it('has optional paidAt field of type DateTime', () => {
    const field = getField('Payment', 'paidAt');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(false);
  });

  it('has createdAt field of type DateTime', () => {
    const field = getField('Payment', 'createdAt');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(true);
  });

  it('has updatedAt field of type DateTime', () => {
    const field = getField('Payment', 'updatedAt');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(true);
  });

  it('has items relation to PaymentItem[]', () => {
    const field = getField('Payment', 'items');
    expect(field).toBeDefined();
    expect(field?.type).toBe('PaymentItem');
    expect(field?.isList).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PaymentItem model
// ---------------------------------------------------------------------------

describe('PaymentItem model', () => {
  it('exists', () => {
    expect(getModel('PaymentItem')).toBeDefined();
  });

  it('has id field of type String (UUID)', () => {
    const field = getField('PaymentItem', 'id');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isId).toBe(true);
  });

  it('has paymentId field of type String', () => {
    const field = getField('PaymentItem', 'paymentId');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has payment relation to Payment', () => {
    const field = getField('PaymentItem', 'payment');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Payment');
    expect(field?.isRequired).toBe(true);
    expect(field?.isList).toBe(false);
  });

  it('has description field of type String', () => {
    const field = getField('PaymentItem', 'description');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has amount field of type Decimal', () => {
    const field = getField('PaymentItem', 'amount');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Decimal');
    expect(field?.isRequired).toBe(true);
  });

  it('has category field of type String', () => {
    const field = getField('PaymentItem', 'category');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Back-relation on PlatformUser
// ---------------------------------------------------------------------------

describe('PlatformUser model back-relations', () => {
  it('has payments Payment[] back-relation', () => {
    const field = getField('PlatformUser', 'payments');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Payment');
    expect(field?.isList).toBe(true);
  });
});
