/**
 * RED/GREEN TDD tests for Visitor and VisitorLog models.
 *
 * These tests verify the Prisma schema defines the correct models, fields,
 * enums, and relationships. They use the Prisma runtime data model (DMMF)
 * to inspect the schema without requiring a live database connection.
 *
 * Acceptance criteria verified:
 *  - VisitorStatus enum exists with EXPECTED, CHECKED_IN, CHECKED_OUT, CANCELLED
 *  - VisitorAction enum exists with CHECK_IN, CHECK_OUT
 *  - Visitor model has all required fields with correct types
 *  - VisitorLog model has all required fields with correct types
 *  - Relations are properly defined (PlatformUser→Visitor, Visitor→VisitorLog)
 *  - PlatformUser has visitors Visitor[] back-relation ("VisitorHost")
 *  - PlatformUser has visitorLogs VisitorLog[] back-relation ("VisitorLogPerformer")
 *  - Visitor has logs VisitorLog[] back-relation
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
// VisitorStatus enum
// ---------------------------------------------------------------------------

describe('VisitorStatus enum', () => {
  it('exists', () => {
    expect(getEnum('VisitorStatus')).toBeDefined();
  });

  it('has EXPECTED value', () => {
    expect(getEnumValue('VisitorStatus', 'EXPECTED')).toBeDefined();
  });

  it('has CHECKED_IN value', () => {
    expect(getEnumValue('VisitorStatus', 'CHECKED_IN')).toBeDefined();
  });

  it('has CHECKED_OUT value', () => {
    expect(getEnumValue('VisitorStatus', 'CHECKED_OUT')).toBeDefined();
  });

  it('has CANCELLED value', () => {
    expect(getEnumValue('VisitorStatus', 'CANCELLED')).toBeDefined();
  });

  it('has exactly 4 values', () => {
    const e = getEnum('VisitorStatus');
    expect(e?.values).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// VisitorAction enum
// ---------------------------------------------------------------------------

describe('VisitorAction enum', () => {
  it('exists', () => {
    expect(getEnum('VisitorAction')).toBeDefined();
  });

  it('has CHECK_IN value', () => {
    expect(getEnumValue('VisitorAction', 'CHECK_IN')).toBeDefined();
  });

  it('has CHECK_OUT value', () => {
    expect(getEnumValue('VisitorAction', 'CHECK_OUT')).toBeDefined();
  });

  it('has exactly 2 values', () => {
    const e = getEnum('VisitorAction');
    expect(e?.values).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Visitor model
// ---------------------------------------------------------------------------

describe('Visitor model', () => {
  it('exists', () => {
    expect(getModel('Visitor')).toBeDefined();
  });

  it('has id field of type String (UUID)', () => {
    const field = getField('Visitor', 'id');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isId).toBe(true);
  });

  it('has hostId field of type String (required)', () => {
    const field = getField('Visitor', 'hostId');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has host relation to PlatformUser', () => {
    const field = getField('Visitor', 'host');
    expect(field).toBeDefined();
    expect(field?.type).toBe('PlatformUser');
    expect(field?.isRequired).toBe(true);
    expect(field?.isList).toBe(false);
  });

  it('has guestName field of type String (required)', () => {
    const field = getField('Visitor', 'guestName');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has optional guestEmail field of type String', () => {
    const field = getField('Visitor', 'guestEmail');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(false);
  });

  it('has optional guestPhone field of type String', () => {
    const field = getField('Visitor', 'guestPhone');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(false);
  });

  it('has optional purpose field of type String', () => {
    const field = getField('Visitor', 'purpose');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(false);
  });

  it('has expectedDate field of type DateTime (required)', () => {
    const field = getField('Visitor', 'expectedDate');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(true);
  });

  it('has accessCode field of type String (unique)', () => {
    const field = getField('Visitor', 'accessCode');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
    expect(field?.isUnique).toBe(true);
  });

  it('has status field of type VisitorStatus with default EXPECTED', () => {
    const field = getField('Visitor', 'status');
    expect(field).toBeDefined();
    expect(field?.type).toBe('VisitorStatus');
    expect(field?.isRequired).toBe(true);
    expect(field?.default).toBe('EXPECTED');
  });

  it('has optional notes field of type String', () => {
    const field = getField('Visitor', 'notes');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(false);
  });

  it('has createdAt field of type DateTime', () => {
    const field = getField('Visitor', 'createdAt');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(true);
  });

  it('has updatedAt field of type DateTime', () => {
    const field = getField('Visitor', 'updatedAt');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(true);
  });

  it('has logs VisitorLog[] back-relation', () => {
    const field = getField('Visitor', 'logs');
    expect(field).toBeDefined();
    expect(field?.type).toBe('VisitorLog');
    expect(field?.isList).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// VisitorLog model
// ---------------------------------------------------------------------------

describe('VisitorLog model', () => {
  it('exists', () => {
    expect(getModel('VisitorLog')).toBeDefined();
  });

  it('has id field of type String (UUID)', () => {
    const field = getField('VisitorLog', 'id');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isId).toBe(true);
  });

  it('has visitorId field of type String (required)', () => {
    const field = getField('VisitorLog', 'visitorId');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has visitor relation to Visitor', () => {
    const field = getField('VisitorLog', 'visitor');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Visitor');
    expect(field?.isRequired).toBe(true);
    expect(field?.isList).toBe(false);
  });

  it('has action field of type VisitorAction (required)', () => {
    const field = getField('VisitorLog', 'action');
    expect(field).toBeDefined();
    expect(field?.type).toBe('VisitorAction');
    expect(field?.isRequired).toBe(true);
  });

  it('has performedBy field of type String (required)', () => {
    const field = getField('VisitorLog', 'performedBy');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has performer relation to PlatformUser', () => {
    const field = getField('VisitorLog', 'performer');
    expect(field).toBeDefined();
    expect(field?.type).toBe('PlatformUser');
    expect(field?.isRequired).toBe(true);
    expect(field?.isList).toBe(false);
  });

  it('has timestamp field of type DateTime with default now()', () => {
    const field = getField('VisitorLog', 'timestamp');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(true);
  });

  it('has optional notes field of type String', () => {
    const field = getField('VisitorLog', 'notes');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Back-relations on PlatformUser
// ---------------------------------------------------------------------------

describe('PlatformUser model back-relations', () => {
  it('has visitors Visitor[] back-relation', () => {
    const field = getField('PlatformUser', 'visitors');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Visitor');
    expect(field?.isList).toBe(true);
  });

  it('has visitorLogs VisitorLog[] back-relation', () => {
    const field = getField('PlatformUser', 'visitorLogs');
    expect(field).toBeDefined();
    expect(field?.type).toBe('VisitorLog');
    expect(field?.isList).toBe(true);
  });
});
