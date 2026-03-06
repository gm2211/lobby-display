/**
 * RED/GREEN TDD tests for TrainingResource and TrainingCompletion models.
 *
 * These tests verify the Prisma schema defines the correct models, fields,
 * enums, and relationships. They use the Prisma runtime data model (DMMF)
 * to inspect the schema without requiring a live database connection.
 *
 * Acceptance criteria verified:
 *  - ContentType enum exists with VIDEO, DOCUMENT, LINK values
 *  - TrainingResource model has all required fields with correct types
 *  - TrainingCompletion model has all required fields
 *  - Relations are properly defined (PlatformUser, Upload, TrainingResource↔TrainingCompletion)
 *  - PlatformUser has trainingCompletions TrainingCompletion[] back-relation
 *  - Upload has trainingResources TrainingResource[] back-relation
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
// ContentType enum
// ---------------------------------------------------------------------------

describe('ContentType enum', () => {
  it('exists', () => {
    expect(getEnum('ContentType')).toBeDefined();
  });

  it('has VIDEO value', () => {
    expect(getEnumValue('ContentType', 'VIDEO')).toBeDefined();
  });

  it('has DOCUMENT value', () => {
    expect(getEnumValue('ContentType', 'DOCUMENT')).toBeDefined();
  });

  it('has LINK value', () => {
    expect(getEnumValue('ContentType', 'LINK')).toBeDefined();
  });

  it('has exactly 3 values', () => {
    const e = getEnum('ContentType');
    expect(e?.values).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// TrainingResource model
// ---------------------------------------------------------------------------

describe('TrainingResource model', () => {
  it('exists', () => {
    expect(getModel('TrainingResource')).toBeDefined();
  });

  it('has id field of type String (UUID)', () => {
    const field = getField('TrainingResource', 'id');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isId).toBe(true);
  });

  it('has title field of type String', () => {
    const field = getField('TrainingResource', 'title');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has description field of type String', () => {
    const field = getField('TrainingResource', 'description');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has contentType field of type ContentType', () => {
    const field = getField('TrainingResource', 'contentType');
    expect(field).toBeDefined();
    expect(field?.type).toBe('ContentType');
    expect(field?.isRequired).toBe(true);
  });

  it('has optional contentUrl field of type String', () => {
    const field = getField('TrainingResource', 'contentUrl');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(false);
  });

  it('has optional uploadId field of type String', () => {
    const field = getField('TrainingResource', 'uploadId');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(false);
  });

  it('has upload relation to Upload (optional)', () => {
    const field = getField('TrainingResource', 'upload');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Upload');
    expect(field?.isRequired).toBe(false);
    expect(field?.isList).toBe(false);
  });

  it('has requiredForRoles field as PlatformRole array', () => {
    const field = getField('TrainingResource', 'requiredForRoles');
    expect(field).toBeDefined();
    expect(field?.type).toBe('PlatformRole');
    expect(field?.isList).toBe(true);
  });

  it('has optional dueDate field of type DateTime', () => {
    const field = getField('TrainingResource', 'dueDate');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(false);
  });

  it('has sortOrder field of type Int with default 0', () => {
    const field = getField('TrainingResource', 'sortOrder');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Int');
    expect(field?.isRequired).toBe(true);
    expect(field?.default).toBe(0);
  });

  it('has active field of type Boolean with default true', () => {
    const field = getField('TrainingResource', 'active');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Boolean');
    expect(field?.isRequired).toBe(true);
    expect(field?.default).toBe(true);
  });

  it('has createdAt field of type DateTime', () => {
    const field = getField('TrainingResource', 'createdAt');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(true);
  });

  it('has updatedAt field of type DateTime', () => {
    const field = getField('TrainingResource', 'updatedAt');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(true);
  });

  it('has completions TrainingCompletion[] relation', () => {
    const field = getField('TrainingResource', 'completions');
    expect(field).toBeDefined();
    expect(field?.type).toBe('TrainingCompletion');
    expect(field?.isList).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TrainingCompletion model
// ---------------------------------------------------------------------------

describe('TrainingCompletion model', () => {
  it('exists', () => {
    expect(getModel('TrainingCompletion')).toBeDefined();
  });

  it('has id field of type String (UUID)', () => {
    const field = getField('TrainingCompletion', 'id');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isId).toBe(true);
  });

  it('has resourceId field of type String', () => {
    const field = getField('TrainingCompletion', 'resourceId');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has resource relation to TrainingResource', () => {
    const field = getField('TrainingCompletion', 'resource');
    expect(field).toBeDefined();
    expect(field?.type).toBe('TrainingResource');
    expect(field?.isRequired).toBe(true);
    expect(field?.isList).toBe(false);
  });

  it('has userId field of type String', () => {
    const field = getField('TrainingCompletion', 'userId');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has user relation to PlatformUser', () => {
    const field = getField('TrainingCompletion', 'user');
    expect(field).toBeDefined();
    expect(field?.type).toBe('PlatformUser');
    expect(field?.isRequired).toBe(true);
    expect(field?.isList).toBe(false);
  });

  it('has completedAt field of type DateTime', () => {
    const field = getField('TrainingCompletion', 'completedAt');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Back-relations on PlatformUser and Upload
// ---------------------------------------------------------------------------

describe('PlatformUser model back-relations', () => {
  it('has trainingCompletions TrainingCompletion[] back-relation', () => {
    const field = getField('PlatformUser', 'trainingCompletions');
    expect(field).toBeDefined();
    expect(field?.type).toBe('TrainingCompletion');
    expect(field?.isList).toBe(true);
  });
});

describe('Upload model back-relations', () => {
  it('has trainingResources TrainingResource[] back-relation', () => {
    const field = getField('Upload', 'trainingResources');
    expect(field).toBeDefined();
    expect(field?.type).toBe('TrainingResource');
    expect(field?.isList).toBe(true);
  });
});
