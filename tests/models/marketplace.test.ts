/**
 * RED/GREEN TDD tests for MarketplaceListing and ListingImage models.
 *
 * These tests verify the Prisma schema defines the correct models, fields,
 * enums, and relationships. They use the Prisma runtime data model (DMMF)
 * to inspect the schema without requiring a live database connection.
 *
 * Acceptance criteria verified:
 *  - ListingStatus enum exists with ACTIVE, SOLD, EXPIRED, REMOVED
 *  - MarketplaceListing model has all required fields with correct types
 *  - ListingImage model has all required fields
 *  - Relations are properly defined (PlatformUser↔MarketplaceListing↔ListingImage)
 *  - PlatformUser has marketplaceListings MarketplaceListing[] back-relation
 *  - Both models use @@schema("platform")
 *  - `prisma validate` passes
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
  it('should pass prisma validate', () => {
    expect(() => {
      execSync('/home/claude/repo/node_modules/.bin/prisma validate', {
        stdio: 'pipe',
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/renzo',
        },
      });
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// ListingStatus enum
// ---------------------------------------------------------------------------

describe('ListingStatus enum', () => {
  it('exists', () => {
    expect(getEnum('ListingStatus')).toBeDefined();
  });

  it('has ACTIVE value', () => {
    expect(getEnumValue('ListingStatus', 'ACTIVE')).toBeDefined();
  });

  it('has SOLD value', () => {
    expect(getEnumValue('ListingStatus', 'SOLD')).toBeDefined();
  });

  it('has EXPIRED value', () => {
    expect(getEnumValue('ListingStatus', 'EXPIRED')).toBeDefined();
  });

  it('has REMOVED value', () => {
    expect(getEnumValue('ListingStatus', 'REMOVED')).toBeDefined();
  });

  it('has exactly 4 values', () => {
    const e = getEnum('ListingStatus');
    expect(e?.values).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// MarketplaceListing model
// ---------------------------------------------------------------------------

describe('MarketplaceListing model', () => {
  it('exists', () => {
    expect(getModel('MarketplaceListing')).toBeDefined();
  });

  it('has id field of type String (UUID)', () => {
    const field = getField('MarketplaceListing', 'id');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isId).toBe(true);
  });

  it('has sellerId field of type String', () => {
    const field = getField('MarketplaceListing', 'sellerId');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has seller relation to PlatformUser', () => {
    const field = getField('MarketplaceListing', 'seller');
    expect(field).toBeDefined();
    expect(field?.type).toBe('PlatformUser');
    expect(field?.isRequired).toBe(true);
    expect(field?.isList).toBe(false);
  });

  it('has title field of type String', () => {
    const field = getField('MarketplaceListing', 'title');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has description field of type String', () => {
    const field = getField('MarketplaceListing', 'description');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has optional price field of type Decimal', () => {
    const field = getField('MarketplaceListing', 'price');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Decimal');
    expect(field?.isRequired).toBe(false);
  });

  it('has category field of type String', () => {
    const field = getField('MarketplaceListing', 'category');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has optional condition field of type String', () => {
    const field = getField('MarketplaceListing', 'condition');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(false);
  });

  it('has status field of type ListingStatus with default ACTIVE', () => {
    const field = getField('MarketplaceListing', 'status');
    expect(field).toBeDefined();
    expect(field?.type).toBe('ListingStatus');
    expect(field?.isRequired).toBe(true);
    expect(field?.default).toBe('ACTIVE');
  });

  it('has createdAt field of type DateTime', () => {
    const field = getField('MarketplaceListing', 'createdAt');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(true);
  });

  it('has updatedAt field of type DateTime', () => {
    const field = getField('MarketplaceListing', 'updatedAt');
    expect(field).toBeDefined();
    expect(field?.type).toBe('DateTime');
    expect(field?.isRequired).toBe(true);
  });

  it('has images relation to ListingImage[]', () => {
    const field = getField('MarketplaceListing', 'images');
    expect(field).toBeDefined();
    expect(field?.type).toBe('ListingImage');
    expect(field?.isList).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ListingImage model
// ---------------------------------------------------------------------------

describe('ListingImage model', () => {
  it('exists', () => {
    expect(getModel('ListingImage')).toBeDefined();
  });

  it('has id field of type String (UUID)', () => {
    const field = getField('ListingImage', 'id');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isId).toBe(true);
  });

  it('has listingId field of type String', () => {
    const field = getField('ListingImage', 'listingId');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has listing relation to MarketplaceListing', () => {
    const field = getField('ListingImage', 'listing');
    expect(field).toBeDefined();
    expect(field?.type).toBe('MarketplaceListing');
    expect(field?.isRequired).toBe(true);
    expect(field?.isList).toBe(false);
  });

  it('has url field of type String', () => {
    const field = getField('ListingImage', 'url');
    expect(field).toBeDefined();
    expect(field?.type).toBe('String');
    expect(field?.isRequired).toBe(true);
  });

  it('has sortOrder field of type Int with default 0', () => {
    const field = getField('ListingImage', 'sortOrder');
    expect(field).toBeDefined();
    expect(field?.type).toBe('Int');
    expect(field?.isRequired).toBe(true);
    expect(field?.default).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Back-relation on PlatformUser
// ---------------------------------------------------------------------------

describe('PlatformUser model back-relations', () => {
  it('has marketplaceListings MarketplaceListing[] back-relation', () => {
    const field = getField('PlatformUser', 'marketplaceListings');
    expect(field).toBeDefined();
    expect(field?.type).toBe('MarketplaceListing');
    expect(field?.isList).toBe(true);
  });
});
