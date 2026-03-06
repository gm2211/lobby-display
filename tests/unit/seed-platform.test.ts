/**
 * Unit tests for prisma/seed-platform.ts
 *
 * Tests verify that:
 * - Seed data structures are well-formed and match schema expectations
 * - All required fields are present
 * - Role counts match specification
 * - Settings, amenities, and announcements have valid shapes
 *
 * These tests run without a real database — they test data shape and
 * the exported seed data/config objects directly.
 */
import { describe, it, expect } from 'vitest';
import {
  ADMIN_USERS,
  MANAGER_USERS,
  BOARD_MEMBER_USERS,
  RESIDENT_USERS,
  PLATFORM_SETTINGS,
  SAMPLE_AMENITIES,
  SAMPLE_ANNOUNCEMENTS,
} from '../../prisma/seed-platform.js';
import type { PlatformRole } from '@prisma/client';

// ---------------------------------------------------------------------------
// User data shape tests
// ---------------------------------------------------------------------------

describe('ADMIN_USERS', () => {
  it('has exactly 1 admin user', () => {
    expect(ADMIN_USERS).toHaveLength(1);
  });

  it('all entries have required fields', () => {
    for (const u of ADMIN_USERS) {
      expect(u.username).toBeTruthy();
      expect(u.email).toBeTruthy();
      expect(u.firstName).toBeTruthy();
      expect(u.lastName).toBeTruthy();
      expect(u.role).toBe('MANAGER' as PlatformRole); // platform role
      expect(u.publicRole).toBe('ADMIN'); // public schema role
    }
  });

  it('all emails are valid format', () => {
    for (const u of ADMIN_USERS) {
      expect(u.email).toMatch(/@/);
    }
  });
});

describe('MANAGER_USERS', () => {
  it('has exactly 2 manager users', () => {
    expect(MANAGER_USERS).toHaveLength(2);
  });

  it('all entries have required fields', () => {
    for (const u of MANAGER_USERS) {
      expect(u.username).toBeTruthy();
      expect(u.email).toBeTruthy();
      expect(u.firstName).toBeTruthy();
      expect(u.lastName).toBeTruthy();
      expect(u.role).toBe('MANAGER' as PlatformRole);
      expect(u.unitNumber === undefined || typeof u.unitNumber === 'string').toBe(true);
    }
  });
});

describe('BOARD_MEMBER_USERS', () => {
  it('has exactly 3 board member users', () => {
    expect(BOARD_MEMBER_USERS).toHaveLength(3);
  });

  it('all entries have required fields', () => {
    for (const u of BOARD_MEMBER_USERS) {
      expect(u.username).toBeTruthy();
      expect(u.email).toBeTruthy();
      expect(u.firstName).toBeTruthy();
      expect(u.lastName).toBeTruthy();
      expect(u.role).toBe('BOARD_MEMBER' as PlatformRole);
      expect(u.unitNumber).toBeTruthy(); // board members should have units
    }
  });
});

describe('RESIDENT_USERS', () => {
  it('has exactly 5 resident users', () => {
    expect(RESIDENT_USERS).toHaveLength(5);
  });

  it('all entries have required fields', () => {
    for (const u of RESIDENT_USERS) {
      expect(u.username).toBeTruthy();
      expect(u.email).toBeTruthy();
      expect(u.firstName).toBeTruthy();
      expect(u.lastName).toBeTruthy();
      expect(u.role).toBe('RESIDENT' as PlatformRole);
      expect(u.unitNumber).toBeTruthy(); // residents must have unit numbers
    }
  });

  it('all unit numbers are non-empty strings', () => {
    for (const u of RESIDENT_USERS) {
      expect(typeof u.unitNumber).toBe('string');
      expect(u.unitNumber!.length).toBeGreaterThan(0);
    }
  });
});

describe('All platform users combined', () => {
  const allUsers = [...ADMIN_USERS, ...MANAGER_USERS, ...BOARD_MEMBER_USERS, ...RESIDENT_USERS];

  it('has 11 total users (1+2+3+5)', () => {
    expect(allUsers).toHaveLength(11);
  });

  it('all usernames are unique', () => {
    const usernames = allUsers.map((u) => u.username);
    const unique = new Set(usernames);
    expect(unique.size).toBe(usernames.length);
  });

  it('all emails are unique', () => {
    const emails = allUsers.map((u) => u.email);
    const unique = new Set(emails);
    expect(unique.size).toBe(emails.length);
  });

  it('all entries have a password field for User record', () => {
    for (const u of allUsers) {
      expect(u.password).toBeTruthy();
      expect(typeof u.password).toBe('string');
    }
  });
});

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

  it('exports seedUsers function', async () => {
    const module = await import('../../prisma/seed-platform.js');
    expect(typeof module.seedUsers).toBe('function');
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
