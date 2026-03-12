/**
 * RED/GREEN TDD tests for Amenity, AmenityRule, and AmenityImage models.
 *
 * These tests verify the Prisma schema defines the correct models, fields,
 * enums, and relationships. They use the Prisma runtime data model (DMMF)
 * to inspect the schema without requiring a live database connection.
 */
import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';

// Helper to find a model in the DMMF
function getModel(name: string) {
  const model = Prisma.dmmf.datamodel.models.find(
    (m) => m.name === name,
  );
  return model;
}

// Helper to find a field on a model
function getField(modelName: string, fieldName: string) {
  const model = getModel(modelName);
  if (!model) return undefined;
  return model.fields.find((f) => f.name === fieldName);
}

// Helper to find an enum in the DMMF
function getEnum(name: string) {
  return Prisma.dmmf.datamodel.enums.find((e) => e.name === name);
}

// Helper to find an enum value
function getEnumValue(enumName: string, value: string) {
  const e = getEnum(enumName);
  if (!e) return undefined;
  return e.values.find((v) => v.name === value);
}

describe('AmenityRuleType enum', () => {
  it('exists', () => {
    expect(getEnum('AmenityRuleType')).toBeDefined();
  });

  it('has MAX_BOOKINGS_PER_DAY value', () => {
    expect(getEnumValue('AmenityRuleType', 'MAX_BOOKINGS_PER_DAY')).toBeDefined();
  });

  it('has MAX_BOOKINGS_PER_WEEK value', () => {
    expect(getEnumValue('AmenityRuleType', 'MAX_BOOKINGS_PER_WEEK')).toBeDefined();
  });

  it('has BLACKOUT_DATE value', () => {
    expect(getEnumValue('AmenityRuleType', 'BLACKOUT_DATE')).toBeDefined();
  });

  it('has ROLE_RESTRICTION value', () => {
    expect(getEnumValue('AmenityRuleType', 'ROLE_RESTRICTION')).toBeDefined();
  });

  it('has CUSTOM value', () => {
    expect(getEnumValue('AmenityRuleType', 'CUSTOM')).toBeDefined();
  });
});

describe('Amenity model', () => {
  it('exists', () => {
    expect(getModel('Amenity')).toBeDefined();
  });

  it('has id field of type String (UUID)', () => {
    const field = getField('Amenity', 'id');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isId).toBe(true);
  });

  it('has name field of type String', () => {
    const field = getField('Amenity', 'name');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has description field of type String', () => {
    const field = getField('Amenity', 'description');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has optional location field of type String', () => {
    const field = getField('Amenity', 'location');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(false);
  });

  it('has optional capacity field of type Int', () => {
    const field = getField('Amenity', 'capacity');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Int');
    expect(field?.isRequired).toBe(false);
  });

  it('has requiresApproval field of type Boolean (default false)', () => {
    const field = getField('Amenity', 'requiresApproval');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Boolean');
    expect(field?.isRequired).toBe(true);
    expect(field?.default).toBe(false);
  });

  it('has optional pricePerHour field of type Decimal', () => {
    const field = getField('Amenity', 'pricePerHour');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Decimal');
    expect(field?.isRequired).toBe(false);
  });

  it('has currency field of type String (default USD)', () => {
    const field = getField('Amenity', 'currency');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
    expect(field?.default).toBe('USD');
  });

  it('has availableFrom field of type String', () => {
    const field = getField('Amenity', 'availableFrom');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has availableTo field of type String', () => {
    const field = getField('Amenity', 'availableTo');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has daysAvailable field as Int array', () => {
    const field = getField('Amenity', 'daysAvailable');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Int');
    expect(field?.isList).toBe(true);
  });

  it('has minAdvanceHours field of type Int (default 0)', () => {
    const field = getField('Amenity', 'minAdvanceHours');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Int');
    expect(field?.isRequired).toBe(true);
    expect(field?.default).toBe(0);
  });

  it('has maxAdvanceHours field of type Int (default 720)', () => {
    const field = getField('Amenity', 'maxAdvanceHours');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Int');
    expect(field?.isRequired).toBe(true);
    expect(field?.default).toBe(720);
  });

  it('has maxDurationHours field of type Int (default 4)', () => {
    const field = getField('Amenity', 'maxDurationHours');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Int');
    expect(field?.isRequired).toBe(true);
    expect(field?.default).toBe(4);
  });

  it('has active field of type Boolean (default true)', () => {
    const field = getField('Amenity', 'active');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Boolean');
    expect(field?.isRequired).toBe(true);
    expect(field?.default).toBe(true);
  });

  it('has createdAt field of type DateTime', () => {
    const field = getField('Amenity', 'createdAt');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
  });

  it('has updatedAt field of type DateTime', () => {
    const field = getField('Amenity', 'updatedAt');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
  });

  it('has rules relation to AmenityRule', () => {
    const field = getField('Amenity', 'rules');
    expect(field).toBeDefined();
    expect(field?.type).toBe('AmenityRule');
    expect(field?.isList).toBe(true);
  });

  it('has images relation to AmenityImage', () => {
    const field = getField('Amenity', 'images');
    expect(field).toBeDefined();
    expect(field?.type).toBe('AmenityImage');
    expect(field?.isList).toBe(true);
  });
});

describe('AmenityRule model', () => {
  it('exists', () => {
    expect(getModel('AmenityRule')).toBeDefined();
  });

  it('has id field of type String (UUID)', () => {
    const field = getField('AmenityRule', 'id');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isId).toBe(true);
  });

  it('has amenityId field of type String', () => {
    const field = getField('AmenityRule', 'amenityId');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has amenity relation to Amenity', () => {
    const field = getField('AmenityRule', 'amenity');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Amenity');
    expect(field?.isRequired).toBe(true);
  });

  it('has ruleType field of type AmenityRuleType', () => {
    const field = getField('AmenityRule', 'ruleType');
    expect(field).toBeDefined();
    expect(field?.type).toBe('AmenityRuleType');
    expect(field?.isRequired).toBe(true);
  });

  it('has ruleValue field of type Json', () => {
    const field = getField('AmenityRule', 'ruleValue');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Json');
    expect(field?.isRequired).toBe(true);
  });

  it('has active field of type Boolean', () => {
    const field = getField('AmenityRule', 'active');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Boolean');
    expect(field?.isRequired).toBe(true);
  });
});

describe('AmenityImage model', () => {
  it('exists', () => {
    expect(getModel('AmenityImage')).toBeDefined();
  });

  it('has id field of type String (UUID)', () => {
    const field = getField('AmenityImage', 'id');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isId).toBe(true);
  });

  it('has amenityId field of type String', () => {
    const field = getField('AmenityImage', 'amenityId');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has amenity relation to Amenity', () => {
    const field = getField('AmenityImage', 'amenity');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Amenity');
    expect(field?.isRequired).toBe(true);
  });

  it('has uploadId field of type String', () => {
    const field = getField('AmenityImage', 'uploadId');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has sortOrder field of type Int', () => {
    const field = getField('AmenityImage', 'sortOrder');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Int');
    expect(field?.isRequired).toBe(true);
  });
});
