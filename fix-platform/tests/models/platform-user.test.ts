import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';

const schemaPath = resolve(__dirname, '../../prisma/schema.prisma');
const schemaContent = readFileSync(schemaPath, 'utf-8');

describe('PlatformRole enum', () => {
  it('exists in schema.prisma', () => {
    expect(schemaContent).toMatch(/enum\s+PlatformRole\s*\{/);
  });

  it('has RESIDENT value', () => {
    expect(schemaContent).toMatch(/RESIDENT/);
  });

  it('has BOARD_MEMBER value', () => {
    expect(schemaContent).toMatch(/BOARD_MEMBER/);
  });

  it('has MANAGER value', () => {
    expect(schemaContent).toMatch(/MANAGER/);
  });

  it('has SECURITY value', () => {
    expect(schemaContent).toMatch(/SECURITY/);
  });

  it('has CONCIERGE value', () => {
    expect(schemaContent).toMatch(/CONCIERGE/);
  });

  it('is annotated with @@schema("platform")', () => {
    // Extract the PlatformRole enum block
    const enumMatch = schemaContent.match(/enum\s+PlatformRole\s*\{[^}]*\}/s);
    expect(enumMatch).not.toBeNull();
    const enumBlock = enumMatch![0];
    expect(enumBlock).toMatch(/@@schema\("platform"\)/);
  });
});

describe('PlatformUser model', () => {
  it('exists in schema.prisma', () => {
    expect(schemaContent).toMatch(/model\s+PlatformUser\s*\{/);
  });

  it('has id field as UUID', () => {
    const modelMatch = schemaContent.match(/model\s+PlatformUser\s*\{[^}]*\}/s);
    expect(modelMatch).not.toBeNull();
    const modelBlock = modelMatch![0];
    expect(modelBlock).toMatch(/id\s+String\s+@id\s+@default\(uuid\(\)\)/);
  });

  it('has userId field as Int with @unique', () => {
    const modelMatch = schemaContent.match(/model\s+PlatformUser\s*\{[^}]*\}/s);
    expect(modelMatch).not.toBeNull();
    const modelBlock = modelMatch![0];
    expect(modelBlock).toMatch(/userId\s+Int\s+@unique/);
  });

  it('has unitNumber field', () => {
    const modelMatch = schemaContent.match(/model\s+PlatformUser\s*\{[^}]*\}/s);
    expect(modelMatch).not.toBeNull();
    const modelBlock = modelMatch![0];
    expect(modelBlock).toMatch(/unitNumber/);
  });

  it('has role field of type PlatformRole with default RESIDENT', () => {
    const modelMatch = schemaContent.match(/model\s+PlatformUser\s*\{[^}]*\}/s);
    expect(modelMatch).not.toBeNull();
    const modelBlock = modelMatch![0];
    expect(modelBlock).toMatch(/role\s+PlatformRole\s+@default\(RESIDENT\)/);
  });

  it('has phone field', () => {
    const modelMatch = schemaContent.match(/model\s+PlatformUser\s*\{[^}]*\}/s);
    expect(modelMatch).not.toBeNull();
    const modelBlock = modelMatch![0];
    expect(modelBlock).toMatch(/phone/);
  });

  it('has moveInDate field', () => {
    const modelMatch = schemaContent.match(/model\s+PlatformUser\s*\{[^}]*\}/s);
    expect(modelMatch).not.toBeNull();
    const modelBlock = modelMatch![0];
    expect(modelBlock).toMatch(/moveInDate/);
  });

  it('has emergencyContact field as Json', () => {
    const modelMatch = schemaContent.match(/model\s+PlatformUser\s*\{[^}]*\}/s);
    expect(modelMatch).not.toBeNull();
    const modelBlock = modelMatch![0];
    expect(modelBlock).toMatch(/emergencyContact\s+Json/);
  });

  it('has preferences field as Json', () => {
    const modelMatch = schemaContent.match(/model\s+PlatformUser\s*\{[^}]*\}/s);
    expect(modelMatch).not.toBeNull();
    const modelBlock = modelMatch![0];
    expect(modelBlock).toMatch(/preferences\s+Json/);
  });

  it('has createdAt field', () => {
    const modelMatch = schemaContent.match(/model\s+PlatformUser\s*\{[^}]*\}/s);
    expect(modelMatch).not.toBeNull();
    const modelBlock = modelMatch![0];
    expect(modelBlock).toMatch(/createdAt/);
  });

  it('has updatedAt field', () => {
    const modelMatch = schemaContent.match(/model\s+PlatformUser\s*\{[^}]*\}/s);
    expect(modelMatch).not.toBeNull();
    const modelBlock = modelMatch![0];
    expect(modelBlock).toMatch(/updatedAt/);
  });

  it('is annotated with @@schema("platform")', () => {
    const modelMatch = schemaContent.match(/model\s+PlatformUser\s*\{[^}]*\}/s);
    expect(modelMatch).not.toBeNull();
    const modelBlock = modelMatch![0];
    expect(modelBlock).toMatch(/@@schema\("platform"\)/);
  });
});

describe('multiSchema setup', () => {
  it('has multiSchema previewFeature in generator', () => {
    expect(schemaContent).toMatch(/previewFeatures\s*=\s*\["multiSchema"\]/);
  });

  it('has platform schema in datasource', () => {
    expect(schemaContent).toMatch(/schemas\s*=\s*\["public",\s*"platform"\]/);
  });

  it('existing models are annotated with @@schema("public")', () => {
    // Check that the User model has @@schema("public")
    const userModelMatch = schemaContent.match(/model\s+User\s*\{[^}]*\}/s);
    expect(userModelMatch).not.toBeNull();
    const userModelBlock = userModelMatch![0];
    expect(userModelBlock).toMatch(/@@schema\("public"\)/);
  });
});

describe('prisma validate', () => {
  it('passes validation', () => {
    const result = execSync('npx prisma validate', {
      cwd: resolve(__dirname, '../..'),
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    // If it doesn't throw, validation passed
    expect(result).toBeDefined();
  });
});
