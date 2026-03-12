/**
 * Unit tests for prisma/seed-platform.ts
 *
 * Tests verify that:
 * - Seed data structures are well-formed and match schema expectations
 * - All required fields are present
 * - Settings, amenities, and announcements have valid shapes
 *
 * These tests run without a real database — they test data shape and
 * the exported seed data/config objects directly.
 *
 * Note: User seeding has been removed from seed-platform.ts.
 * Users are now managed via scripts/test-user.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  PLATFORM_SETTINGS,
  SAMPLE_AMENITIES,
  SAMPLE_ANNOUNCEMENTS,
} from '../../prisma/seed-platform.js';

// ---------------------------------------------------------------------------
// Platform settings tests
// ---------------------------------------------------------------------------

describe('PLATFORM_SETTINGS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(PLATFORM_SETTINGS)).toBe(true);
    expect(PLATFORM_SETTINGS.length).toBeGreaterThan(0);
  });

  it('each setting has a key and value', () => {
    for (const s of PLATFORM_SETTINGS) {
      expect(s.key).toBeTruthy();
      expect(typeof s.key).toBe('string');
      expect(s.value).toBeDefined();
    }
  });

  it('all keys are unique', () => {
    const keys = PLATFORM_SETTINGS.map((s) => s.key);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  it('includes building name setting', () => {
    const keys = PLATFORM_SETTINGS.map((s) => s.key);
    expect(keys).toContain('building.name');
  });

  it('includes building address setting', () => {
    const keys = PLATFORM_SETTINGS.map((s) => s.key);
    expect(keys).toContain('building.address');
  });

  it('includes management company contact info', () => {
    const keys = PLATFORM_SETTINGS.map((s) => s.key);
    // At least one management company setting
    const managementKeys = keys.filter((k) => k.startsWith('management.'));
    expect(managementKeys.length).toBeGreaterThan(0);
  });

  it('includes office hours setting', () => {
    const keys = PLATFORM_SETTINGS.map((s) => s.key);
    const officeHoursKeys = keys.filter((k) => k.includes('office') || k.includes('hours'));
    expect(officeHoursKeys.length).toBeGreaterThan(0);
  });

  it('includes amenity booking defaults', () => {
    const keys = PLATFORM_SETTINGS.map((s) => s.key);
    const amenityKeys = keys.filter((k) => k.includes('amenity') || k.includes('booking'));
    expect(amenityKeys.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Amenity data tests
// ---------------------------------------------------------------------------

describe('SAMPLE_AMENITIES', () => {
  it('has 3-4 amenities', () => {
    expect(SAMPLE_AMENITIES.length).toBeGreaterThanOrEqual(3);
    expect(SAMPLE_AMENITIES.length).toBeLessThanOrEqual(4);
  });

  it('each amenity has required fields', () => {
    for (const a of SAMPLE_AMENITIES) {
      expect(a.name).toBeTruthy();
      expect(a.description).toBeTruthy();
      expect(a.availableFrom).toBeTruthy();
      expect(a.availableTo).toBeTruthy();
      expect(Array.isArray(a.daysAvailable)).toBe(true);
    }
  });

  it('each amenity has valid capacity (if defined)', () => {
    for (const a of SAMPLE_AMENITIES) {
      if (a.capacity !== undefined) {
        expect(typeof a.capacity).toBe('number');
        expect(a.capacity).toBeGreaterThan(0);
      }
    }
  });

  it('each amenity has minAdvanceHours and maxAdvanceHours', () => {
    for (const a of SAMPLE_AMENITIES) {
      expect(typeof a.minAdvanceHours).toBe('number');
      expect(typeof a.maxAdvanceHours).toBe('number');
      expect(a.maxAdvanceHours).toBeGreaterThanOrEqual(a.minAdvanceHours);
    }
  });

  it('each amenity has maxDurationHours', () => {
    for (const a of SAMPLE_AMENITIES) {
      expect(typeof a.maxDurationHours).toBe('number');
      expect(a.maxDurationHours).toBeGreaterThan(0);
    }
  });

  it('daysAvailable values are 0-6 (Sunday-Saturday)', () => {
    for (const a of SAMPLE_AMENITIES) {
      for (const day of a.daysAvailable) {
        expect(day).toBeGreaterThanOrEqual(0);
        expect(day).toBeLessThanOrEqual(6);
      }
    }
  });

  it('availableFrom is a valid HH:MM time', () => {
    const timeRegex = /^\d{2}:\d{2}$/;
    for (const a of SAMPLE_AMENITIES) {
      expect(a.availableFrom).toMatch(timeRegex);
    }
  });

  it('availableTo is a valid HH:MM time', () => {
    const timeRegex = /^\d{2}:\d{2}$/;
    for (const a of SAMPLE_AMENITIES) {
      expect(a.availableTo).toMatch(timeRegex);
    }
  });

  it('amenity names include expected building amenities', () => {
    const names = SAMPLE_AMENITIES.map((a) => a.name.toLowerCase());
    // Should have at least some typical building amenities
    const hasGymOrFitness = names.some((n) => n.includes('gym') || n.includes('fitness'));
    const hasPoolOrRooftop = names.some(
      (n) => n.includes('pool') || n.includes('rooftop') || n.includes('party') || n.includes('lounge')
    );
    expect(hasGymOrFitness || hasPoolOrRooftop).toBe(true);
  });

  it('each amenity may have rules array', () => {
    for (const a of SAMPLE_AMENITIES) {
      if (a.rules !== undefined) {
        expect(Array.isArray(a.rules)).toBe(true);
        for (const r of a.rules) {
          expect(r.ruleType).toBeTruthy();
          expect(r.ruleValue).toBeDefined();
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Announcement data tests
// ---------------------------------------------------------------------------

describe('SAMPLE_ANNOUNCEMENTS', () => {
  it('has 2-3 announcements', () => {
    expect(SAMPLE_ANNOUNCEMENTS.length).toBeGreaterThanOrEqual(2);
    expect(SAMPLE_ANNOUNCEMENTS.length).toBeLessThanOrEqual(3);
  });

  it('each announcement has title and body', () => {
    for (const a of SAMPLE_ANNOUNCEMENTS) {
      expect(a.title).toBeTruthy();
      expect(a.body).toBeTruthy();
    }
  });

  it('each announcement has a pinned boolean', () => {
    for (const a of SAMPLE_ANNOUNCEMENTS) {
      expect(typeof a.pinned).toBe('boolean');
    }
  });

  it('each announcement has a priority number', () => {
    for (const a of SAMPLE_ANNOUNCEMENTS) {
      expect(typeof a.priority).toBe('number');
    }
  });

  it('at least one announcement is pinned', () => {
    const pinned = SAMPLE_ANNOUNCEMENTS.filter((a) => a.pinned);
    expect(pinned.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Seed function export tests
// ---------------------------------------------------------------------------

describe('seed function exports', () => {
  it('exports a default seedPlatform function', async () => {
    const module = await import('../../prisma/seed-platform.js');
    expect(typeof module.default).toBe('function');
  });

  it('exports seedSettings function', async () => {
    const module = await import('../../prisma/seed-platform.js');
    expect(typeof module.seedSettings).toBe('function');
  });

  it('exports seedAmenities function', async () => {
    const module = await import('../../prisma/seed-platform.js');
    expect(typeof module.seedAmenities).toBe('function');
  });

  it('exports seedAnnouncements function', async () => {
    const module = await import('../../prisma/seed-platform.js');
    expect(typeof module.seedAnnouncements).toBe('function');
  });
});
