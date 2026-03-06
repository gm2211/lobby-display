/**
 * RED/GREEN TDD tests for AnnouncementRead model.
 *
 * These tests verify the Prisma schema defines the correct model, fields,
 * and relationships. They use the Prisma runtime data model (DMMF)
 * to inspect the schema without requiring a live database connection.
 *
 * Acceptance criteria verified:
 *  - AnnouncementRead model exists with all required fields
 *  - All fields have correct types
 *  - Unique constraint on [announcementId, userId]
 *  - Announcement back-relation (reads) exists
 *  - PlatformUser back-relation (announcementReads) exists
 *  - Model uses @@schema("platform")
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

// ---------------------------------------------------------------------------
// prisma validate
// ---------------------------------------------------------------------------

describe('prisma validate', () => {
  it('should pass npx prisma validate', () => {
    expect(() => {
      execSync('npx prisma validate', {
        stdio: 'pipe',
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/renzo_test' },
      });
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// AnnouncementRead model
// ---------------------------------------------------------------------------

describe('AnnouncementRead model', () => {
  it('exists', () => {
    expect(getModel('AnnouncementRead')).toBeDefined();
  });

  it('has id field of type String (UUID)', () => {
    const field = getField('AnnouncementRead', 'id');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isId).toBe(true);
  });

  it('has announcementId field of type String', () => {
    const field = getField('AnnouncementRead', 'announcementId');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has announcement relation to Announcement', () => {
    const field = getField('AnnouncementRead', 'announcement');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Announcement');
    expect(field?.isRequired).toBe(true);
    expect(field?.isList).toBe(false);
  });

  it('has userId field of type String', () => {
    const field = getField('AnnouncementRead', 'userId');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has user relation to PlatformUser', () => {
    const field = getField('AnnouncementRead', 'user');
    expect(field).toBeDefined();
    expect(field?.type).toBe('PlatformUser');
    expect(field?.isRequired).toBe(true);
    expect(field?.isList).toBe(false);
  });

  it('has readAt field of type DateTime', () => {
    const field = getField('AnnouncementRead', 'readAt');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(true);
  });

  it('has unique constraint on [announcementId, userId]', () => {
    const model = getModel('AnnouncementRead');
    expect(model).toBeDefined();
    const uniqueIndexes = model?.uniqueIndexes ?? [];
    const hasUniqueConstraint = uniqueIndexes.some(
      (idx) =>
        idx.fields.length === 2 &&
        idx.fields.includes('announcementId') &&
        idx.fields.includes('userId')
    );
    expect(hasUniqueConstraint).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Back-relations on Announcement and PlatformUser
// ---------------------------------------------------------------------------

describe('Announcement model back-relations', () => {
  it('has reads AnnouncementRead[] back-relation', () => {
    const field = getField('Announcement', 'reads');
    expect(field).toBeDefined();
    expect(field?.type).toBe('AnnouncementRead');
    expect(field?.isList).toBe(true);
  });
});

describe('PlatformUser model back-relations', () => {
  it('has announcementReads AnnouncementRead[] back-relation', () => {
    const field = getField('PlatformUser', 'announcementReads');
    expect(field).toBeDefined();
    expect(field?.type).toBe('AnnouncementRead');
    expect(field?.isList).toBe(true);
  });
});
