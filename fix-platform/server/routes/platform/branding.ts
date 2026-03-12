/**
 * Platform Branding API Routes
 *
 * Provides runtime branding configuration served from the PlatformSetting table.
 * Falls back to compile-time theme values for any missing keys.
 *
 * ROUTES:
 * - GET  /api/platform/branding  - Return branding settings (PUBLIC — no auth required)
 * - PUT  /api/platform/branding  - Update branding settings (EDITOR+ auth required)
 *
 * SETTING KEYS (stored in PlatformSetting with key prefix "branding.*"):
 *   branding.buildingName     - Building display name
 *   branding.portalTitle      - Portal page title
 *   branding.sidebarBrandText - Short text shown in sidebar header
 *   branding.logoUrl          - URL of the building logo image
 *   branding.primaryColor     - Primary brand color (hex, e.g. "#1a5c5a")
 *   branding.accentColor      - Accent brand color (hex)
 *   branding.welcomeMessage   - Welcome message on dashboard
 *
 * RELATED FILES:
 * - server/routes/platform/index.ts        - mounts this router
 * - server/app.ts                          - mounts platform router; branding GET is public
 * - shared/theme/types.ts                  - TenantTheme interface
 * - shared/theme/registry.ts               - loadTheme()
 * - prisma/schema.prisma                   - PlatformSetting model
 * - src/theme/ThemeContext.tsx              - frontend consumes this endpoint
 */

import { Router } from 'express';
import prisma from '../../db.js';
import { asyncHandler, ValidationError } from '../../middleware/errorHandler.js';
import { requireMinRole } from '../../middleware/auth.js';
import { theme as compiledTheme } from '../../theme.js';

const router = Router();

/** Keys we expose / accept through the branding API. */
const BRANDING_KEYS = [
  'branding.buildingName',
  'branding.portalTitle',
  'branding.sidebarBrandText',
  'branding.logoUrl',
  'branding.primaryColor',
  'branding.accentColor',
  'branding.welcomeMessage',
] as const;

type BrandingKey = (typeof BRANDING_KEYS)[number];

/** Map from DB key → API response field name. */
const KEY_TO_FIELD: Record<BrandingKey, string> = {
  'branding.buildingName':     'buildingName',
  'branding.portalTitle':      'portalTitle',
  'branding.sidebarBrandText': 'sidebarBrandText',
  'branding.logoUrl':          'logoUrl',
  'branding.primaryColor':     'primaryColor',
  'branding.accentColor':      'accentColor',
  'branding.welcomeMessage':   'welcomeMessage',
};

/** Compile-time fallback values from the loaded theme. */
function getDefaults(): Record<string, string> {
  return {
    buildingName:     compiledTheme.buildingName,
    portalTitle:      compiledTheme.portalTitle,
    sidebarBrandText: compiledTheme.sidebarBrandText,
    logoUrl:          compiledTheme.logoUrl,
    primaryColor:     compiledTheme.colors.primary500,
    accentColor:      compiledTheme.colors.secondary500,
    welcomeMessage:   compiledTheme.welcomeMessage,
  };
}

/**
 * GET /api/platform/branding
 *
 * Public endpoint (no auth). Returns merged branding: DB overrides compile-time defaults.
 */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.platformSetting.findMany({
      where: { key: { in: [...BRANDING_KEYS] } },
    });

    const dbValues: Record<string, string> = {};
    for (const row of rows) {
      const field = KEY_TO_FIELD[row.key as BrandingKey];
      if (field && typeof row.value === 'string') {
        dbValues[field] = row.value;
      }
    }

    // Merge: compile-time defaults first, then DB values win
    const branding = { ...getDefaults(), ...dbValues };
    res.json(branding);
  }),
);

/**
 * PUT /api/platform/branding
 *
 * Protected (EDITOR+). Accepts partial branding object and upserts into PlatformSetting.
 */
router.put(
  '/',
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const body = req.body as Record<string, unknown>;

    /** Reverse map: API field → DB key */
    const FIELD_TO_KEY: Record<string, BrandingKey> = Object.fromEntries(
      (Object.entries(KEY_TO_FIELD) as [BrandingKey, string][]).map(([k, v]) => [v, k]),
    ) as Record<string, BrandingKey>;

    const upserts: Array<{ key: string; value: string }> = [];

    for (const [field, dbKey] of Object.entries(FIELD_TO_KEY)) {
      if (field in body) {
        const val = body[field];
        if (typeof val !== 'string') {
          throw new ValidationError(`Field "${field}" must be a string`);
        }
        upserts.push({ key: dbKey, value: val });
      }
    }

    if (upserts.length === 0) {
      throw new ValidationError('No valid branding fields provided');
    }

    await Promise.all(
      upserts.map(({ key, value }) =>
        prisma.platformSetting.upsert({
          where: { key },
          create: { key, value },
          update: { value },
        }),
      ),
    );

    // Return the updated merged branding
    const rows = await prisma.platformSetting.findMany({
      where: { key: { in: [...BRANDING_KEYS] } },
    });

    const dbValues: Record<string, string> = {};
    for (const row of rows) {
      const field = KEY_TO_FIELD[row.key as BrandingKey];
      if (field && typeof row.value === 'string') {
        dbValues[field] = row.value;
      }
    }

    res.json({ ...getDefaults(), ...dbValues });
  }),
);

export default router;
