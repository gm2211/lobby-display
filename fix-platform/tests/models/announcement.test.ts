import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const SCHEMA_PATH = join(process.cwd(), 'prisma', 'schema.prisma');

function getSchema(): string {
  return readFileSync(SCHEMA_PATH, 'utf-8');
}

describe('Announcement model in schema.prisma', () => {
  it('schema file contains Announcement model', () => {
    const schema = getSchema();
    expect(schema).toContain('model Announcement');
  });

  it('Announcement model has id field (UUID)', () => {
    const schema = getSchema();
    // Extract the Announcement model block
    const match = schema.match(/model Announcement \{([^}]+)\}/s);
    expect(match).not.toBeNull();
    const modelBody = match![1];
    expect(modelBody).toContain('id');
    expect(modelBody).toMatch(/id\s+String\s+@id/);
  });

  it('Announcement model has title field', () => {
    const schema = getSchema();
    const match = schema.match(/model Announcement \{([^}]+)\}/s);
    expect(match).not.toBeNull();
    const modelBody = match![1];
    expect(modelBody).toContain('title');
    expect(modelBody).toMatch(/title\s+String/);
  });

  it('Announcement model has body field (rich text HTML)', () => {
    const schema = getSchema();
    const match = schema.match(/model Announcement \{([^}]+)\}/s);
    expect(match).not.toBeNull();
    const modelBody = match![1];
    expect(modelBody).toContain('body');
    expect(modelBody).toMatch(/body\s+String/);
  });

  it('Announcement model has pinned Boolean field', () => {
    const schema = getSchema();
    const match = schema.match(/model Announcement \{([^}]+)\}/s);
    expect(match).not.toBeNull();
    const modelBody = match![1];
    expect(modelBody).toMatch(/pinned\s+Boolean/);
  });

  it('Announcement model has priority Int field', () => {
    const schema = getSchema();
    const match = schema.match(/model Announcement \{([^}]+)\}/s);
    expect(match).not.toBeNull();
    const modelBody = match![1];
    expect(modelBody).toMatch(/priority\s+Int/);
  });

  it('Announcement model has publishedAt DateTime? field', () => {
    const schema = getSchema();
    const match = schema.match(/model Announcement \{([^}]+)\}/s);
    expect(match).not.toBeNull();
    const modelBody = match![1];
    expect(modelBody).toMatch(/publishedAt\s+DateTime\?/);
  });

  it('Announcement model has expiresAt DateTime? field', () => {
    const schema = getSchema();
    const match = schema.match(/model Announcement \{([^}]+)\}/s);
    expect(match).not.toBeNull();
    const modelBody = match![1];
    expect(modelBody).toMatch(/expiresAt\s+DateTime\?/);
  });

  it('Announcement model has createdBy String field referencing PlatformUser', () => {
    const schema = getSchema();
    const match = schema.match(/model Announcement \{([^}]+)\}/s);
    expect(match).not.toBeNull();
    const modelBody = match![1];
    expect(modelBody).toMatch(/createdBy\s+String/);
    // Should have a relation to PlatformUser
    expect(modelBody).toContain('createdByUser');
  });

  it('Announcement model has buildingId String? field', () => {
    const schema = getSchema();
    const match = schema.match(/model Announcement \{([^}]+)\}/s);
    expect(match).not.toBeNull();
    const modelBody = match![1];
    expect(modelBody).toMatch(/buildingId\s+String\?/);
  });

  it('Announcement model has markedForDeletion Boolean field', () => {
    const schema = getSchema();
    const match = schema.match(/model Announcement \{([^}]+)\}/s);
    expect(match).not.toBeNull();
    const modelBody = match![1];
    expect(modelBody).toMatch(/markedForDeletion\s+Boolean/);
  });

  it('Announcement model has createdAt DateTime field', () => {
    const schema = getSchema();
    const match = schema.match(/model Announcement \{([^}]+)\}/s);
    expect(match).not.toBeNull();
    const modelBody = match![1];
    expect(modelBody).toMatch(/createdAt\s+DateTime/);
  });

  it('Announcement model has updatedAt DateTime field', () => {
    const schema = getSchema();
    const match = schema.match(/model Announcement \{([^}]+)\}/s);
    expect(match).not.toBeNull();
    const modelBody = match![1];
    expect(modelBody).toMatch(/updatedAt\s+DateTime/);
  });

  it('Announcement model uses @@schema("platform")', () => {
    const schema = getSchema();
    const match = schema.match(/model Announcement \{([^}]+)\}/s);
    expect(match).not.toBeNull();
    const modelBody = match![1];
    expect(modelBody).toContain('@@schema("platform")');
  });

  it('schema has PlatformUser model', () => {
    const schema = getSchema();
    expect(schema).toContain('model PlatformUser');
  });

  it('schema has multiSchema preview feature enabled', () => {
    const schema = getSchema();
    expect(schema).toContain('multiSchema');
    expect(schema).toContain('previewFeatures');
  });

  it('schema has schemas array with platform and public', () => {
    const schema = getSchema();
    expect(schema).toContain('"platform"');
    expect(schema).toContain('"public"');
    // The datasource should have schemas = [...]
    expect(schema).toMatch(/schemas\s*=\s*\[/);
  });

  it('npx prisma validate exits with code 0', () => {
    let exitCode = 0;
    try {
      execSync('npx prisma validate', {
        cwd: process.cwd(),
        stdio: 'pipe',
        env: { ...process.env, DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/renzo_test' },
      });
    } catch (err: any) {
      exitCode = err.status ?? 1;
    }
    expect(exitCode).toBe(0);
  });
});
