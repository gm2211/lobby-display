import { Router } from 'express';
import prisma from '../db.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

router.get('/', asyncHandler(async (_req, res) => {
  let config = await prisma.buildingConfig.findFirst();
  if (!config) {
    config = await prisma.buildingConfig.create({ data: {} });
  }
  res.json(config);
}));

router.put('/', asyncHandler(async (req, res) => {
  let config = await prisma.buildingConfig.findFirst();
  if (!config) {
    config = await prisma.buildingConfig.create({ data: req.body });
  } else {
    config = await prisma.buildingConfig.update({
      where: { id: config.id },
      data: req.body,
    });
  }
  res.json(config);
}));

export default router;
