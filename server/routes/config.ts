import { Router } from 'express';
import prisma from '../db.js';
import { asyncHandler, ValidationError } from '../middleware/errorHandler.js';

const NEW_BADGE_MODES = ['days', 'untilNextUpdate', 'off'];

function validateBadgeFields(body: Record<string, unknown>) {
  if (body.newBadgeMode !== undefined && !NEW_BADGE_MODES.includes(String(body.newBadgeMode))) {
    throw new ValidationError(`newBadgeMode must be one of: ${NEW_BADGE_MODES.join(', ')}`);
  }
  if (body.newBadgeDays !== undefined) {
    const days = Number(body.newBadgeDays);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      throw new ValidationError('newBadgeDays must be a whole number from 1 to 365');
    }
  }
}
import { invalidateThemeCache } from '../themeCSS.js';

const router = Router();

router.get('/', asyncHandler(async (_req, res) => {
  let config = await prisma.buildingConfig.findFirst();
  if (!config) {
    config = await prisma.buildingConfig.create({ data: {} });
  }
  res.json(config);
}));

router.put('/', asyncHandler(async (req, res) => {
  validateBadgeFields(req.body ?? {});
  let config = await prisma.buildingConfig.findFirst();
  if (!config) {
    config = await prisma.buildingConfig.create({ data: req.body });
  } else {
    config = await prisma.buildingConfig.update({
      where: { id: config.id },
      data: req.body,
    });
  }
  invalidateThemeCache();
  res.json(config);
}));

export default router;
