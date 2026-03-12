import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const schemaPath = resolve(__dirname, '../../prisma/schema.prisma');
const schema = readFileSync(schemaPath, 'utf-8');

describe('Prisma schema multiSchema setup', () => {
  describe('generator block', () => {
    it('has multiSchema preview feature enabled', () => {
      expect(schema).toMatch(/previewFeatures\s*=\s*\["multiSchema"\]/);
    });
  });

  describe('datasource block', () => {
    it('has schemas array with public and platform', () => {
      expect(schema).toMatch(/schemas\s*=\s*\["public",\s*"platform"\]/);
    });
  });

  describe('model annotations', () => {
    const models = [
      'Service',
      'Event',
      'Advisory',
      'BuildingConfig',
      'PublishedSnapshot',
      'User',
      'Session',
    ];

    for (const model of models) {
      it(`model ${model} has @@schema("public") annotation`, () => {
        // Find the model block and check it contains @@schema("public")
        const modelRegex = new RegExp(
          `model\\s+${model}\\s+\\{[^}]*@@schema\\("public"\\)[^}]*\\}`,
          's'
        );
        expect(schema).toMatch(modelRegex);
      });
    }
  });
});
