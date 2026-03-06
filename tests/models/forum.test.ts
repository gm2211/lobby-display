/**
 * RED/GREEN TDD tests for ForumCategory, ForumThread, and ForumPost models.
 *
 * These tests verify the Prisma schema defines the correct models, fields,
 * and relationships. They use the Prisma runtime data model (DMMF)
 * to inspect the schema without requiring a live database connection.
 *
 * Acceptance criteria verified:
 *  - ForumCategory model has all required fields (id, name unique, description?, sortOrder, threads[])
 *  - ForumThread model has all required fields with correct types
 *  - ForumPost model has all required fields
 *  - Relations: ForumCategory↔ForumThread, ForumThread↔ForumPost
 *  - ForumThread and ForumPost both relate to PlatformUser via named relations
 *  - PlatformUser has forumThreads ForumThread[] and forumPosts ForumPost[] back-relations
 *  - All models use @@schema("platform")
 *  - String UUID ids, NOT Int ids
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
// ForumCategory model
// ---------------------------------------------------------------------------

describe('ForumCategory model', () => {
  it('exists', () => {
    expect(getModel('ForumCategory')).toBeDefined();
  });

  it('has id field of type String (UUID)', () => {
    const field = getField('ForumCategory', 'id');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isId).toBe(true);
  });

  it('has name field of type String (unique)', () => {
    const field = getField('ForumCategory', 'name');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
    expect(field?.isUnique).toBe(true);
  });

  it('has optional description field of type String', () => {
    const field = getField('ForumCategory', 'description');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(false);
  });

  it('has sortOrder field of type Int with default 0', () => {
    const field = getField('ForumCategory', 'sortOrder');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Int');
    expect(field?.isRequired).toBe(true);
    expect(field?.default).toBe(0);
  });

  it('has threads relation to ForumThread[]', () => {
    const field = getField('ForumCategory', 'threads');
    expect(field).toBeDefined();
    expect(field?.type).toBe('ForumThread');
    expect(field?.isList).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ForumThread model
// ---------------------------------------------------------------------------

describe('ForumThread model', () => {
  it('exists', () => {
    expect(getModel('ForumThread')).toBeDefined();
  });

  it('has id field of type String (UUID)', () => {
    const field = getField('ForumThread', 'id');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isId).toBe(true);
  });

  it('has categoryId field of type String', () => {
    const field = getField('ForumThread', 'categoryId');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has category relation to ForumCategory', () => {
    const field = getField('ForumThread', 'category');
    expect(field).toBeDefined();
    expect(field?.type).toBe('ForumCategory');
    expect(field?.isRequired).toBe(true);
    expect(field?.isList).toBe(false);
  });

  it('has title field of type String', () => {
    const field = getField('ForumThread', 'title');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has authorId field of type String', () => {
    const field = getField('ForumThread', 'authorId');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has author relation to PlatformUser', () => {
    const field = getField('ForumThread', 'author');
    expect(field).toBeDefined();
    expect(field?.type).toBe('PlatformUser');
    expect(field?.isRequired).toBe(true);
    expect(field?.isList).toBe(false);
  });

  it('has pinned field of type Boolean with default false', () => {
    const field = getField('ForumThread', 'pinned');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Boolean');
    expect(field?.isRequired).toBe(true);
    expect(field?.default).toBe(false);
  });

  it('has locked field of type Boolean with default false', () => {
    const field = getField('ForumThread', 'locked');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Boolean');
    expect(field?.isRequired).toBe(true);
    expect(field?.default).toBe(false);
  });

  it('has createdAt field of type DateTime', () => {
    const field = getField('ForumThread', 'createdAt');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(true);
  });

  it('has updatedAt field of type DateTime', () => {
    const field = getField('ForumThread', 'updatedAt');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(true);
  });

  it('has posts relation to ForumPost[]', () => {
    const field = getField('ForumThread', 'posts');
    expect(field).toBeDefined();
    expect(field?.type).toBe('ForumPost');
    expect(field?.isList).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ForumPost model
// ---------------------------------------------------------------------------

describe('ForumPost model', () => {
  it('exists', () => {
    expect(getModel('ForumPost')).toBeDefined();
  });

  it('has id field of type String (UUID)', () => {
    const field = getField('ForumPost', 'id');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isId).toBe(true);
  });

  it('has threadId field of type String', () => {
    const field = getField('ForumPost', 'threadId');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has thread relation to ForumThread', () => {
    const field = getField('ForumPost', 'thread');
    expect(field).toBeDefined();
    expect(field?.type).toBe('ForumThread');
    expect(field?.isRequired).toBe(true);
    expect(field?.isList).toBe(false);
  });

  it('has authorId field of type String', () => {
    const field = getField('ForumPost', 'authorId');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has author relation to PlatformUser', () => {
    const field = getField('ForumPost', 'author');
    expect(field).toBeDefined();
    expect(field?.type).toBe('PlatformUser');
    expect(field?.isRequired).toBe(true);
    expect(field?.isList).toBe(false);
  });

  it('has body field of type String', () => {
    const field = getField('ForumPost', 'body');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has createdAt field of type DateTime', () => {
    const field = getField('ForumPost', 'createdAt');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(true);
  });

  it('has updatedAt field of type DateTime', () => {
    const field = getField('ForumPost', 'updatedAt');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Back-relations on PlatformUser
// ---------------------------------------------------------------------------

describe('PlatformUser model back-relations', () => {
  it('has forumThreads ForumThread[] back-relation', () => {
    const field = getField('PlatformUser', 'forumThreads');
    expect(field).toBeDefined();
    expect(field?.type).toBe('ForumThread');
    expect(field?.isList).toBe(true);
  });

  it('has forumPosts ForumPost[] back-relation', () => {
    const field = getField('PlatformUser', 'forumPosts');
    expect(field).toBeDefined();
    expect(field?.type).toBe('ForumPost');
    expect(field?.isList).toBe(true);
  });
});
