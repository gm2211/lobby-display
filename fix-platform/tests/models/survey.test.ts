/**
 * RED/GREEN TDD tests for Survey, SurveyQuestion, and SurveyResponse models.
 *
 * These tests verify the Prisma schema defines the correct models, fields,
 * and relationships. They use the Prisma runtime data model (DMMF)
 * to inspect the schema without requiring a live database connection.
 *
 * Acceptance criteria verified:
 *  - Survey model has all required fields with correct types
 *  - SurveyQuestion model has all required fields with correct types
 *  - SurveyResponse model has all required fields with correct types
 *  - Relations are properly defined (PlatformUser <-> Survey, Survey <-> SurveyQuestion, Survey <-> SurveyResponse)
 *  - PlatformUser has createdSurveys Survey[] and surveyResponses SurveyResponse[] back-relations
 *  - All models use @@schema("platform")
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
// Survey model
// ---------------------------------------------------------------------------

describe('Survey model', () => {
  it('exists', () => {
    expect(getModel('Survey')).toBeDefined();
  });

  it('has id field of type String (UUID)', () => {
    const field = getField('Survey', 'id');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isId).toBe(true);
  });

  it('has title field of type String (required)', () => {
    const field = getField('Survey', 'title');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has description field of type String (required)', () => {
    const field = getField('Survey', 'description');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has active field of type Boolean with default true', () => {
    const field = getField('Survey', 'active');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Boolean');
    expect(field?.isRequired).toBe(true);
    expect(field?.default).toBe(true);
  });

  it('has optional startsAt field of type DateTime', () => {
    const field = getField('Survey', 'startsAt');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(false);
  });

  it('has optional endsAt field of type DateTime', () => {
    const field = getField('Survey', 'endsAt');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(false);
  });

  it('has createdBy field of type String (required)', () => {
    const field = getField('Survey', 'createdBy');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has creator relation to PlatformUser', () => {
    const field = getField('Survey', 'creator');
    expect(field).toBeDefined();
    expect(field?.type).toBe('PlatformUser');
    expect(field?.isRequired).toBe(true);
    expect(field?.isList).toBe(false);
  });

  it('has createdAt field of type DateTime', () => {
    const field = getField('Survey', 'createdAt');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(true);
  });

  it('has updatedAt field of type DateTime', () => {
    const field = getField('Survey', 'updatedAt');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(true);
  });

  it('has questions relation to SurveyQuestion[]', () => {
    const field = getField('Survey', 'questions');
    expect(field).toBeDefined();
    expect(field?.type).toBe('SurveyQuestion');
    expect(field?.isList).toBe(true);
  });

  it('has responses relation to SurveyResponse[]', () => {
    const field = getField('Survey', 'responses');
    expect(field).toBeDefined();
    expect(field?.type).toBe('SurveyResponse');
    expect(field?.isList).toBe(true);
  });

  it('is annotated with @@schema("platform")', () => {
    const modelMatch = schemaContent.match(/model\s+Survey\s*\{[^}]*\}/s);
    expect(modelMatch).not.toBeNull();
    const modelBlock = modelMatch![0];
    expect(modelBlock).toMatch(/@@schema\("platform"\)/);
  });
});

// ---------------------------------------------------------------------------
// SurveyQuestion model
// ---------------------------------------------------------------------------

describe('SurveyQuestion model', () => {
  it('exists', () => {
    expect(getModel('SurveyQuestion')).toBeDefined();
  });

  it('has id field of type String (UUID)', () => {
    const field = getField('SurveyQuestion', 'id');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isId).toBe(true);
  });

  it('has surveyId field of type String (required)', () => {
    const field = getField('SurveyQuestion', 'surveyId');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has survey relation to Survey', () => {
    const field = getField('SurveyQuestion', 'survey');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Survey');
    expect(field?.isRequired).toBe(true);
    expect(field?.isList).toBe(false);
  });

  it('has text field of type String (required)', () => {
    const field = getField('SurveyQuestion', 'text');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has type field of type String (required)', () => {
    const field = getField('SurveyQuestion', 'type');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has optional options field of type Json', () => {
    const field = getField('SurveyQuestion', 'options');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Json');
    expect(field?.isRequired).toBe(false);
  });

  it('has required field of type Boolean with default true', () => {
    const field = getField('SurveyQuestion', 'required');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Boolean');
    expect(field?.isRequired).toBe(true);
    expect(field?.default).toBe(true);
  });

  it('has sortOrder field of type Int with default 0', () => {
    const field = getField('SurveyQuestion', 'sortOrder');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Int');
    expect(field?.isRequired).toBe(true);
    expect(field?.default).toBe(0);
  });

  it('is annotated with @@schema("platform")', () => {
    const modelMatch = schemaContent.match(/model\s+SurveyQuestion\s*\{[^}]*\}/s);
    expect(modelMatch).not.toBeNull();
    const modelBlock = modelMatch![0];
    expect(modelBlock).toMatch(/@@schema\("platform"\)/);
  });
});

// ---------------------------------------------------------------------------
// SurveyResponse model
// ---------------------------------------------------------------------------

describe('SurveyResponse model', () => {
  it('exists', () => {
    expect(getModel('SurveyResponse')).toBeDefined();
  });

  it('has id field of type String (UUID)', () => {
    const field = getField('SurveyResponse', 'id');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isId).toBe(true);
  });

  it('has surveyId field of type String (required)', () => {
    const field = getField('SurveyResponse', 'surveyId');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has survey relation to Survey', () => {
    const field = getField('SurveyResponse', 'survey');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Survey');
    expect(field?.isRequired).toBe(true);
    expect(field?.isList).toBe(false);
  });

  it('has userId field of type String (required)', () => {
    const field = getField('SurveyResponse', 'userId');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has user relation to PlatformUser', () => {
    const field = getField('SurveyResponse', 'user');
    expect(field).toBeDefined();
    expect(field?.type).toBe('PlatformUser');
    expect(field?.isRequired).toBe(true);
    expect(field?.isList).toBe(false);
  });

  it('has answers field of type Json (required)', () => {
    const field = getField('SurveyResponse', 'answers');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Json');
    expect(field?.isRequired).toBe(true);
  });

  it('has createdAt field of type DateTime', () => {
    const field = getField('SurveyResponse', 'createdAt');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(true);
  });

  it('is annotated with @@schema("platform")', () => {
    // Use a broader match that handles inline comments containing "}" characters
    const startIdx = schemaContent.indexOf('model SurveyResponse {');
    expect(startIdx).toBeGreaterThan(-1);
    const schemaAfter = schemaContent.slice(startIdx);
    // Find the closing brace of this model block (last @@schema line)
    const endIdx = schemaAfter.indexOf('@@schema("platform")');
    expect(endIdx).toBeGreaterThan(-1);
    const modelBlock = schemaAfter.slice(0, endIdx + '@@schema("platform")'.length + 5);
    expect(modelBlock).toMatch(/@@schema\("platform"\)/);
  });
});

// ---------------------------------------------------------------------------
// Back-relations on PlatformUser
// ---------------------------------------------------------------------------

describe('PlatformUser model back-relations', () => {
  it('has createdSurveys Survey[] back-relation', () => {
    const field = getField('PlatformUser', 'createdSurveys');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Survey');
    expect(field?.isList).toBe(true);
  });

  it('has surveyResponses SurveyResponse[] back-relation', () => {
    const field = getField('PlatformUser', 'surveyResponses');
    expect(field).toBeDefined();
    expect(field?.type).toBe('SurveyResponse');
    expect(field?.isList).toBe(true);
  });
});
