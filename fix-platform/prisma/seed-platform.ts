/**
 * Platform schema seed script (content only — no users).
 *
 * Populates the platform schema with representative sample data:
 *  - PlatformSettings (building info, management contacts, office hours, booking defaults)
 *  - Sample Amenities (gym, pool, party room, rooftop) with rules
 *  - Sample Announcements (if a PlatformUser exists to act as creator)
 *
 * Users are managed separately via `scripts/test-user.ts`.
 *
 * Run with:
 *   ALLOW_SEED=true DATABASE_URL="postgresql://..." npx tsx prisma/seed-platform.ts
 *
 * Or via npm script:
 *   ALLOW_SEED=true DATABASE_URL="postgresql://..." npm run seed:platform
 */

import { PrismaClient } from "@prisma/client";
import { theme } from "../server/theme";

// Safety: require explicit opt-in to run seed
if (process.env.ALLOW_SEED !== "true") {
  console.error("ABORT: Set ALLOW_SEED=true to run seed-platform.ts.");
  process.exit(1);
}

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Platform settings seed data
// ---------------------------------------------------------------------------

export interface SeedSetting {
  key: string;
  value: unknown;
}

export const PLATFORM_SETTINGS: SeedSetting[] = [
  // Building information
  {
    key: "building.name",
    value: theme.buildingName,
  },
  {
    key: "building.address",
    value: theme.seedData.buildingAddress,
  },
  {
    key: "building.phone",
    value: "201-555-0100",
  },
  {
    key: "building.email",
    value: `concierge@${theme.seedData.emailDomain}`,
  },
  {
    key: "building.totalUnits",
    value: 560,
  },

  // Branding settings (runtime overrides for the compiled theme)
  {
    key: "branding.buildingName",
    value: theme.buildingName,
  },
  {
    key: "branding.portalTitle",
    value: theme.portalTitle,
  },
  {
    key: "branding.sidebarBrandText",
    value: theme.sidebarBrandText,
  },
  {
    key: "branding.logoUrl",
    value: theme.logoUrl,
  },
  {
    key: "branding.primaryColor",
    value: theme.colors.primary500,
  },
  {
    key: "branding.accentColor",
    value: theme.colors.secondary500,
  },
  {
    key: "branding.welcomeMessage",
    value: theme.welcomeMessage,
  },

  // Management company contact info
  {
    key: "management.company",
    value: "Renzo Property Management Group",
  },
  {
    key: "management.contactName",
    value: "Alexandra Torres",
  },
  {
    key: "management.email",
    value: `management@${theme.seedData.emailDomain}`,
  },
  {
    key: "management.phone",
    value: "201-555-0200",
  },
  {
    key: "management.emergencyPhone",
    value: "201-555-0911",
  },

  // Office hours
  {
    key: "office.hours",
    value: {
      monday: { open: "09:00", close: "17:00" },
      tuesday: { open: "09:00", close: "17:00" },
      wednesday: { open: "09:00", close: "17:00" },
      thursday: { open: "09:00", close: "17:00" },
      friday: { open: "09:00", close: "17:00" },
      saturday: { open: "10:00", close: "14:00" },
      sunday: null,
    },
  },
  {
    key: "office.concierge.hours",
    value: "24/7",
  },

  // Amenity booking defaults
  {
    key: "amenity.booking.defaultMinAdvanceHours",
    value: 2,
  },
  {
    key: "amenity.booking.defaultMaxAdvanceHours",
    value: 720,
  },
  {
    key: "amenity.booking.defaultMaxDurationHours",
    value: 4,
  },
  {
    key: "amenity.booking.requiresApprovalAboveDurationHours",
    value: 3,
  },
  {
    key: "amenity.booking.maxBookingsPerResidentPerWeek",
    value: 3,
  },

  // Notification settings
  {
    key: "notifications.bookingConfirmation",
    value: true,
  },
  {
    key: "notifications.maintenanceUpdates",
    value: true,
  },
  {
    key: "notifications.announcements",
    value: true,
  },

  // Branding settings (runtime theming overrides)
  {
    key: "branding.buildingName",
    value: "Test Building",
  },
  {
    key: "branding.portalTitle",
    value: "77 Hudson Resident Portal",
  },
  {
    key: "branding.sidebarBrandText",
    value: "77",
  },
  {
    key: "branding.logoUrl",
    value: "/assets/themes/77-hudson/logo.png",
  },
  {
    key: "branding.primaryColor",
    value: "#1a5c5a",
  },
  {
    key: "branding.accentColor",
    value: "#c9a96e",
  },
  {
    key: "branding.welcomeMessage",
    value: "Welcome to 77 Hudson",
  },
];

// ---------------------------------------------------------------------------
// Amenity seed data
// ---------------------------------------------------------------------------

export interface SeedAmenityRule {
  ruleType:
    | "MAX_BOOKINGS_PER_DAY"
    | "MAX_BOOKINGS_PER_WEEK"
    | "BLACKOUT_DATE"
    | "ROLE_RESTRICTION"
    | "CUSTOM";
  ruleValue: unknown;
}

// NOTE: AmenityRuleType does not include MAX_BOOKINGS_PER_MONTH.
// Monthly booking limits are expressed as CUSTOM rules with a "period": "month" field.

export interface SeedAmenity {
  name: string;
  description: string;
  location?: string;
  capacity?: number;
  requiresApproval: boolean;
  pricePerHour?: number;
  availableFrom: string;
  availableTo: string;
  daysAvailable: number[];
  minAdvanceHours: number;
  maxAdvanceHours: number;
  maxDurationHours: number;
  active: boolean;
  rules?: SeedAmenityRule[];
}

export const SAMPLE_AMENITIES: SeedAmenity[] = [
  {
    name: "Fitness Center",
    description:
      "State-of-the-art gym featuring cardio machines, free weights, and strength training equipment. " +
      "Personal training sessions available by appointment.",
    location: "Level B1",
    capacity: 30,
    requiresApproval: false,
    availableFrom: "05:00",
    availableTo: "23:00",
    daysAvailable: [0, 1, 2, 3, 4, 5, 6], // all week
    minAdvanceHours: 0,
    maxAdvanceHours: 336, // 2 weeks
    maxDurationHours: 2,
    active: true,
    rules: [
      {
        ruleType: "MAX_BOOKINGS_PER_DAY",
        ruleValue: {
          max: 2,
          description: "Maximum 2 sessions per resident per day",
        },
      },
      {
        ruleType: "MAX_BOOKINGS_PER_WEEK",
        ruleValue: {
          max: 7,
          description: "Maximum 7 sessions per resident per week",
        },
      },
    ],
  },
  {
    name: "Rooftop Pool",
    description:
      "Heated outdoor pool on the 40th floor with stunning views of the city skyline. " +
      "Includes lounge chairs, umbrellas, and poolside service during summer months.",
    location: "Level 40 Rooftop",
    capacity: 50,
    requiresApproval: false,
    pricePerHour: 0,
    availableFrom: "07:00",
    availableTo: "22:00",
    daysAvailable: [0, 1, 2, 3, 4, 5, 6],
    minAdvanceHours: 1,
    maxAdvanceHours: 720, // 30 days
    maxDurationHours: 4,
    active: true,
    rules: [
      {
        ruleType: "MAX_BOOKINGS_PER_WEEK",
        ruleValue: {
          max: 5,
          description: "Maximum 5 pool sessions per resident per week",
        },
      },
    ],
  },
  {
    name: "Party Room",
    description:
      "Elegant event space accommodating up to 80 guests, equipped with a full catering kitchen, " +
      "audio/visual system, and flexible seating arrangements. Perfect for private events and celebrations.",
    location: "Level 2",
    capacity: 80,
    requiresApproval: true,
    pricePerHour: 150,
    availableFrom: "10:00",
    availableTo: "23:00",
    daysAvailable: [0, 1, 2, 3, 4, 5, 6],
    minAdvanceHours: 48,
    maxAdvanceHours: 2160, // 90 days
    maxDurationHours: 8,
    active: true,
    rules: [
      {
        ruleType: "CUSTOM",
        ruleValue: {
          period: "month",
          max: 2,
          description: "Maximum 2 party room bookings per resident per month",
        },
      },
      {
        ruleType: "CUSTOM",
        ruleValue: {
          name: "security_deposit",
          description:
            "Security deposit of $500 required for events over 4 hours",
          triggerCondition: "duration_hours > 4",
          depositAmount: 500,
        },
      },
    ],
  },
  {
    name: "Sky Lounge",
    description:
      "Private lounge on the 38th floor offering panoramic views. Features a bar setup, comfortable seating, " +
      "and a terrace. Ideal for intimate gatherings and corporate networking events.",
    location: "Level 38",
    capacity: 40,
    requiresApproval: true,
    pricePerHour: 100,
    availableFrom: "12:00",
    availableTo: "23:59",
    daysAvailable: [1, 2, 3, 4, 5, 6], // Monday-Saturday (closed Sunday)
    minAdvanceHours: 24,
    maxAdvanceHours: 1440, // 60 days
    maxDurationHours: 5,
    active: true,
    rules: [
      {
        ruleType: "MAX_BOOKINGS_PER_WEEK",
        ruleValue: {
          max: 1,
          description: "Maximum 1 Sky Lounge booking per resident per week",
        },
      },
      {
        ruleType: "ROLE_RESTRICTION",
        ruleValue: {
          allowedRoles: ["RESIDENT", "BOARD_MEMBER", "MANAGER"],
          description:
            "Available to residents, board members, and management only",
        },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Announcement seed data
// ---------------------------------------------------------------------------

export interface SeedAnnouncement {
  title: string;
  body: string;
  pinned: boolean;
  priority: number;
  publishedAt?: Date;
  expiresAt?: Date;
}

export const SAMPLE_ANNOUNCEMENTS: SeedAnnouncement[] = [
  {
    title: `Welcome to ${theme.buildingName} Resident Portal`,
    body:
      `We are excited to introduce your new digital home for everything ${theme.buildingName}. ` +
      "Through this portal you can submit maintenance requests, book amenities, " +
      "stay up to date on building announcements, track your packages, and more.\n\n" +
      `Questions? Contact us at concierge@${theme.seedData.emailDomain} or stop by the front desk.`,
    pinned: true,
    priority: 10,
    publishedAt: new Date("2024-01-01T09:00:00Z"),
  },
  {
    title: "Rooftop Pool Season Opening",
    body:
      "The rooftop pool is now open for the season! Pool hours are 7:00 AM to 10:00 PM daily.\n\n" +
      "Please remember to:\n" +
      "- Book your session in advance through the Amenities section\n" +
      "- Bring your resident key fob for access\n" +
      "- Follow all posted pool rules\n" +
      "- Children under 16 must be accompanied by an adult resident\n\n" +
      "The pool will close for the season on Labor Day.",
    pinned: true,
    priority: 8,
    publishedAt: new Date("2024-05-25T08:00:00Z"),
    expiresAt: new Date("2024-09-07T23:59:59Z"),
  },
  {
    title: "Lobby Renovation Notice",
    body:
      "As part of our ongoing building improvements, the main lobby will undergo renovation " +
      "from February 1st through March 15th. During this period:\n\n" +
      "- The main entrance on Grand Street will remain open\n" +
      "- Please use the temporary covered walkway on the east side\n" +
      "- Package room hours remain unchanged\n" +
      "- Concierge desk will be temporarily located near the elevators\n\n" +
      "We apologize for any inconvenience and appreciate your patience.",
    pinned: false,
    priority: 5,
    publishedAt: new Date("2024-01-28T10:00:00Z"),
    expiresAt: new Date("2024-03-15T23:59:59Z"),
  },
];

// ---------------------------------------------------------------------------
// Seed functions
// ---------------------------------------------------------------------------

/**
 * Seeds platform settings (building info, management contacts, office hours, booking defaults).
 */
export async function seedSettings(db: PrismaClient): Promise<void> {
  console.log(`Seeding ${PLATFORM_SETTINGS.length} platform settings...`);

  for (const setting of PLATFORM_SETTINGS) {
    await db.platformSetting.upsert({
      where: { key: setting.key },
      update: { value: setting.value },
      create: {
        key: setting.key,
        value: setting.value,
      },
    });
    console.log(`  Upserted setting: ${setting.key}`);
  }
}

/**
 * Seeds sample amenities with their booking rules.
 * Returns a map of amenity name -> Amenity ID.
 */
export async function seedAmenities(
  db: PrismaClient,
): Promise<Map<string, string>> {
  const amenityIdMap = new Map<string, string>();

  console.log(`Seeding ${SAMPLE_AMENITIES.length} amenities...`);

  for (const amenityData of SAMPLE_AMENITIES) {
    const { rules, pricePerHour, ...rest } = amenityData;

    // Check if amenity already exists by name
    const existing = await db.amenity.findFirst({
      where: { name: amenityData.name },
    });

    let amenityId: string;

    if (existing) {
      await db.amenity.update({
        where: { id: existing.id },
        data: {
          ...rest,
          pricePerHour: pricePerHour !== undefined ? pricePerHour : null,
        },
      });
      amenityId = existing.id;
      console.log(`  Updated amenity: ${amenityData.name}`);
    } else {
      const amenity = await db.amenity.create({
        data: {
          ...rest,
          pricePerHour: pricePerHour !== undefined ? pricePerHour : null,
        },
      });
      amenityId = amenity.id;
      console.log(`  Created amenity: ${amenityData.name}`);
    }

    amenityIdMap.set(amenityData.name, amenityId);

    // Seed rules for this amenity if provided
    if (rules && rules.length > 0) {
      // Remove existing rules before re-seeding to avoid duplicates
      await db.amenityRule.deleteMany({
        where: { amenityId },
      });

      for (const rule of rules) {
        await db.amenityRule.create({
          data: {
            amenityId,
            ruleType: rule.ruleType as
              | "MAX_BOOKINGS_PER_DAY"
              | "MAX_BOOKINGS_PER_WEEK"
              | "BLACKOUT_DATE"
              | "ROLE_RESTRICTION"
              | "CUSTOM",
            ruleValue: rule.ruleValue,
            active: true,
          },
        });
      }
      console.log(`    Seeded ${rules.length} rules for ${amenityData.name}`);
    }
  }

  return amenityIdMap;
}

/**
 * Seeds sample announcements.
 * Looks up any existing PlatformUser to use as creator.
 * Skips with a warning if no PlatformUser exists yet.
 */
export async function seedAnnouncements(db: PrismaClient): Promise<void> {
  const creator = await db.platformUser.findFirst();
  if (!creator) {
    console.warn(
      "  WARNING: No PlatformUser found — skipping announcement seeding. " +
        "Create a user first via `scripts/test-user.ts create`, then re-run.",
    );
    return;
  }

  console.log(`Seeding ${SAMPLE_ANNOUNCEMENTS.length} announcements...`);

  for (const announcementData of SAMPLE_ANNOUNCEMENTS) {
    const existing = await db.announcement.findFirst({
      where: { title: announcementData.title },
    });

    if (existing) {
      await db.announcement.update({
        where: { id: existing.id },
        data: announcementData,
      });
      console.log(`  Updated announcement: ${announcementData.title}`);
    } else {
      await db.announcement.create({
        data: {
          ...announcementData,
          createdBy: creator.id,
        },
      });
      console.log(`  Created announcement: ${announcementData.title}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

/**
 * Seeds all platform data in the correct order.
 * This is idempotent — safe to run multiple times.
 */
export default async function seedPlatform(db?: PrismaClient): Promise<void> {
  const client = db ?? prisma;

  console.log("\n=== Seeding Platform Schema ===\n");

  try {
    // 1. Seed settings
    await seedSettings(client);

    // 2. Seed amenities
    await seedAmenities(client);

    // 3. Seed announcements (uses first available PlatformUser as creator)
    await seedAnnouncements(client);

    console.log("\n=== Platform seed complete ===\n");
  } catch (error) {
    console.error("Platform seed failed:", error);
    throw error;
  }
}

// Run if executed directly
seedPlatform()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
