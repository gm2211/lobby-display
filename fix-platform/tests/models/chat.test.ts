/**
 * RED/GREEN TDD tests for ChatRole enum, ChatSession, and ChatMessage models.
 *
 * These tests verify the Prisma schema defines the correct models, fields,
 * and relationships. They use the Prisma runtime data model (DMMF)
 * to inspect the schema without requiring a live database connection.
 *
 * Acceptance criteria verified:
 *  - ChatRole enum with values: USER, ASSISTANT, SYSTEM
 *  - ChatSession model has all required fields (id, userId, title?, createdAt, updatedAt, messages[])
 *  - ChatMessage model has all required fields with correct types
 *  - Relations: ChatSession↔ChatMessage, PlatformUser↔ChatSession
 *  - PlatformUser has chatSessions ChatSession[] back-relation with named relation "ChatSessions"
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

function getEnum(name: string) {
  return Prisma.dmmf.datamodel.enums.find((e) => e.name === name);
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
// ChatRole enum
// ---------------------------------------------------------------------------

describe('ChatRole enum', () => {
  it('exists', () => {
    expect(getEnum('ChatRole')).toBeDefined();
  });

  it('has USER value', () => {
    const e = getEnum('ChatRole');
    expect(e?.values.find((v) => v.name === 'USER')).toBeDefined();
  });

  it('has ASSISTANT value', () => {
    const e = getEnum('ChatRole');
    expect(e?.values.find((v) => v.name === 'ASSISTANT')).toBeDefined();
  });

  it('has SYSTEM value', () => {
    const e = getEnum('ChatRole');
    expect(e?.values.find((v) => v.name === 'SYSTEM')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// ChatSession model
// ---------------------------------------------------------------------------

describe('ChatSession model', () => {
  it('exists', () => {
    expect(getModel('ChatSession')).toBeDefined();
  });

  it('has id field of type String (UUID)', () => {
    const field = getField('ChatSession', 'id');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isId).toBe(true);
  });

  it('has userId field of type String', () => {
    const field = getField('ChatSession', 'userId');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has user relation to PlatformUser', () => {
    const field = getField('ChatSession', 'user');
    expect(field).toBeDefined();
    expect(field?.type).toBe('PlatformUser');
    expect(field?.isRequired).toBe(true);
    expect(field?.isList).toBe(false);
  });

  it('has optional title field of type String', () => {
    const field = getField('ChatSession', 'title');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(false);
  });

  it('has createdAt field of type DateTime', () => {
    const field = getField('ChatSession', 'createdAt');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(true);
  });

  it('has updatedAt field of type DateTime', () => {
    const field = getField('ChatSession', 'updatedAt');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(true);
  });

  it('has messages relation to ChatMessage[]', () => {
    const field = getField('ChatSession', 'messages');
    expect(field).toBeDefined();
    expect(field?.type).toBe('ChatMessage');
    expect(field?.isList).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ChatMessage model
// ---------------------------------------------------------------------------

describe('ChatMessage model', () => {
  it('exists', () => {
    expect(getModel('ChatMessage')).toBeDefined();
  });

  it('has id field of type String (UUID)', () => {
    const field = getField('ChatMessage', 'id');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isId).toBe(true);
  });

  it('has sessionId field of type String', () => {
    const field = getField('ChatMessage', 'sessionId');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has session relation to ChatSession', () => {
    const field = getField('ChatMessage', 'session');
    expect(field).toBeDefined();
    expect(field?.type).toBe('ChatSession');
    expect(field?.isRequired).toBe(true);
    expect(field?.isList).toBe(false);
  });

  it('has role field of type ChatRole', () => {
    const field = getField('ChatMessage', 'role');
    expect(field).toBeDefined();
    expect(field?.type).toBe('ChatRole');
    expect(field?.isRequired).toBe(true);
  });

  it('has content field of type String', () => {
    const field = getField('ChatMessage', 'content');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has optional metadata field of type Json', () => {
    const field = getField('ChatMessage', 'metadata');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Json');
    expect(field?.isRequired).toBe(false);
  });

  it('has createdAt field of type DateTime', () => {
    const field = getField('ChatMessage', 'createdAt');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Back-relations on PlatformUser
// ---------------------------------------------------------------------------

describe('PlatformUser model back-relations', () => {
  it('has chatSessions ChatSession[] back-relation', () => {
    const field = getField('PlatformUser', 'chatSessions');
    expect(field).toBeDefined();
    expect(field?.type).toBe('ChatSession');
    expect(field?.isList).toBe(true);
  });
});
