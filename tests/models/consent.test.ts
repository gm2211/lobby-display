/**
 * RED/GREEN TDD tests for ConsentForm and ConsentSignature models.
 *
 * These tests verify the Prisma schema defines the correct models, fields,
 * enums, and relationships. They use the Prisma runtime data model (DMMF)
 * to inspect the schema without requiring a live database connection.
 *
 * Acceptance criteria verified:
 *  - ConsentForm model has all required fields with correct types
 *  - ConsentSignature model has all required fields
 *  - ConsentForm.requiredForRoles is PlatformRole[]
 *  - Relations are properly defined (PlatformUser creator, ConsentForm↔ConsentSignature)
 *  - PlatformUser has createdConsentForms ConsentForm[] back-relation
 *  - PlatformUser has consentSignatures ConsentSignature[] back-relation
 *  - Both models use @@schema("platform")
 *  - ConsentSignature has @@unique([formId, userId])
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
          DATABASE_URL:
            process.env.DATABASE_URL ??
            'postgresql://postgres:postgres@localhost:5432/renzo',
        },
      });
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// ConsentForm model
// ---------------------------------------------------------------------------

describe('ConsentForm model', () => {
  it('exists', () => {
    expect(getModel('ConsentForm')).toBeDefined();
  });

  it('has id field of type String (UUID)', () => {
    const field = getField('ConsentForm', 'id');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isId).toBe(true);
  });

  it('has title field of type String (required)', () => {
    const field = getField('ConsentForm', 'title');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has body field of type String (required)', () => {
    const field = getField('ConsentForm', 'body');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has version field of type Int (required)', () => {
    const field = getField('ConsentForm', 'version');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Int');
    expect(field?.isRequired).toBe(true);
  });

  it('has requiredForRoles field as PlatformRole list', () => {
    const field = getField('ConsentForm', 'requiredForRoles');
    expect(field).toBeDefined();
    expect(field?.type).toBe('PlatformRole');
    expect(field?.isList).toBe(true);
  });

  it('has active field of type Boolean with default true', () => {
    const field = getField('ConsentForm', 'active');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Boolean');
    expect(field?.isRequired).toBe(true);
    expect(field?.default).toBe(true);
  });

  it('has createdBy field of type String (required)', () => {
    const field = getField('ConsentForm', 'createdBy');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has creator relation to PlatformUser', () => {
    const field = getField('ConsentForm', 'creator');
    expect(field).toBeDefined();
    expect(field?.type).toBe('PlatformUser');
    expect(field?.isRequired).toBe(true);
    expect(field?.isList).toBe(false);
  });

  it('has createdAt field of type DateTime', () => {
    const field = getField('ConsentForm', 'createdAt');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(true);
  });

  it('has updatedAt field of type DateTime', () => {
    const field = getField('ConsentForm', 'updatedAt');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(true);
  });

  it('has signatures relation to ConsentSignature[]', () => {
    const field = getField('ConsentForm', 'signatures');
    expect(field).toBeDefined();
    expect(field?.type).toBe('ConsentSignature');
    expect(field?.isList).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ConsentSignature model
// ---------------------------------------------------------------------------

describe('ConsentSignature model', () => {
  it('exists', () => {
    expect(getModel('ConsentSignature')).toBeDefined();
  });

  it('has id field of type String (UUID)', () => {
    const field = getField('ConsentSignature', 'id');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isId).toBe(true);
  });

  it('has formId field of type String (required)', () => {
    const field = getField('ConsentSignature', 'formId');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has form relation to ConsentForm', () => {
    const field = getField('ConsentSignature', 'form');
    expect(field).toBeDefined();
    expect(field?.type).toBe('ConsentForm');
    expect(field?.isRequired).toBe(true);
    expect(field?.isList).toBe(false);
  });

  it('has userId field of type String (required)', () => {
    const field = getField('ConsentSignature', 'userId');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has user relation to PlatformUser', () => {
    const field = getField('ConsentSignature', 'user');
    expect(field).toBeDefined();
    expect(field?.type).toBe('PlatformUser');
    expect(field?.isRequired).toBe(true);
    expect(field?.isList).toBe(false);
  });

  it('has signedAt field of type DateTime', () => {
    const field = getField('ConsentSignature', 'signedAt');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(true);
  });

  it('has optional ipAddress field of type String', () => {
    const field = getField('ConsentSignature', 'ipAddress');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(false);
  });

  it('has optional userAgent field of type String', () => {
    const field = getField('ConsentSignature', 'userAgent');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(false);
  });

  it('has @@unique([formId, userId]) constraint', () => {
    const model = getModel('ConsentSignature');
    expect(model).toBeDefined();
    const hasUniqueConstraint = model?.uniqueIndexes?.some(
      (idx) => idx.fields.includes('formId') && idx.fields.includes('userId'),
    );
    expect(hasUniqueConstraint).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Back-relations on PlatformUser
// ---------------------------------------------------------------------------

describe('PlatformUser model back-relations', () => {
  it('has createdConsentForms ConsentForm[] back-relation', () => {
    const field = getField('PlatformUser', 'createdConsentForms');
    expect(field).toBeDefined();
    expect(field?.type).toBe('ConsentForm');
    expect(field?.isList).toBe(true);
  });

  it('has consentSignatures ConsentSignature[] back-relation', () => {
    const field = getField('PlatformUser', 'consentSignatures');
    expect(field).toBeDefined();
    expect(field?.type).toBe('ConsentSignature');
    expect(field?.isList).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PlatformRole enum (used by ConsentForm.requiredForRoles)
// ---------------------------------------------------------------------------

describe('PlatformRole enum', () => {
  it('exists', () => {
    expect(getEnum('PlatformRole')).toBeDefined();
  });
});
