/**
 * Building config API - single-row settings (title, speeds, fonts, theme, NEW badge).
 *
 * ROUTES:
 * - GET /api/config - Read config (creates the default row on a fresh DB)
 * - PUT /api/config - Partial update. Only the fields in FIELD_RULES are accepted;
 *   unknown keys are ignored and invalid values are rejected with 400.
 *
 * GOTCHAS / AI AGENT NOTES:
 * - Never pass req.body straight to Prisma here. fontFamily/colorPrimary/colorSecondary
 *   are injected into a server-rendered <style> block (server/themeCSS.ts), so they are
 *   validated with the allow-lists in shared/theme/safeCss.ts.
 * - Adding a BuildingConfig column? Add a rule to FIELD_RULES or the API will ignore it.
 */
import { Router } from 'express';
import prisma from '../db.js';
import { asyncHandler, ValidationError } from '../middleware/errorHandler.js';
import { invalidateThemeCache } from '../themeCSS.js';
import { isHexColor, isSafeFontFamily } from '../../shared/theme/safeCss.js';

const NEW_BADGE_MODES = ['days', 'untilNextUpdate', 'off'];

type Rule = (value: unknown) => string | null; // returns an error message, or null if valid

const text = (max: number): Rule => v =>
  typeof v === 'string' && v.length <= max ? null : `must be text of at most ${max} characters`;

const int = (min: number, max: number): Rule => v =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
    ? null
    : `must be a whole number from ${min} to ${max}`;

const FIELD_RULES: Record<string, Rule> = {
  dashboardTitle: text(200),
  scrollSpeed: int(0, 100000),
  tickerSpeed: int(0, 100000),
  servicesScrollSpeed: int(0, 100000),
  servicesFontSize: int(0, 1000),
  notesFontSize: int(0, 1000),
  notesFontWeight: int(1, 1000),
  titleFontSize: int(0, 1000),
  timezone: text(100),
  logoUrl: text(2000),
  customLogos: text(20000),
  themePreset: text(100),
  fontFamily: v => (v === '' || isSafeFontFamily(v) ? null : 'contains characters that are not allowed in a font name'),
  fontScale: int(1, 1000),
  colorPrimary: v => (v === '' || isHexColor(v) ? null : 'must be a hex color like #1a2b3c'),
  colorSecondary: v => (v === '' || isHexColor(v) ? null : 'must be a hex color like #1a2b3c'),
  newBadgeMode: v => (NEW_BADGE_MODES.includes(String(v)) ? null : `must be one of: ${NEW_BADGE_MODES.join(', ')}`),
  newBadgeDays: v => {
    const days = Number(v);
    return Number.isInteger(days) && days >= 1 && days <= 365 ? null : 'must be a whole number from 1 to 365';
  },
};

/** Pick the known config fields out of a request body, validating each one. */
function parseConfigUpdate(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }
  const data: Record<string, unknown> = {};
  for (const [field, rule] of Object.entries(FIELD_RULES)) {
    const value = (body as Record<string, unknown>)[field];
    if (value === undefined) continue;
    const problem = rule(value);
    if (problem) throw new ValidationError(`${field} ${problem}`);
    data[field] = field === 'newBadgeDays' ? Number(value) : value;
  }
  return data;
}

const router = Router();

router.get('/', asyncHandler(async (_req, res) => {
  let config = await prisma.buildingConfig.findFirst({ orderBy: { id: 'asc' } });
  if (!config) {
    config = await prisma.buildingConfig.create({ data: {} });
  }
  res.json(config);
}));

router.put('/', asyncHandler(async (req, res) => {
  const data = parseConfigUpdate(req.body);
  let config = await prisma.buildingConfig.findFirst({ orderBy: { id: 'asc' } });
  if (!config) {
    config = await prisma.buildingConfig.create({ data });
  } else {
    config = await prisma.buildingConfig.update({
      where: { id: config.id },
      data,
    });
  }
  invalidateThemeCache();
  res.json(config);
}));

export default router;
