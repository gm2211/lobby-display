import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Read the schema file
const schemaPath = path.resolve(__dirname, '../../prisma/schema.prisma');
const schema = fs.readFileSync(schemaPath, 'utf-8');

// Extract model bodies once
function getModelBody(modelName: string): string {
  const regex = new RegExp(`model\\s+${modelName}\\s*\\{([^}]*)\\}`, 's');
  const match = schema.match(regex);
  return match ? match[1] : '';
}

// Extract enum bodies once
function getEnumBody(enumName: string): string {
  const regex = new RegExp(`enum\\s+${enumName}\\s*\\{([^}]*)\\}`, 's');
  const match = schema.match(regex);
  return match ? match[1] : '';
}

// ---------------------------------------------------------------------------
// ViolationStatus enum
// ---------------------------------------------------------------------------
describe('ViolationStatus enum', () => {
  it('exists in the schema', () => {
    expect(schema).toMatch(/enum\s+ViolationStatus\s*\{/);
  });

  it('has REPORTED value', () => {
    const body = getEnumBody('ViolationStatus');
    expect(body).toMatch(/\bREPORTED\b/);
  });

  it('has UNDER_REVIEW value', () => {
    const body = getEnumBody('ViolationStatus');
    expect(body).toMatch(/\bUNDER_REVIEW\b/);
  });

  it('has CONFIRMED value', () => {
    const body = getEnumBody('ViolationStatus');
    expect(body).toMatch(/\bCONFIRMED\b/);
  });

  it('has APPEALED value', () => {
    const body = getEnumBody('ViolationStatus');
    expect(body).toMatch(/\bAPPEALED\b/);
  });

  it('has RESOLVED value', () => {
    const body = getEnumBody('ViolationStatus');
    expect(body).toMatch(/\bRESOLVED\b/);
  });

  it('has DISMISSED value', () => {
    const body = getEnumBody('ViolationStatus');
    expect(body).toMatch(/\bDISMISSED\b/);
  });

  it('has @@schema("platform") annotation', () => {
    const body = getEnumBody('ViolationStatus');
    expect(body).toMatch(/@@schema\("platform"\)/);
  });
});

// ---------------------------------------------------------------------------
// ViolationSeverity enum
// ---------------------------------------------------------------------------
describe('ViolationSeverity enum', () => {
  it('exists in the schema', () => {
    expect(schema).toMatch(/enum\s+ViolationSeverity\s*\{/);
  });

  it('has LOW value', () => {
    const body = getEnumBody('ViolationSeverity');
    expect(body).toMatch(/\bLOW\b/);
  });

  it('has MEDIUM value', () => {
    const body = getEnumBody('ViolationSeverity');
    expect(body).toMatch(/\bMEDIUM\b/);
  });

  it('has HIGH value', () => {
    const body = getEnumBody('ViolationSeverity');
    expect(body).toMatch(/\bHIGH\b/);
  });

  it('has @@schema("platform") annotation', () => {
    const body = getEnumBody('ViolationSeverity');
    expect(body).toMatch(/@@schema\("platform"\)/);
  });
});

// ---------------------------------------------------------------------------
// Violation model
// ---------------------------------------------------------------------------
describe('Violation model', () => {
  const modelBody = getModelBody('Violation');

  it('exists in the schema', () => {
    expect(schema).toMatch(/model\s+Violation\s*\{/);
  });

  it('has id field as UUID', () => {
    expect(modelBody).toMatch(/\bid\s+String\s+@id\s+@default\(uuid\(\)\)/);
  });

  it('has reportedBy field as String', () => {
    expect(modelBody).toMatch(/\breportedBy\s+String\b/);
  });

  it('has reporter relation to PlatformUser with named relation "ViolationReporter"', () => {
    expect(modelBody).toMatch(/\breporter\s+PlatformUser\s+@relation\(/);
    expect(modelBody).toMatch(/"ViolationReporter"/);
    expect(modelBody).toMatch(/fields:\s*\[reportedBy\]/);
    expect(modelBody).toMatch(/references:\s*\[id\]/);
  });

  it('has unitNumber field as String', () => {
    expect(modelBody).toMatch(/\bunitNumber\s+String\b/);
  });

  it('has category field as String', () => {
    expect(modelBody).toMatch(/\bcategory\s+String\b/);
  });

  it('has description field as String', () => {
    expect(modelBody).toMatch(/\bdescription\s+String\b/);
  });

  it('has evidence field as optional Json', () => {
    expect(modelBody).toMatch(/\bevidence\s+Json\?/);
  });

  it('has status field as ViolationStatus defaulting to REPORTED', () => {
    expect(modelBody).toMatch(/\bstatus\s+ViolationStatus\s+@default\(REPORTED\)/);
  });

  it('has severity field as ViolationSeverity', () => {
    expect(modelBody).toMatch(/\bseverity\s+ViolationSeverity\b/);
  });

  it('has fineAmount field as optional Decimal', () => {
    expect(modelBody).toMatch(/\bfineAmount\s+Decimal\?/);
  });

  it('has assignedTo field as optional String', () => {
    expect(modelBody).toMatch(/\bassignedTo\s+String\?/);
  });

  it('has createdAt field with @default(now())', () => {
    expect(modelBody).toMatch(/\bcreatedAt\s+DateTime\s+@default\(now\(\)\)/);
  });

  it('has updatedAt field with @updatedAt', () => {
    expect(modelBody).toMatch(/\bupdatedAt\s+DateTime\s+@updatedAt/);
  });

  it('has comments back-relation to ViolationComment[]', () => {
    expect(modelBody).toMatch(/\bcomments\s+ViolationComment\[\]/);
  });

  it('has @@schema("platform") annotation', () => {
    expect(modelBody).toMatch(/@@schema\("platform"\)/);
  });
});

// ---------------------------------------------------------------------------
// ViolationComment model
// ---------------------------------------------------------------------------
describe('ViolationComment model', () => {
  const modelBody = getModelBody('ViolationComment');

  it('exists in the schema', () => {
    expect(schema).toMatch(/model\s+ViolationComment\s*\{/);
  });

  it('has id field as UUID', () => {
    expect(modelBody).toMatch(/\bid\s+String\s+@id\s+@default\(uuid\(\)\)/);
  });

  it('has violationId field as String', () => {
    expect(modelBody).toMatch(/\bviolationId\s+String\b/);
  });

  it('has violation relation to Violation', () => {
    expect(modelBody).toMatch(/\bviolation\s+Violation\s+@relation\(/);
    expect(modelBody).toMatch(/fields:\s*\[violationId\]/);
    expect(modelBody).toMatch(/references:\s*\[id\]/);
  });

  it('has authorId field as String', () => {
    expect(modelBody).toMatch(/\bauthorId\s+String\b/);
  });

  it('has author relation to PlatformUser with named relation "ViolationComments"', () => {
    expect(modelBody).toMatch(/\bauthor\s+PlatformUser\s+@relation\(/);
    expect(modelBody).toMatch(/"ViolationComments"/);
    expect(modelBody).toMatch(/fields:\s*\[authorId\]/);
    expect(modelBody).toMatch(/references:\s*\[id\]/);
  });

  it('has body field as String', () => {
    expect(modelBody).toMatch(/\bbody\s+String\b/);
  });

  it('has isInternal field as Boolean defaulting to false', () => {
    expect(modelBody).toMatch(/\bisInternal\s+Boolean\s+@default\(false\)/);
  });

  it('has createdAt field with @default(now())', () => {
    expect(modelBody).toMatch(/\bcreatedAt\s+DateTime\s+@default\(now\(\)\)/);
  });

  it('has @@schema("platform") annotation', () => {
    expect(modelBody).toMatch(/@@schema\("platform"\)/);
  });
});

// ---------------------------------------------------------------------------
// Back-relations on PlatformUser
// ---------------------------------------------------------------------------
describe('Back-relations on PlatformUser', () => {
  const platformUserBody = getModelBody('PlatformUser');

  it('has violations back-relation with named relation "ViolationReporter"', () => {
    expect(platformUserBody).toMatch(/\bviolations\s+Violation\[\]/);
    expect(platformUserBody).toMatch(/@relation\("ViolationReporter"\)/);
  });

  it('has violationComments back-relation with named relation "ViolationComments"', () => {
    expect(platformUserBody).toMatch(/\bviolationComments\s+ViolationComment\[\]/);
    expect(platformUserBody).toMatch(/@relation\("ViolationComments"\)/);
  });
});

// ---------------------------------------------------------------------------
// multiSchema setup
// ---------------------------------------------------------------------------
describe('multiSchema setup', () => {
  it('has multiSchema previewFeature in generator', () => {
    expect(schema).toMatch(/previewFeatures\s*=\s*\["multiSchema"\]/);
  });

  it('has platform schema in datasource', () => {
    expect(schema).toMatch(/schemas\s*=\s*\["public",\s*"platform"\]/);
  });
});

// ---------------------------------------------------------------------------
// Prisma validate
// ---------------------------------------------------------------------------
describe('prisma validate', () => {
  it('passes validation', () => {
    const result = execSync('npx prisma validate', {
      cwd: path.resolve(__dirname, '../..'),
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    expect(result).toBeDefined();
  });
});
