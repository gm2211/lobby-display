import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Read the schema file
const schemaPath = path.resolve(__dirname, '../../prisma/schema.prisma');
const schema = fs.readFileSync(schemaPath, 'utf-8');

// Extract model bodies once
function getModelBody(modelName: string): string {
  const regex = new RegExp(`model\\s+${modelName}\\s*\\{([^}]*)\\}`, 's');
  const match = schema.match(regex);
  return match ? match[1] : '';
}

describe('MaintenanceComment model', () => {
  const modelBody = getModelBody('MaintenanceComment');

  it('exists in the schema', () => {
    expect(schema).toMatch(/model\s+MaintenanceComment\s*\{/);
  });

  it('has id field as UUID', () => {
    expect(modelBody).toMatch(/\bid\s+String\s+@id\s+@default\(uuid\(\)\)/);
  });

  it('has requestId field as String', () => {
    expect(modelBody).toMatch(/\brequestId\s+String\b/);
  });

  it('has request relation to MaintenanceRequest', () => {
    expect(modelBody).toMatch(/\brequest\s+MaintenanceRequest\s+@relation\(/);
    expect(modelBody).toMatch(/fields:\s*\[requestId\]/);
    expect(modelBody).toMatch(/references:\s*\[id\]/);
  });

  it('has authorId field as String', () => {
    expect(modelBody).toMatch(/\bauthorId\s+String\b/);
  });

  it('has author relation to PlatformUser with named relation', () => {
    expect(modelBody).toMatch(/\bauthor\s+PlatformUser\s+@relation\(/);
    expect(modelBody).toMatch(/"MaintenanceComments"/);
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

describe('MaintenancePhoto model', () => {
  const modelBody = getModelBody('MaintenancePhoto');

  it('exists in the schema', () => {
    expect(schema).toMatch(/model\s+MaintenancePhoto\s*\{/);
  });

  it('has id field as UUID', () => {
    expect(modelBody).toMatch(/\bid\s+String\s+@id\s+@default\(uuid\(\)\)/);
  });

  it('has requestId field as String', () => {
    expect(modelBody).toMatch(/\brequestId\s+String\b/);
  });

  it('has request relation to MaintenanceRequest', () => {
    expect(modelBody).toMatch(/\brequest\s+MaintenanceRequest\s+@relation\(/);
    expect(modelBody).toMatch(/fields:\s*\[requestId\]/);
    expect(modelBody).toMatch(/references:\s*\[id\]/);
  });

  it('has uploadId field as String', () => {
    expect(modelBody).toMatch(/\buploadId\s+String\b/);
  });

  it('has upload relation to Upload', () => {
    expect(modelBody).toMatch(/\bupload\s+Upload\s+@relation\(/);
    expect(modelBody).toMatch(/fields:\s*\[uploadId\]/);
    expect(modelBody).toMatch(/references:\s*\[id\]/);
  });

  it('has caption field as optional String', () => {
    expect(modelBody).toMatch(/\bcaption\s+String\?/);
  });

  it('has createdAt field with @default(now())', () => {
    expect(modelBody).toMatch(/\bcreatedAt\s+DateTime\s+@default\(now\(\)\)/);
  });

  it('has @@schema("platform") annotation', () => {
    expect(modelBody).toMatch(/@@schema\("platform"\)/);
  });
});

describe('Back-relations on existing models', () => {
  describe('MaintenanceRequest back-relations', () => {
    const modelBody = getModelBody('MaintenanceRequest');

    it('has comments back-relation to MaintenanceComment[]', () => {
      expect(modelBody).toMatch(/\bcomments\s+MaintenanceComment\[\]/);
    });

    it('has photos back-relation to MaintenancePhoto[]', () => {
      expect(modelBody).toMatch(/\bphotos\s+MaintenancePhoto\[\]/);
    });
  });

  describe('PlatformUser back-relations', () => {
    const modelBody = getModelBody('PlatformUser');

    it('has maintenanceComments back-relation with named relation "MaintenanceComments"', () => {
      expect(modelBody).toMatch(/\bmaintenanceComments\s+MaintenanceComment\[\]/);
      expect(modelBody).toMatch(/@relation\("MaintenanceComments"\)/);
    });
  });

  describe('Upload back-relations', () => {
    const modelBody = getModelBody('Upload');

    it('has maintenancePhotos back-relation to MaintenancePhoto[]', () => {
      expect(modelBody).toMatch(/\bmaintenancePhotos\s+MaintenancePhoto\[\]/);
    });
  });
});
