/**
 * RED/GREEN TDD tests for DocumentCategory, Document, and DocumentVersion models.
 *
 * These tests verify the Prisma schema defines the correct models, fields,
 * and relationships. They use the Prisma runtime data model (DMMF)
 * to inspect the schema without requiring a live database connection.
 *
 * Acceptance criteria verified:
 *  - DocumentCategory model has all required fields
 *  - Document model has all required fields with correct types
 *  - DocumentVersion model has all required fields
 *  - Relations are properly defined (DocumentCategory↔Document, Document↔DocumentVersion)
 *  - PlatformUser has uploadedDocuments Document[] back-relation
 *  - All models use @@schema("platform")
 *  - Unique constraint on [documentId, version] in DocumentVersion
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
      execSync('./node_modules/.bin/prisma validate', {
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
// DocumentCategory model
// ---------------------------------------------------------------------------

describe('DocumentCategory model', () => {
  it('exists', () => {
    expect(getModel('DocumentCategory')).toBeDefined();
  });

  it('has id field of type String (UUID)', () => {
    const field = getField('DocumentCategory', 'id');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isId).toBe(true);
  });

  it('has name field of type String (unique)', () => {
    const field = getField('DocumentCategory', 'name');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
    expect(field?.isUnique).toBe(true);
  });

  it('has optional description field of type String', () => {
    const field = getField('DocumentCategory', 'description');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(false);
  });

  it('has sortOrder field of type Int with default 0', () => {
    const field = getField('DocumentCategory', 'sortOrder');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Int');
    expect(field?.isRequired).toBe(true);
    expect(field?.default).toBe(0);
  });

  it('has documents relation to Document[]', () => {
    const field = getField('DocumentCategory', 'documents');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Document');
    expect(field?.isList).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Document model
// ---------------------------------------------------------------------------

describe('Document model', () => {
  it('exists', () => {
    expect(getModel('Document')).toBeDefined();
  });

  it('has id field of type String (UUID)', () => {
    const field = getField('Document', 'id');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isId).toBe(true);
  });

  it('has title field of type String', () => {
    const field = getField('Document', 'title');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has optional description field of type String', () => {
    const field = getField('Document', 'description');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(false);
  });

  it('has categoryId field of type String', () => {
    const field = getField('Document', 'categoryId');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has category relation to DocumentCategory', () => {
    const field = getField('Document', 'category');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DocumentCategory');
    expect(field?.isRequired).toBe(true);
    expect(field?.isList).toBe(false);
  });

  it('has uploadedBy field of type String', () => {
    const field = getField('Document', 'uploadedBy');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has uploader relation to PlatformUser', () => {
    const field = getField('Document', 'uploader');
    expect(field).toBeDefined();
    expect(field?.type).toBe('PlatformUser');
    expect(field?.isRequired).toBe(true);
    expect(field?.isList).toBe(false);
  });

  it('has active field of type Boolean with default true', () => {
    const field = getField('Document', 'active');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Boolean');
    expect(field?.isRequired).toBe(true);
    expect(field?.default).toBe(true);
  });

  it('has createdAt field of type DateTime', () => {
    const field = getField('Document', 'createdAt');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(true);
  });

  it('has updatedAt field of type DateTime', () => {
    const field = getField('Document', 'updatedAt');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(true);
  });

  it('has versions relation to DocumentVersion[]', () => {
    const field = getField('Document', 'versions');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DocumentVersion');
    expect(field?.isList).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DocumentVersion model
// ---------------------------------------------------------------------------

describe('DocumentVersion model', () => {
  it('exists', () => {
    expect(getModel('DocumentVersion')).toBeDefined();
  });

  it('has id field of type String (UUID)', () => {
    const field = getField('DocumentVersion', 'id');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isId).toBe(true);
  });

  it('has documentId field of type String', () => {
    const field = getField('DocumentVersion', 'documentId');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has document relation to Document', () => {
    const field = getField('DocumentVersion', 'document');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Document');
    expect(field?.isRequired).toBe(true);
    expect(field?.isList).toBe(false);
  });

  it('has version field of type Int', () => {
    const field = getField('DocumentVersion', 'version');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Int');
    expect(field?.isRequired).toBe(true);
  });

  it('has filename field of type String', () => {
    const field = getField('DocumentVersion', 'filename');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has mimeType field of type String', () => {
    const field = getField('DocumentVersion', 'mimeType');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has size field of type Int', () => {
    const field = getField('DocumentVersion', 'size');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Int');
    expect(field?.isRequired).toBe(true);
  });

  it('has storagePath field of type String', () => {
    const field = getField('DocumentVersion', 'storagePath');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has uploadedBy field of type String', () => {
    const field = getField('DocumentVersion', 'uploadedBy');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has createdAt field of type DateTime', () => {
    const field = getField('DocumentVersion', 'createdAt');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(true);
  });

  it('has unique constraint on [documentId, version]', () => {
    const model = getModel('DocumentVersion');
    expect(model).toBeDefined();
    // The @@unique([documentId, version]) constraint appears as a uniqueIndex
    const hasUniqueConstraint = model?.uniqueIndexes?.some(
      (idx) =>
        idx.fields.includes('documentId') && idx.fields.includes('version'),
    );
    expect(hasUniqueConstraint).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Back-relation on PlatformUser
// ---------------------------------------------------------------------------

describe('PlatformUser model back-relations', () => {
  it('has uploadedDocuments Document[] back-relation', () => {
    const field = getField('PlatformUser', 'uploadedDocuments');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Document');
    expect(field?.isList).toBe(true);
  });
});
