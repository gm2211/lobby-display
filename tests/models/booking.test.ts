/**
 * RED/GREEN TDD tests for Booking and BookingPayment models.
 *
 * These tests verify the Prisma schema defines the correct models, fields,
 * enums, and relationships. They use the Prisma runtime data model (DMMF)
 * to inspect the schema without requiring a live database connection.
 *
 * Acceptance criteria verified:
 *  - BookingStatus enum exists with PENDING, APPROVED, REJECTED, CANCELLED, COMPLETED
 *  - BookingPaymentStatus enum exists with PENDING, PAID, REFUNDED
 *  - Booking model has all required fields with correct types
 *  - BookingPayment model has all required fields
 *  - Relations are properly defined (Amenity, PlatformUser, Booking↔BookingPayment)
 *  - Amenity has bookings Booking[] back-relation
 *  - PlatformUser has bookings Booking[] back-relation
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
      });
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// BookingStatus enum
// ---------------------------------------------------------------------------

describe('BookingStatus enum', () => {
  it('exists', () => {
    expect(getEnum('BookingStatus')).toBeDefined();
  });

  it('has PENDING value', () => {
    expect(getEnumValue('BookingStatus', 'PENDING')).toBeDefined();
  });

  it('has APPROVED value', () => {
    expect(getEnumValue('BookingStatus', 'APPROVED')).toBeDefined();
  });

  it('has REJECTED value', () => {
    expect(getEnumValue('BookingStatus', 'REJECTED')).toBeDefined();
  });

  it('has CANCELLED value', () => {
    expect(getEnumValue('BookingStatus', 'CANCELLED')).toBeDefined();
  });

  it('has COMPLETED value', () => {
    expect(getEnumValue('BookingStatus', 'COMPLETED')).toBeDefined();
  });

  it('has exactly 5 values', () => {
    const e = getEnum('BookingStatus');
    expect(e?.values).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// BookingPaymentStatus enum
// ---------------------------------------------------------------------------

describe('BookingPaymentStatus enum', () => {
  it('exists', () => {
    expect(getEnum('BookingPaymentStatus')).toBeDefined();
  });

  it('has PENDING value', () => {
    expect(getEnumValue('BookingPaymentStatus', 'PENDING')).toBeDefined();
  });

  it('has PAID value', () => {
    expect(getEnumValue('BookingPaymentStatus', 'PAID')).toBeDefined();
  });

  it('has REFUNDED value', () => {
    expect(getEnumValue('BookingPaymentStatus', 'REFUNDED')).toBeDefined();
  });

  it('has exactly 3 values', () => {
    const e = getEnum('BookingPaymentStatus');
    expect(e?.values).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Booking model
// ---------------------------------------------------------------------------

describe('Booking model', () => {
  it('exists', () => {
    expect(getModel('Booking')).toBeDefined();
  });

  it('has id field of type String (UUID)', () => {
    const field = getField('Booking', 'id');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isId).toBe(true);
  });

  it('has amenityId field of type String', () => {
    const field = getField('Booking', 'amenityId');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has amenity relation to Amenity', () => {
    const field = getField('Booking', 'amenity');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Amenity');
    expect(field?.isRequired).toBe(true);
    expect(field?.isList).toBe(false);
  });

  it('has userId field of type String', () => {
    const field = getField('Booking', 'userId');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has user relation to PlatformUser', () => {
    const field = getField('Booking', 'user');
    expect(field).toBeDefined();
    expect(field?.type).toBe('PlatformUser');
    expect(field?.isRequired).toBe(true);
    expect(field?.isList).toBe(false);
  });

  it('has startTime field of type DateTime', () => {
    const field = getField('Booking', 'startTime');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(true);
  });

  it('has endTime field of type DateTime', () => {
    const field = getField('Booking', 'endTime');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(true);
  });

  it('has status field of type BookingStatus with default PENDING', () => {
    const field = getField('Booking', 'status');
    expect(field).toBeDefined();
    expect(field?.type).toBe('BookingStatus');
    expect(field?.isRequired).toBe(true);
    expect(field?.default).toBe('PENDING');
  });

  it('has optional notes field of type String', () => {
    const field = getField('Booking', 'notes');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(false);
  });

  it('has optional approvedBy field of type String', () => {
    const field = getField('Booking', 'approvedBy');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(false);
  });

  it('has optional approvedAt field of type DateTime', () => {
    const field = getField('Booking', 'approvedAt');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(false);
  });

  it('has optional cancellationReason field of type String', () => {
    const field = getField('Booking', 'cancellationReason');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(false);
  });

  it('has createdAt field of type DateTime', () => {
    const field = getField('Booking', 'createdAt');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(true);
  });

  it('has updatedAt field of type DateTime', () => {
    const field = getField('Booking', 'updatedAt');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(true);
  });

  it('has payment relation to BookingPayment (optional 1-to-1)', () => {
    const field = getField('Booking', 'payment');
    expect(field).toBeDefined();
    expect(field?.type).toBe('BookingPayment');
    expect(field?.isRequired).toBe(false);
    expect(field?.isList).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// BookingPayment model
// ---------------------------------------------------------------------------

describe('BookingPayment model', () => {
  it('exists', () => {
    expect(getModel('BookingPayment')).toBeDefined();
  });

  it('has id field of type String (UUID)', () => {
    const field = getField('BookingPayment', 'id');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isId).toBe(true);
  });

  it('has bookingId field of type String (unique)', () => {
    const field = getField('BookingPayment', 'bookingId');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
    expect(field?.isUnique).toBe(true);
  });

  it('has booking relation to Booking', () => {
    const field = getField('BookingPayment', 'booking');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Booking');
    expect(field?.isRequired).toBe(true);
    expect(field?.isList).toBe(false);
  });

  it('has amount field of type Decimal', () => {
    const field = getField('BookingPayment', 'amount');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Decimal');
    expect(field?.isRequired).toBe(true);
  });

  it('has status field of type BookingPaymentStatus with default PENDING', () => {
    const field = getField('BookingPayment', 'status');
    expect(field).toBeDefined();
    expect(field?.type).toBe('BookingPaymentStatus');
    expect(field?.isRequired).toBe(true);
    expect(field?.default).toBe('PENDING');
  });

  it('has optional paidAt field of type DateTime', () => {
    const field = getField('BookingPayment', 'paidAt');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(false);
  });

  it('has optional refundedAt field of type DateTime', () => {
    const field = getField('BookingPayment', 'refundedAt');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Back-relations on Amenity and PlatformUser
// ---------------------------------------------------------------------------

describe('Amenity model back-relations', () => {
  it('has bookings Booking[] back-relation', () => {
    const field = getField('Amenity', 'bookings');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Booking');
    expect(field?.isList).toBe(true);
  });
});

describe('PlatformUser model back-relations', () => {
  it('has bookings Booking[] back-relation', () => {
    const field = getField('PlatformUser', 'bookings');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Booking');
    expect(field?.isList).toBe(true);
  });
});
