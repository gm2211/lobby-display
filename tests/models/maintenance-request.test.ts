import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Read the schema file
const schemaPath = path.resolve(__dirname, '../../prisma/schema.prisma');
const schema = fs.readFileSync(schemaPath, 'utf-8');

describe('MaintenanceRequest schema', () => {
  describe('MaintenanceStatus enum', () => {
    it('exists in the schema', () => {
      expect(schema).toMatch(/enum\s+MaintenanceStatus\s*\{/);
    });

    it('contains all 5 required values', () => {
      const enumMatch = schema.match(/enum\s+MaintenanceStatus\s*\{([^}]*)\}/s);
      expect(enumMatch).not.toBeNull();
      const enumBody = enumMatch![1];
      expect(enumBody).toMatch(/\bOPEN\b/);
      expect(enumBody).toMatch(/\bASSIGNED\b/);
      expect(enumBody).toMatch(/\bIN_PROGRESS\b/);
      expect(enumBody).toMatch(/\bRESOLVED\b/);
      expect(enumBody).toMatch(/\bCLOSED\b/);
    });
  });

  describe('MaintenancePriority enum', () => {
    it('exists in the schema', () => {
      expect(schema).toMatch(/enum\s+MaintenancePriority\s*\{/);
    });

    it('contains all 4 required values', () => {
      const enumMatch = schema.match(/enum\s+MaintenancePriority\s*\{([^}]*)\}/s);
      expect(enumMatch).not.toBeNull();
      const enumBody = enumMatch![1];
      expect(enumBody).toMatch(/\bLOW\b/);
      expect(enumBody).toMatch(/\bMEDIUM\b/);
      expect(enumBody).toMatch(/\bHIGH\b/);
      expect(enumBody).toMatch(/\bURGENT\b/);
    });
  });

  describe('MaintenanceRequest model', () => {
    // Extract the MaintenanceRequest model block from the schema
    const modelMatch = schema.match(/model\s+MaintenanceRequest\s*\{([^}]*)\}/s);
    const modelBody = modelMatch ? modelMatch[1] : '';

    it('exists in the schema', () => {
      expect(modelMatch).not.toBeNull();
    });

    it('has id field as UUID', () => {
      expect(modelBody).toMatch(/\bid\s+String\s+@id\s+@default\(uuid\(\)\)/);
    });

    it('has title field as String', () => {
      expect(modelBody).toMatch(/\btitle\s+String\b/);
    });

    it('has description field as String', () => {
      expect(modelBody).toMatch(/\bdescription\s+String\b/);
    });

    it('has category field as String', () => {
      expect(modelBody).toMatch(/\bcategory\s+String\b/);
    });

    it('has status field as MaintenanceStatus enum', () => {
      expect(modelBody).toMatch(/\bstatus\s+MaintenanceStatus\b/);
    });

    it('has priority field as MaintenancePriority enum', () => {
      expect(modelBody).toMatch(/\bpriority\s+MaintenancePriority\b/);
    });

    it('has unitNumber field as String', () => {
      expect(modelBody).toMatch(/\bunitNumber\s+String\b/);
    });

    it('has reportedBy field as String', () => {
      expect(modelBody).toMatch(/\breportedBy\s+String\b/);
    });

    it('has assignedTo field as optional String', () => {
      expect(modelBody).toMatch(/\bassignedTo\s+String\?/);
    });

    it('has resolvedAt field as optional DateTime', () => {
      expect(modelBody).toMatch(/\bresolvedAt\s+DateTime\?/);
    });

    it('has createdAt field with @default(now())', () => {
      expect(modelBody).toMatch(/\bcreatedAt\s+DateTime\s+@default\(now\(\)\)/);
    });

    it('has updatedAt field with @updatedAt', () => {
      expect(modelBody).toMatch(/\bupdatedAt\s+DateTime\s+@updatedAt/);
    });

    it('has markedForDeletion field as Boolean defaulting to false', () => {
      expect(modelBody).toMatch(/\bmarkedForDeletion\s+Boolean\s+@default\(false\)/);
    });

    it('has @@schema("platform") annotation', () => {
      expect(modelBody).toMatch(/@@schema\("platform"\)/);
    });
  });

  describe('multiSchema setup', () => {
    it('has multiSchema preview feature enabled', () => {
      expect(schema).toMatch(/previewFeatures\s*=\s*\[.*"multiSchema".*\]/);
    });

    it('has platform schema listed', () => {
      expect(schema).toMatch(/schemas\s*=\s*\[.*"platform".*\]/);
    });

    it('has public schema listed', () => {
      expect(schema).toMatch(/schemas\s*=\s*\[.*"public".*\]/);
    });
  });

  describe('existing models have @@schema("public")', () => {
    const existingModels = ['Service', 'Event', 'Advisory', 'BuildingConfig', 'PublishedSnapshot', 'User', 'Session'];

    for (const modelName of existingModels) {
      it(`${modelName} model has @@schema("public")`, () => {
        const modelRegex = new RegExp(`model\\s+${modelName}\\s*\\{([^}]*)\\}`, 's');
        const match = schema.match(modelRegex);
        expect(match).not.toBeNull();
        const body = match![1];
        expect(body).toMatch(/@@schema\("public"\)/);
      });
    }
  });
});
