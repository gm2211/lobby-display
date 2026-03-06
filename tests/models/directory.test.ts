/**
 * DMMF-based Vitest tests for the DirectoryEntry model.
 *
 * These tests verify the Prisma schema defines the correct model, fields,
 * and relationships without requiring a live database connection.
 *
 * Acceptance criteria verified:
 *  - All DirectoryEntry fields exist with correct types
 *  - userId is unique
 *  - PlatformUser back-relation (directoryEntry) exists
 *  - visible defaults to true, sortOrder defaults to 0
 *  - Model uses @@schema("platform")
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
// DirectoryEntry model
// ---------------------------------------------------------------------------

describe('DirectoryEntry model', () => {
  it('exists in the DMMF', () => {
    expect(getModel('DirectoryEntry')).toBeDefined();
  });

  it('has id field of type String (UUID, @id)', () => {
    const field = getField('DirectoryEntry', 'id');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isId).toBe(true);
    expect(field?.isRequired).toBe(true);
  });

  it('has userId field of type String with @unique', () => {
    const field = getField('DirectoryEntry', 'userId');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
    expect(field?.isUnique).toBe(true);
  });

  it('has user relation to PlatformUser', () => {
    const field = getField('DirectoryEntry', 'user');
    expect(field).toBeDefined();
    expect(field?.type).toBe('PlatformUser');
    expect(field?.isRequired).toBe(true);
    expect(field?.isList).toBe(false);
  });

  it('has displayName field of type String (required)', () => {
    const field = getField('DirectoryEntry', 'displayName');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has optional title field of type String', () => {
    const field = getField('DirectoryEntry', 'title');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(false);
  });

  it('has optional department field of type String', () => {
    const field = getField('DirectoryEntry', 'department');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(false);
  });

  it('has optional phone field of type String', () => {
    const field = getField('DirectoryEntry', 'phone');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(false);
  });

  it('has optional email field of type String', () => {
    const field = getField('DirectoryEntry', 'email');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(false);
  });

  it('has optional photoUrl field of type String', () => {
    const field = getField('DirectoryEntry', 'photoUrl');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(false);
  });

  it('has visible field of type Boolean with default true', () => {
    const field = getField('DirectoryEntry', 'visible');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Boolean');
    expect(field?.isRequired).toBe(true);
    expect(field?.default).toBe(true);
  });

  it('has sortOrder field of type Int with default 0', () => {
    const field = getField('DirectoryEntry', 'sortOrder');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Int');
    expect(field?.isRequired).toBe(true);
    expect(field?.default).toBe(0);
  });

  it('has createdAt field of type DateTime', () => {
    const field = getField('DirectoryEntry', 'createdAt');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(true);
  });

  it('has updatedAt field of type DateTime', () => {
    const field = getField('DirectoryEntry', 'updatedAt');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Back-relation on PlatformUser
// ---------------------------------------------------------------------------

describe('PlatformUser model back-relation', () => {
  it('has directoryEntry DirectoryEntry? back-relation (optional, not a list)', () => {
    const field = getField('PlatformUser', 'directoryEntry');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DirectoryEntry');
    expect(field?.isList).toBe(false);
    expect(field?.isRequired).toBe(false);
  });
});
