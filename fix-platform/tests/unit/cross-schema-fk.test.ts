import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'fs';
import { resolve } from 'path';

const PROJECT_ROOT = resolve(__dirname, '../..');

describe('Cross-schema FK migration', () => {
  const migrationPath = resolve(PROJECT_ROOT, 'prisma/migrations/manual/cross_schema_fk.sql');
  const scriptPath = resolve(PROJECT_ROOT, 'scripts/run-manual-migrations.sh');

  describe('migration file', () => {
    it('exists at the expected path', () => {
      expect(existsSync(migrationPath)).toBe(true);
    });

    it('contains ALTER TABLE for PlatformUser', () => {
      const sql = readFileSync(migrationPath, 'utf-8');
      expect(sql).toMatch(/ALTER TABLE\s+platform\."PlatformUser"/);
    });

    it('adds the correct FK constraint name', () => {
      const sql = readFileSync(migrationPath, 'utf-8');
      expect(sql).toMatch(/ADD CONSTRAINT\s+fk_platform_user_user/);
    });

    it('references the public.User table', () => {
      const sql = readFileSync(migrationPath, 'utf-8');
      expect(sql).toMatch(/REFERENCES\s+public\."User"\s*\(id\)/);
    });

    it('is idempotent using DO $$ BEGIN...EXCEPTION pattern', () => {
      const sql = readFileSync(migrationPath, 'utf-8');
      expect(sql).toMatch(/DO\s+\$\$/);
      expect(sql).toMatch(/BEGIN/);
      expect(sql).toMatch(/EXCEPTION/);
      expect(sql).toMatch(/duplicate_object/);
    });

    it('references both platform and public schemas', () => {
      const sql = readFileSync(migrationPath, 'utf-8');
      expect(sql).toMatch(/platform\./);
      expect(sql).toMatch(/public\./);
    });

    it('uses the userId column', () => {
      const sql = readFileSync(migrationPath, 'utf-8');
      expect(sql).toMatch(/"userId"/);
    });
  });

  describe('run-manual-migrations script', () => {
    it('exists at the expected path', () => {
      expect(existsSync(scriptPath)).toBe(true);
    });

    it('is executable', () => {
      const stats = statSync(scriptPath);
      // Check owner execute bit (0o100) or group/other execute bits
      const isExecutable = (stats.mode & 0o111) !== 0;
      expect(isExecutable).toBe(true);
    });

    it('references the migration file', () => {
      const script = readFileSync(scriptPath, 'utf-8');
      expect(script).toMatch(/cross_schema_fk\.sql/);
    });

    it('uses psql to apply the migration', () => {
      const script = readFileSync(scriptPath, 'utf-8');
      expect(script).toMatch(/psql/);
    });
  });
});
