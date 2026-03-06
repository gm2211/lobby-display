import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Read the schema file
const schemaPath = path.resolve(__dirname, '../../prisma/schema.prisma');
const schema = fs.readFileSync(schemaPath, 'utf-8');

describe('PlatformSetting model', () => {
  // Extract the PlatformSetting model block from the schema
  const modelMatch = schema.match(/model\s+PlatformSetting\s*\{([^}]*)\}/s);
  const modelBody = modelMatch ? modelMatch[1] : '';

  it('exists in the schema', () => {
    expect(modelMatch).not.toBeNull();
  });

  it('has id field as UUID', () => {
    expect(modelBody).toMatch(/\bid\s+String\s+@id\s+@default\(uuid\(\)\)/);
  });

  it('has key field as String with @unique', () => {
    expect(modelBody).toMatch(/\bkey\s+String\s+@unique\b/);
  });

  it('has value field as Json', () => {
    expect(modelBody).toMatch(/\bvalue\s+Json\b/);
  });

  it('has updatedAt field with @updatedAt', () => {
    expect(modelBody).toMatch(/\bupdatedAt\s+DateTime\s+@updatedAt/);
  });

  it('has @@schema("platform") annotation', () => {
    expect(modelBody).toMatch(/@@schema\("platform"\)/);
  });
});

describe('Upload model', () => {
  // Extract the Upload model block from the schema
  const modelMatch = schema.match(/model\s+Upload\s*\{([^}]*)\}/s);
  const modelBody = modelMatch ? modelMatch[1] : '';

  it('exists in the schema', () => {
    expect(modelMatch).not.toBeNull();
  });

  it('has id field as UUID', () => {
    expect(modelBody).toMatch(/\bid\s+String\s+@id\s+@default\(uuid\(\)\)/);
  });

  it('has filename field as String', () => {
    expect(modelBody).toMatch(/\bfilename\s+String\b/);
  });

  it('has mimeType field as String', () => {
    expect(modelBody).toMatch(/\bmimeType\s+String\b/);
  });

  it('has size field as Int', () => {
    expect(modelBody).toMatch(/\bsize\s+Int\b/);
  });

  it('has storagePath field as String', () => {
    expect(modelBody).toMatch(/\bstoragePath\s+String\b/);
  });

  it('has uploadedBy field as String referencing PlatformUser.id', () => {
    expect(modelBody).toMatch(/\buploadedBy\s+String\b/);
  });

  it('has uploadedByUser relation to PlatformUser', () => {
    expect(modelBody).toMatch(/uploadedByUser\s+PlatformUser\s+@relation\(fields:\s*\[uploadedBy\],\s*references:\s*\[id\]\)/);
  });

  it('has createdAt field with @default(now())', () => {
    expect(modelBody).toMatch(/\bcreatedAt\s+DateTime\s+@default\(now\(\)\)/);
  });

  it('has @@schema("platform") annotation', () => {
    expect(modelBody).toMatch(/@@schema\("platform"\)/);
  });
});

describe('PlatformUser has uploads relation', () => {
  const platformUserMatch = schema.match(/model\s+PlatformUser\s*\{([^}]*)\}/s);
  const platformUserBody = platformUserMatch ? platformUserMatch[1] : '';

  it('PlatformUser model exists', () => {
    expect(platformUserMatch).not.toBeNull();
  });

  it('PlatformUser has uploads relation field', () => {
    expect(platformUserBody).toMatch(/\buploads\s+Upload\[\]/);
  });
});

describe('multiSchema setup', () => {
  it('has multiSchema preview feature enabled', () => {
    expect(schema).toMatch(/previewFeatures\s*=\s*\[.*"multiSchema".*\]/);
  });

  it('has platform schema listed in datasource', () => {
    expect(schema).toMatch(/schemas\s*=\s*\[.*"platform".*\]/);
  });

  it('has public schema listed in datasource', () => {
    expect(schema).toMatch(/schemas\s*=\s*\[.*"public".*\]/);
  });
});

describe('prisma validate', () => {
  it('passes validation after adding PlatformSetting and Upload', () => {
    const result = execSync('npx prisma validate', {
      cwd: path.resolve(__dirname, '../..'),
      encoding: 'utf-8',
      stdio: 'pipe',
      env: {
        ...process.env,
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/renzo',
      },
    });
    expect(result).toBeDefined();
  });
});
