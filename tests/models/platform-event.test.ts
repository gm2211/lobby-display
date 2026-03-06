/**
 * RED/GREEN TDD tests for PlatformEvent and EventRSVP models.
 *
 * These tests verify the Prisma schema defines the correct models, fields,
 * enums, and relationships. They use the Prisma runtime data model (DMMF)
 * to inspect the schema without requiring a live database connection.
 *
 * Acceptance criteria verified:
 *  - RSVPStatus enum exists with GOING, MAYBE, NOT_GOING (@@schema("platform"))
 *  - PlatformEvent model has all required fields with correct types
 *  - EventRSVP model has all required fields with correct types
 *  - Relations are properly defined (PlatformUser <-> PlatformEvent, PlatformEvent <-> EventRSVP)
 *  - PlatformUser has createdEvents PlatformEvent[] and eventRsvps EventRSVP[] back-relations
 *  - Both models use @@schema("platform")
 *  - @@unique([eventId, userId]) constraint on EventRSVP
 *  - `npx prisma validate` passes
 */

import { execSync } from 'child_process';
import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { readFileSync } from 'fs';
import { resolve } from 'path';

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

const schemaPath = resolve(__dirname, '../../prisma/schema.prisma');
const schemaContent = readFileSync(schemaPath, 'utf-8');

// ---------------------------------------------------------------------------
// prisma validate
// ---------------------------------------------------------------------------

describe('prisma validate', () => {
  it('should pass npx prisma validate', () => {
    expect(() => {
      execSync('npx prisma validate', {
        stdio: 'pipe',
        cwd: resolve(__dirname, '../..'),
        env: {
          ...process.env,
          DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/renzo',
        },
      });
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// multiSchema setup (required for platform models)
// ---------------------------------------------------------------------------

describe('multiSchema setup', () => {
  it('has multiSchema previewFeature in generator', () => {
    expect(schemaContent).toMatch(/previewFeatures\s*=\s*\["multiSchema"\]/);
  });

  it('has platform schema in datasource', () => {
    expect(schemaContent).toMatch(/schemas\s*=\s*\["public",\s*"platform"\]/);
  });
});

// ---------------------------------------------------------------------------
// RSVPStatus enum
// ---------------------------------------------------------------------------

describe('RSVPStatus enum', () => {
  it('exists', () => {
    expect(getEnum('RSVPStatus')).toBeDefined();
  });

  it('has GOING value', () => {
    expect(getEnumValue('RSVPStatus', 'GOING')).toBeDefined();
  });

  it('has MAYBE value', () => {
    expect(getEnumValue('RSVPStatus', 'MAYBE')).toBeDefined();
  });

  it('has NOT_GOING value', () => {
    expect(getEnumValue('RSVPStatus', 'NOT_GOING')).toBeDefined();
  });

  it('has exactly 3 values', () => {
    const e = getEnum('RSVPStatus');
    expect(e?.values).toHaveLength(3);
  });

  it('is annotated with @@schema("platform")', () => {
    const enumMatch = schemaContent.match(/enum\s+RSVPStatus\s*\{[^}]*\}/s);
    expect(enumMatch).not.toBeNull();
    const enumBlock = enumMatch![0];
    expect(enumBlock).toMatch(/@@schema\("platform"\)/);
  });
});

// ---------------------------------------------------------------------------
// PlatformEvent model
// ---------------------------------------------------------------------------

describe('PlatformEvent model', () => {
  it('exists', () => {
    expect(getModel('PlatformEvent')).toBeDefined();
  });

  it('has id field of type String (UUID)', () => {
    const field = getField('PlatformEvent', 'id');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isId).toBe(true);
  });

  it('has title field of type String (required)', () => {
    const field = getField('PlatformEvent', 'title');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has description field of type String (required)', () => {
    const field = getField('PlatformEvent', 'description');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has optional location field of type String', () => {
    const field = getField('PlatformEvent', 'location');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(false);
  });

  it('has startTime field of type DateTime (required)', () => {
    const field = getField('PlatformEvent', 'startTime');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(true);
  });

  it('has optional endTime field of type DateTime', () => {
    const field = getField('PlatformEvent', 'endTime');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(false);
  });

  it('has isRecurring field of type Boolean with default false', () => {
    const field = getField('PlatformEvent', 'isRecurring');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Boolean');
    expect(field?.isRequired).toBe(true);
    expect(field?.default).toBe(false);
  });

  it('has optional recurrenceRule field of type String', () => {
    const field = getField('PlatformEvent', 'recurrenceRule');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(false);
  });

  it('has optional capacity field of type Int', () => {
    const field = getField('PlatformEvent', 'capacity');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Int');
    expect(field?.isRequired).toBe(false);
  });

  it('has optional imageId field of type String', () => {
    const field = getField('PlatformEvent', 'imageId');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(false);
  });

  it('has createdBy field of type String (required)', () => {
    const field = getField('PlatformEvent', 'createdBy');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has creator relation to PlatformUser', () => {
    const field = getField('PlatformEvent', 'creator');
    expect(field).toBeDefined();
    expect(field?.type).toBe('PlatformUser');
    expect(field?.isRequired).toBe(true);
    expect(field?.isList).toBe(false);
  });

  it('has active field of type Boolean with default true', () => {
    const field = getField('PlatformEvent', 'active');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Boolean');
    expect(field?.isRequired).toBe(true);
    expect(field?.default).toBe(true);
  });

  it('has createdAt field of type DateTime', () => {
    const field = getField('PlatformEvent', 'createdAt');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(true);
  });

  it('has updatedAt field of type DateTime', () => {
    const field = getField('PlatformEvent', 'updatedAt');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(true);
  });

  it('has rsvps relation to EventRSVP[]', () => {
    const field = getField('PlatformEvent', 'rsvps');
    expect(field).toBeDefined();
    expect(field?.type).toBe('EventRSVP');
    expect(field?.isList).toBe(true);
  });

  it('is annotated with @@schema("platform")', () => {
    const modelMatch = schemaContent.match(/model\s+PlatformEvent\s*\{[^}]*\}/s);
    expect(modelMatch).not.toBeNull();
    const modelBlock = modelMatch![0];
    expect(modelBlock).toMatch(/@@schema\("platform"\)/);
  });
});

// ---------------------------------------------------------------------------
// EventRSVP model
// ---------------------------------------------------------------------------

describe('EventRSVP model', () => {
  it('exists', () => {
    expect(getModel('EventRSVP')).toBeDefined();
  });

  it('has id field of type String (UUID)', () => {
    const field = getField('EventRSVP', 'id');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isId).toBe(true);
  });

  it('has eventId field of type String (required)', () => {
    const field = getField('EventRSVP', 'eventId');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has event relation to PlatformEvent', () => {
    const field = getField('EventRSVP', 'event');
    expect(field).toBeDefined();
    expect(field?.type).toBe('PlatformEvent');
    expect(field?.isRequired).toBe(true);
    expect(field?.isList).toBe(false);
  });

  it('has userId field of type String (required)', () => {
    const field = getField('EventRSVP', 'userId');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has user relation to PlatformUser', () => {
    const field = getField('EventRSVP', 'user');
    expect(field).toBeDefined();
    expect(field?.type).toBe('PlatformUser');
    expect(field?.isRequired).toBe(true);
    expect(field?.isList).toBe(false);
  });

  it('has status field of type RSVPStatus (required)', () => {
    const field = getField('EventRSVP', 'status');
    expect(field).toBeDefined();
    expect(field?.type).toBe('RSVPStatus');
    expect(field?.isRequired).toBe(true);
  });

  it('has createdAt field of type DateTime', () => {
    const field = getField('EventRSVP', 'createdAt');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(true);
  });

  it('has @@unique([eventId, userId]) constraint', () => {
    const modelMatch = schemaContent.match(/model\s+EventRSVP\s*\{[^}]*\}/s);
    expect(modelMatch).not.toBeNull();
    const modelBlock = modelMatch![0];
    expect(modelBlock).toMatch(/@@unique\(\[eventId,\s*userId\]\)/);
  });

  it('is annotated with @@schema("platform")', () => {
    const modelMatch = schemaContent.match(/model\s+EventRSVP\s*\{[^}]*\}/s);
    expect(modelMatch).not.toBeNull();
    const modelBlock = modelMatch![0];
    expect(modelBlock).toMatch(/@@schema\("platform"\)/);
  });
});

// ---------------------------------------------------------------------------
// Back-relations on PlatformUser
// ---------------------------------------------------------------------------

describe('PlatformUser model back-relations', () => {
  it('has createdEvents PlatformEvent[] back-relation', () => {
    const field = getField('PlatformUser', 'createdEvents');
    expect(field).toBeDefined();
    expect(field?.type).toBe('PlatformEvent');
    expect(field?.isList).toBe(true);
  });

  it('has eventRsvps EventRSVP[] back-relation', () => {
    const field = getField('PlatformUser', 'eventRsvps');
    expect(field).toBeDefined();
    expect(field?.type).toBe('EventRSVP');
    expect(field?.isList).toBe(true);
  });
});
